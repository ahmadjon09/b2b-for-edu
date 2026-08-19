/**
 * =============================================================
 * src/jobs/auditCleanup.job.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Muddati o'tgan audit loglarni davriy ravishda
 * o'chirib turish (default: 7 kundan eskilari).
 *
 * QANDAY ISHLAYDI?
 *   1) Server ishga tushganda darhol bir marta tozalaydi
 *   2) So'ng har AUDIT_CLEANUP_INTERVAL_HOURS soatda takrorlaydi
 *
 * NEGA `node-cron` EMAS? Oddiy `setInterval` yetarli va qo'shimcha
 * kutubxona kerak emas — junior dasturchi uchun tushunarliroq.
 * Productionda esa alohida cron xizmat (yoki Kubernetes CronJob)
 * ishlatilgani ma'qul, chunki serverning bir nechta nusxasi
 * bo'lsa, tozalash bir necha marta takrorlanmasligi kerak.
 * =============================================================
 */

'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { cleanupOldLogs, logAudit, AUDIT_ACTIONS } = require('../audit/audit.service');

let intervalHandle = null;

/**
 * Tozalashni bir marta bajaradi (xatoni yutadi — server yiqilmasin).
 */
async function runCleanupOnce() {
  try {
    const deleted = await cleanupOldLogs();
    if (deleted > 0) {
      logAudit({
        userId: null,
        action: AUDIT_ACTIONS.CLEANUP,
        entity: 'AuditLog',
        meta: { deletedCount: deleted, retentionDays: env.AUDIT_LOG_RETENTION_DAYS },
      });
    }
    return deleted;
  } catch (error) {
    logger.error('Audit loglarni tozalashda xato', error);
    return 0;
  }
}

/**
 * Davriy tozalashni ishga tushiradi.
 */
function startAuditCleanupJob() {
  const intervalMs = env.AUDIT_CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;

  // 1) Server startida — biroz kechikish bilan (DB tayyor bo'lishi uchun)
  setTimeout(runCleanupOnce, 5000);

  // 2) Davriy takrorlash
  intervalHandle = setInterval(runCleanupOnce, intervalMs);
  // unref: bu taymer Node.js jarayonini "tirik" ushlab turmasin
  intervalHandle.unref();

  logger.info(
    `Audit tozalash job'i yoqildi: har ${env.AUDIT_CLEANUP_INTERVAL_HOURS} soatda, ` +
      `${env.AUDIT_LOG_RETENTION_DAYS} kundan eski loglar o'chiriladi`
  );
}

/** Job'ni to'xtatish (shutdown paytida) */
function stopAuditCleanupJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info("Audit tozalash job'i to'xtatildi");
  }
}

module.exports = { startAuditCleanupJob, stopAuditCleanupJob, runCleanupOnce };
