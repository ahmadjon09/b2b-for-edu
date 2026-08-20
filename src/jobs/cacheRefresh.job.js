/**
 * =============================================================
 * src/jobs/cacheRefresh.job.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: In-memory (RAM) cache'ni DB bilan DAVRIY ravishda
 * sinxronlab turish — default har 5 daqiqada.
 *
 * -------------------------------------------------------------
 * NEGA BU KERAK? (juniorlar uchun batafsil)
 * -------------------------------------------------------------
 * Bizning cache "event-driven" (hodisaga asoslangan): mahsulot
 * yaratilsa/o'zgartirilsa/o'chirilsa — cache DARHOL yangilanadi.
 * Bu tez, lekin YETARLI EMAS. Chunki DB API'dan tashqarida ham
 * o'zgarishi mumkin:
 *
 *   1) Kimdir `psql` yoki Prisma Studio orqali qo'lda yozuv
 *      o'zgartirdi  -> cache buni BILMAYDI.
 *   2) `npm run seed` qayta ishga tushirildi -> DB o'zgardi,
 *      cache eski holatda qoldi.
 *   3) Background DB yozuvi (syncQueue) xato bilan tugadi va
 *      rollback qilindi -> cache va DB bir zumga farq qilishi
 *      mumkin.
 *   4) Server bir nechta nusxada (instance) ishlayapti: A nusxa
 *      mahsulot yaratdi, B nusxaning RAM'ida u yo'q.
 *      (Aynan shu muammoni production'da Redis hal qiladi —
 *       pastdagi "PRODUCTION" izohiga qarang.)
 *
 * Shuning uchun cache uch xil yo'l bilan yangilanadi:
 *
 *   A) HODISA ASOSIDA  — CRUD paytida darhol (eng tez)
 *   B) QO'LDA          — ADMIN `POST /api/v1/system/cache-reload`
 *   C) AVTOMATIK       — SHU FAYL: har N daqiqada to'liq warm-up
 *
 * C varianti "safety net" (himoya to'ri) rolini o'ynaydi: agar
 * A yoki B biror sababga ko'ra ishlamay qolsa, eng ko'pi bilan
 * N daqiqadan keyin cache DB bilan tenglashadi.
 *
 * -------------------------------------------------------------
 * SOZLASH
 * -------------------------------------------------------------
 *   .env faylida:  CACHE_REFRESH_INTERVAL_MINUTES=5
 *   Qiymat `0` bo'lsa — avtomatik yangilash BUTUNLAY o'chadi
 *   (masalan testlarda yoki debug paytida keraksiz shovqinni
 *    yo'qotish uchun).
 *
 * -------------------------------------------------------------
 * PRODUCTIONDA QANDAY BO'LISHI KERAK EDI?
 * -------------------------------------------------------------
 * Bu yerda `setInterval` ishlatilgan — sodda va qo'shimcha
 * kutubxona talab qilmaydi. Lekin real loyihada:
 *
 *   - Redis (yoki Memcached) ishlatilardi. U barcha server
 *     nusxalari uchun UMUMIY xotira bo'lgani sababli "har bir
 *     nusxada alohida cache" muammosi umuman tug'ilmaydi.
 *   - Redis Pub/Sub orqali bir nusxa "product:123 o'zgardi" deb
 *     e'lon qilsa, qolganlari darhol eshitadi — 5 daqiqa kutish
 *     shart emas.
 *   - Vaqt jadvali bo'yicha ishlar `node-cron`, BullMQ yoki
 *     Kubernetes CronJob orqali boshqarilardi.
 *
 * Bu demo loyihada Redis ATAYLAB ishlatilmagan: maqsad — cache
 * mexanizmining ICHKI ISHLASHINI qo'lda yozib ko'rish.
 * =============================================================
 */

'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { warmUpCache } = require('../cache/warmup');

/** setInterval qaytargan taymer identifikatori (to'xtatish uchun kerak) */
let intervalHandle = null;

/**
 * Bir vaqtning o'zida ikkita yangilanish ketmasligi uchun "qulf".
 *
 * NEGA? Agar DB sekin bo'lsa, oldingi warm-up hali tugamasdan
 * keyingi interval kelib qolishi mumkin. U holda ikkita og'ir
 * so'rov parallel ketadi va DB'ga keraksiz yuk tushadi.
 */
let isRunning = false;

/** Statistika — `GET /api/v1/system/cache` javobida ko'rsatiladi */
const stats = {
  enabled: false,
  intervalMinutes: 0,
  runCount: 0,
  successCount: 0,
  failureCount: 0,
  skippedCount: 0,
  lastRunAt: null,
  lastSuccessAt: null,
  lastDurationMs: null,
  lastError: null,
  nextRunAt: null,
};

/**
 * Cache'ni bir marta yangilaydi.
 *
 * MUHIM: bu funksiya HECH QACHON `throw` qilmaydi. Fon jarayonidagi
 * yutilmagan xato (unhandled rejection) butun Node.js jarayonini
 * o'ldirishi mumkin — buni yo'l qo'yib bo'lmaydi.
 *
 * @param {'auto'|'manual'} trigger - kim chaqirdi (log uchun)
 * @returns {Promise<{ok:boolean, skipped?:boolean, counts?:object, error?:string}>}
 */
async function runCacheRefreshOnce(trigger = 'auto') {
  // Qulf band bo'lsa — bu safar o'tkazib yuboramiz
  if (isRunning) {
    stats.skippedCount += 1;
    logger.warn(
      "Cache avtomatik yangilash o'tkazib yuborildi: oldingi yangilanish hali tugamagan " +
        `(o'tkazib yuborilganlar: ${stats.skippedCount})`
    );
    return { ok: false, skipped: true };
  }

  isRunning = true;
  const startedAt = Date.now();
  stats.runCount += 1;
  stats.lastRunAt = new Date().toISOString();

  try {
    logger.cache(`Cache davriy yangilanmoqda (trigger: ${trigger})...`);

    // warmUpCache() o'zi ham xatoni ushlab {ok:false} qaytaradi
    const result = await warmUpCache();
    stats.lastDurationMs = Date.now() - startedAt;

    if (result.ok) {
      stats.successCount += 1;
      stats.lastSuccessAt = new Date().toISOString();
      stats.lastError = null;
      logger.success(
        `Cache davriy yangilandi (${stats.lastDurationMs}ms) — ` +
          Object.entries(result.counts).map(([k, v]) => `${k}=${v}`).join(', ')
      );
    } else {
      stats.failureCount += 1;
      stats.lastError = result.error || "noma'lum xato";
      // DIQQAT: bu FALOKAT emas. Cache eski ma'lumot bilan ishlashda
      // davom etadi, keyingi interval yana urinib ko'radi.
      logger.error(
        `Cache davriy yangilanishi amalga oshmadi: ${stats.lastError}. ` +
          "Eski cache saqlanib qoladi, keyingi urinish rejalashtirildi."
      );
    }

    scheduleNextRunTimestamp();
    return result;
  } catch (error) {
    // Bu yerga tushish deyarli imkonsiz, lekin "deyarli" — kafolat emas
    stats.failureCount += 1;
    stats.lastDurationMs = Date.now() - startedAt;
    stats.lastError = error.message;
    logger.error('Cache davriy yangilashda kutilmagan xato', error);
    scheduleNextRunTimestamp();
    return { ok: false, error: error.message };
  } finally {
    // `finally` — xato bo'lsa ham qulf ALBATTA bo'shatiladi
    isRunning = false;
  }
}

/** Keyingi ishga tushish vaqtini hisoblab, statistikaga yozadi */
function scheduleNextRunTimestamp() {
  if (!stats.enabled) {
    stats.nextRunAt = null;
    return;
  }
  stats.nextRunAt = new Date(Date.now() + stats.intervalMinutes * 60 * 1000).toISOString();
}

/**
 * Davriy yangilash job'ini ishga tushiradi.
 * `server.js` bootstrap ichidan, warmUpCache() dan KEYIN chaqiriladi.
 */
function startCacheRefreshJob() {
  const minutes = env.CACHE_REFRESH_INTERVAL_MINUTES;

  // 0 yoki manfiy qiymat -> avtomatik yangilash o'chirilgan
  if (!minutes || minutes <= 0) {
    stats.enabled = false;
    stats.intervalMinutes = 0;
    logger.warn(
      "Cache avtomatik yangilash O'CHIRILGAN (CACHE_REFRESH_INTERVAL_MINUTES=0). " +
        "Cache faqat CRUD hodisalarida va ADMIN'ning qo'lda reload'ida yangilanadi."
    );
    return;
  }

  // Ikki marta ishga tushib qolmasin (masalan testlarda)
  if (intervalHandle) {
    logger.warn("Cache yangilash job'i allaqachon ishlamoqda — qayta ishga tushirilmadi");
    return;
  }

  stats.enabled = true;
  stats.intervalMinutes = minutes;

  const intervalMs = minutes * 60 * 1000;
  intervalHandle = setInterval(() => {
    // Natijani kutmaymiz (fire-and-forget), lekin `.catch` bilan
    // himoyalaymiz — unhandled rejection bo'lmasligi uchun.
    runCacheRefreshOnce('auto').catch((err) =>
      logger.error("Cache job: kutilmagan rejection", err)
    );
  }, intervalMs);

  // unref(): bu taymer Node.js jarayonini "tirik" ushlab turmasin.
  // Aks holda `Ctrl+C` bosilganda server darhol yopilmasligi mumkin.
  intervalHandle.unref();

  scheduleNextRunTimestamp();

  logger.info(
    `Cache avtomatik yangilash job'i yoqildi: har ${minutes} daqiqada ` +
      `to'liq warm-up (keyingisi ~${stats.nextRunAt})`
  );
}

/** Job'ni to'xtatish (graceful shutdown paytida chaqiriladi) */
function stopCacheRefreshJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    stats.enabled = false;
    stats.nextRunAt = null;
    logger.info("Cache avtomatik yangilash job'i to'xtatildi");
  }
}

/** Joriy statistikani qaytaradi (nusxa — tashqaridan o'zgartirib bo'lmasin) */
function getCacheRefreshStats() {
  return { ...stats, isRunningNow: isRunning };
}

module.exports = {
  startCacheRefreshJob,
  stopCacheRefreshJob,
  runCacheRefreshOnce,
  getCacheRefreshStats,
};
