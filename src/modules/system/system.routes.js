/**
 * =============================================================
 * src/modules/system/system.routes.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Texnik ("service") endpointlar — sog'liq
 * tekshiruvi, cache statistikasi va cache-ni qayta yuklash.
 *
 * NEGA KERAK? Cache mexanizmi "ko'rinmas" ishlaydi. Bu
 * endpointlar orqali uning ichida nima bo'layotganini
 * ko'rishingiz mumkin — o'rganish uchun juda foydali.
 * =============================================================
 */

'use strict';

const express = require('express');
const { z } = require('zod');
const { prisma } = require('../../config/db');
const cache = require('../../cache/cacheManager');
const syncQueue = require('../../cache/syncQueue');
const { warmUpCache, reloadResource } = require('../../cache/warmup');
const { getCacheRefreshStats, runCacheRefreshOnce } = require('../../jobs/cacheRefresh.job');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middlewares/validate');
const { sendSuccess } = require('../../utils/response');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { ApiError } = require('../../utils/ApiError');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const router = express.Router();

/**
 * GET /api/v1/system/health
 * Monitoring uchun. DB'ga oddiy so'rov yuborib, javob berishini tekshiradi.
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    let dbOk = false;
    let dbLatencyMs = null;

    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
      dbOk = true;
    } catch (error) {
      logger.error('Health check: DB javob bermadi', error);
    }

    const payload = {
      status: dbOk ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
      database: { connected: dbOk, latencyMs: dbLatencyMs },
      cache: { warmedUp: cache.isReady(), ...summarizeCache() },
      syncQueue: syncQueue.getStats(),
      memory: {
        heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)),
        rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      },
    };

    if (!dbOk) {
      // 503 qaytaramiz — load balancer bu serverga so'rov yubormasligi uchun
      return res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: "Ma'lumotlar bazasi javob bermayapti", details: payload },
        meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
      });
    }

    return sendSuccess(res, payload);
  })
);

/**
 * GET /api/v1/system/cache-stats — faqat ADMIN
 */
router.get(
  '/cache-stats',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    return sendSuccess(res, {
      stores: cache.getAllStats(),
      syncQueue: syncQueue.getStats(),
      isReady: cache.isReady(),
      // Avtomatik (davriy) yangilash job'ining holati.
      // Manba: src/jobs/cacheRefresh.job.js
      autoRefresh: getCacheRefreshStats(),
      explanation:
        "`hits` — cache'dan topilgan so'rovlar, `misses` — topilmay DB'ga borilganlar. " +
        "`queue.pending` — DB'ga yozilishini kutayotgan amallar soni. " +
        "Agar `pending` doim o'sib borsa — DB sekin ishlayapti yoki xato bermoqda. " +
        "`autoRefresh` — cache'ni har CACHE_REFRESH_INTERVAL_MINUTES daqiqada " +
        "DB bilan tenglashtiruvchi fon job'ining statistikasi.",
    });
  })
);

/**
 * POST /api/v1/system/cache-reload — faqat ADMIN
 */
const reloadSchema = z.object({
  resource: z.enum(['users', 'categories', 'products', 'orders', 'all']).optional().default('all'),
});

router.post(
  '/cache-reload',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: reloadSchema }),
  asyncHandler(async (req, res) => {
    const resource = req.body.resource || 'all';

    // Avval navbatdagi yozuvlar DB'ga tushib bo'lishini kutamiz,
    // aks holda eski ma'lumotni qayta yuklab qo'yamiz!
    await syncQueue.drain(10_000);

    let result;
    if (resource === 'all') {
      result = await warmUpCache();
    } else {
      const count = await reloadResource(resource);
      result = { [resource]: count };
    }

    logger.info(`Admin (${req.user.email}) cache-ni qayta yukladi: ${resource}`);

    return sendSuccess(
      res,
      {
        reloaded: resource,
        counts: result,
        // Qo'lda reload avtomatik job'ni BEKOR QILMAYDI — ikkalasi
        // birga ishlaydi. Keyingi avtomatik yangilanish vaqti:
        autoRefresh: getCacheRefreshStats(),
      },
      { message: 'Cache qayta yuklandi' }
    );
  })
);

/**
 * POST /api/v1/system/cache-refresh-now — faqat ADMIN
 * -------------------------------------------------------------
 * `cache-reload` dan farqi nimada?
 *
 *   /cache-reload        -> warm-up'ni TO'G'RIDAN-TO'G'RI chaqiradi,
 *                           bitta resursni ham yangilay oladi.
 *   /cache-refresh-now   -> AVTOMATIK job'ning aynan o'zini qo'lda
 *                           ishga tushiradi: "qulf" (bir vaqtda ikkita
 *                           yangilanish bo'lmasligi) va statistika
 *                           hisoblagichlari ham ishlaydi.
 *
 * Ya'ni bu endpoint "5 daqiqa kutmasdan, hozir yangila" tugmasi.
 */
router.post(
  '/cache-refresh-now',
  authenticate,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    // Navbatdagi DB yozuvlari tugasin, aks holda eski holatni yuklaymiz
    await syncQueue.drain(10_000);

    const result = await runCacheRefreshOnce('manual');

    if (result.skipped) {
      // Ayni damda boshqa yangilanish ketyapti — bu xato emas, holat
      return sendSuccess(
        res,
        { refreshed: false, reason: 'BUSY', autoRefresh: getCacheRefreshStats() },
        { message: "Yangilanish allaqachon ketmoqda — bu chaqiruv o'tkazib yuborildi" }
      );
    }

    if (!result.ok) {
      throw ApiError.serviceUnavailable(
        `Cache yangilanmadi: ${result.error}. Eski cache saqlanib qoldi.`
      );
    }

    logger.info(`Admin (${req.user.email}) cache'ni qo'lda majburiy yangiladi`);

    return sendSuccess(
      res,
      { refreshed: true, counts: result.counts, autoRefresh: getCacheRefreshStats() },
      { message: "Cache DB bilan tenglashtirildi" }
    );
  })
);

/** Cache omborlaridagi yozuvlar sonini qisqacha ko'rsatadi */
function summarizeCache() {
  return {
    users: cache.users.size(),
    categories: cache.categories.size(),
    products: cache.products.size(),
    orders: cache.orders.size(),
    orderItems: cache.orderItems.size(),
  };
}

module.exports = router;
