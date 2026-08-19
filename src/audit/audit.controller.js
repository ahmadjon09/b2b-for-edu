/**
 * =============================================================
 * src/audit/audit.controller.js
 * -------------------------------------------------------------
 * Audit loglarni ko'rish — FAQAT ADMIN uchun.
 * =============================================================
 */

'use strict';

const service = require('./audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/response');
const logger = require('../utils/logger');

/** GET /api/v1/audit-logs — sahifalangan ro'yxat */
const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.listAuditLogs(req.validatedQuery || req.query);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/audit-logs/stats — umumiy statistika */
const stats = asyncHandler(async (req, res) => {
  const data = await service.getAuditStats();
  return sendSuccess(res, data);
});

/** GET /api/v1/audit-logs/actions — mavjud action turlari ro'yxati */
const actions = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    actions: Object.values(service.AUDIT_ACTIONS),
    description: "Bu ro'yxatdagi qiymatlarni `?action=` filtri sifatida ishlatishingiz mumkin",
  });
});

/**
 * POST /api/v1/audit-logs/cleanup — eski loglarni QO'LDA tozalash.
 * Odatda buni fon jarayoni (auditCleanup.job.js) o'zi bajaradi,
 * lekin admin xohlasa darhol ishga tushirishi mumkin.
 */
const cleanup = asyncHandler(async (req, res) => {
  const deleted = await service.cleanupOldLogs();
  logger.info(`Admin (${req.user.email}) audit tozalashni qo'lda ishga tushirdi: ${deleted} ta yozuv`);
  return sendSuccess(
    res,
    { deletedCount: deleted },
    { message: `${deleted} ta eski audit yozuvi o'chirildi` }
  );
});

module.exports = { list, stats, actions, cleanup };
