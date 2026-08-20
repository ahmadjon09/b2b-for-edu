/**
 * =============================================================
 * server.js  — LOYIHANING KIRISH NUQTASI (entry point)
 * -------------------------------------------------------------
 * MAS'ULIYATI: Ilovani to'g'ri tartibda ishga tushirish va
 * to'g'ri tartibda to'xtatish.
 *
 * ISHGA TUSHISH TARTIBI:
 *   1) .env ni o'qish va tekshirish  (config/env.js ichida)
 *   2) DB ga ulanish                 (connectDatabase)
 *   3) Cache'ni DB'dan to'ldirish    (warmUpCache)
 *   4) Cache avtomatik yangilash job'i  (startCacheRefreshJob)
 *   5) Audit tozalash job'ini yoqish (startAuditCleanupJob)
 *   5) HTTP portni ochish            (app.listen)
 *   6) Signal handler'larni ulash    (SIGINT / SIGTERM)
 *
 * NEGA AYNAN SHU TARTIB?
 *   - Cache'ni to'ldirishdan oldin DB ulanmagan bo'lsa — warm-up
 *     yiqiladi.
 *   - Portni cache to'lgandan KEYIN ochamiz, aks holda birinchi
 *     so'rovlar bo'sh cache'ni ko'rib "hech narsa yo'q" deydi.
 *
 * TO'XTASH TARTIBI (teskari!):
 *   1) yangi so'rovlarni qabul qilishni to'xtatish (server.close)
 *   2) navbatdagi DB yozuvlarini tugatish (syncQueue.drain)
 *   3) job'ni o'chirish, DB ulanishini yopish
 *   Aks holda cache'da turgan, DB'ga hali yozilmagan ma'lumot
 *   YO'QOLADI.
 * =============================================================
 */

'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDatabase, disconnectDatabase } = require('./src/config/db');
const { warmUpCache } = require('./src/cache/warmup');
const syncQueue = require('./src/cache/syncQueue');
const { startAuditCleanupJob, stopAuditCleanupJob } = require('./src/jobs/auditCleanup.job');
const { startCacheRefreshJob, stopCacheRefreshJob } = require('./src/jobs/cacheRefresh.job');
const { registerProcessErrorHandlers } = require('./src/middlewares/errorHandler');

/** Konsolga chiroyli "banner" chiqaramiz — foydalanuvchi nima ochishni bilsin */
function printBanner(port) {
  const line = '═'.repeat(58);
  const base = `http://localhost:${port}`;
  console.log(`
╔${line}╗
║  🚀  B2B DEMO API ishga tushdi
╠${line}╣
║  Rejim (NODE_ENV) : ${env.NODE_ENV}
║  Port             : ${port}
║  API ildizi       : ${base}/api/v1
║  Swagger UI       : ${base}/api-docs
║  OpenAPI JSON     : ${base}/api-docs.json
║  HTML qo'llanma   : ${base}/docs
║  Sog'liq (health) : ${base}/api/v1/system/health
╠${line}╣
║  Demo admin       : ${env.SEED_ADMIN_EMAIL} / ${env.SEED_ADMIN_PASSWORD}
║  (avval \`npm run seed\` buyrug'ini bajaring)
╚${line}╝
`);
}

async function bootstrap() {
  try {
    logger.info("Server ishga tushirilmoqda...");

    /* --- 1-qadam: DB --- */
    await connectDatabase();

    /* --- 2-qadam: Cache warm-up ---
     * Bu qadam yiqilsa ham serverni to'xtatmaymiz: cache bo'sh
     * qoladi, lekin service'lar `isWarmedUp === false` bo'lsa
     * to'g'ridan-to'g'ri DB'ga murojaat qiladi (fallback bor).
     */
    try {
      await warmUpCache();
    } catch (error) {
      logger.error("Cache warm-up muvaffaqiyatsiz — server DB fallback rejimida ishlaydi", error);
    }

    /* --- 3-qadam: Cache'ni avtomatik yangilab turuvchi job ---
     * Cache uch xil yo'l bilan yangilanadi:
     *   (a) CRUD hodisalarida  — darhol (service'lar ichida)
     *   (b) ADMIN qo'lda       — POST /api/v1/system/cache-reload
     *   (c) AVTOMATIK          — mana shu job, har
     *       CACHE_REFRESH_INTERVAL_MINUTES daqiqada (default 5).
     * Batafsil izoh: src/jobs/cacheRefresh.job.js
     */
    startCacheRefreshJob();

    /* --- 4-qadam: Audit loglarni avtomatik tozalash job'i --- */
    startAuditCleanupJob();

    /* --- 5-qadam: HTTP server --- */
    const port = env.PORT;
    const server = app.listen(port, '0.0.0.0', () => {
      printBanner(port);
    });

    // Portni band bo'lishi kabi listen xatolarini tushunarli qilib beramiz
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`${port}-port band. .env dagi PORT ni o'zgartiring yoki portni bo'shating`);
      } else {
        logger.error('HTTP server xatosi', error);
      }
      process.exit(1);
    });

    // Sekin clientlar ulanishini uzib yubormaslik uchun
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 70_000;

    /* --- 6-qadam: Graceful shutdown va global xato handlerlari --- */
    registerProcessErrorHandlers({
      server,
      onShutdown: async () => {
        // (a) Cache'da turgan, DB'ga hali yozilmagan vazifalarni tugatamiz
        logger.info("Navbatdagi DB yozuvlari tugatilmoqda (syncQueue.drain)...");
        const drained = await syncQueue.drain(10_000);
        if (!drained) {
          logger.warn("Navbat to'liq bo'shamadi — ba'zi yozuvlar yo'qolgan bo'lishi mumkin");
        }

        // (b) Fon job'larini to'xtatamiz (yangi taymer ishga tushmasin)
        stopCacheRefreshJob();
        stopAuditCleanupJob();

        // (c) DB ulanishini yopamiz
        await disconnectDatabase();
      },
    });

    return server;
  } catch (error) {
    logger.error("Server ishga tushmadi", error);
    // DB ulanmagan bo'lsa ham, ochilgan ulanishlarni yopishga harakat qilamiz
    await disconnectDatabase().catch(() => {});
    process.exit(1);
  }
}

// Bu fayl to'g'ridan-to'g'ri ishga tushirilgandagina serverni ochamiz.
// (test faylida `require('./server')` qilinsa, port ochilmasin)
if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap };
