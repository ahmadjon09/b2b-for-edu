/**
 * =============================================================
 * src/utils/response.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Barcha javoblarni BIR XIL formatda qaytarish.
 *
 * MUVAFFAQIYATLI javob:
 * {
 *   "success": true,
 *   "data": { ... } yoki [ ... ],
 *   "message": "ixtiyoriy matn",
 *   "pagination": { ... }   // faqat ro'yxat (list) so'rovlarida
 *   "meta": { "requestId": "...", "timestamp": "..." }
 * }
 *
 * XATOLI javob (errorHandler chiqaradi):
 * {
 *   "success": false,
 *   "error": { "code": "NOT_FOUND", "message": "...", "details": ... },
 *   "meta": { "requestId": "...", "timestamp": "...", "path": "..." }
 * }
 *
 * NEGA? Client (mobil/veb) doim bir xil strukturaga tayanadi:
 * `if (res.success) { use res.data } else { show res.error.message }`
 * =============================================================
 */

'use strict';

/** Har bir javobga qo'shiladigan umumiy meta ma'lumot */
function buildMeta(req, extra = {}) {
  return {
    requestId: req?.requestId || null,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Muvaffaqiyatli javob yuborish.
 * @param {import('express').Response} res
 * @param {any} data javob ma'lumoti
 * @param {object} [options]
 * @param {number} [options.statusCode=200] HTTP status
 * @param {string} [options.message] qo'shimcha xabar
 * @param {object} [options.pagination] pagination bloki
 * @param {object} [options.extraMeta] meta ichiga qo'shimcha maydonlar
 */
function sendSuccess(res, data, options = {}) {
  const { statusCode = 200, message, pagination, extraMeta } = options;

  const body = { success: true };
  if (message) body.message = message;
  body.data = data === undefined ? null : data;
  if (pagination) body.pagination = pagination;
  body.meta = buildMeta(res.req, extraMeta);

  return res.status(statusCode).json(body);
}

/**
 * Yaratildi (201) javobi — POST so'rovlar uchun qulay qisqartma.
 */
function sendCreated(res, data, message = 'Muvaffaqiyatli yaratildi', extraMeta) {
  return sendSuccess(res, data, { statusCode: 201, message, extraMeta });
}

/**
 * Ro'yxat (list) javobi — data + pagination birga.
 */
function sendPaginated(res, data, pagination, message) {
  return sendSuccess(res, data, { pagination, message });
}

/**
 * Xato javobi. Odatda to'g'ridan-to'g'ri chaqirilmaydi —
 * errorHandler middleware ishlatadi.
 */
function sendError(res, { statusCode = 500, code = 'INTERNAL_ERROR', message, details, stack }) {
  const body = {
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    meta: buildMeta(res.req, { path: res.req?.originalUrl, method: res.req?.method }),
  };
  if (stack) body.error.stack = stack;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess, sendCreated, sendPaginated, sendError, buildMeta };
