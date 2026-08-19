/**
 * =============================================================
 * src/audit/audit.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: "Kim, nima qildi, qachon" jurnalini yuritish.
 *
 * QOIDA: har qanday CREATE / UPDATE / DELETE amali audit logga
 * tushadi. Bu:
 *   - xavfsizlik uchun (kim mahsulotni o'chirdi?)
 *   - nizolarni hal qilish uchun (narxni kim o'zgartirdi?)
 *   - debug uchun kerak.
 *
 * MUHIM XUSUSIYAT: `logAudit()` funksiyasi HECH QACHON xato
 * tashlamaydi va HECH QACHON kutilmaydi (await qilinmaydi).
 * Sababi: audit yozuvi yozilmagani uchun foydalanuvchining
 * asosiy amali (masalan mahsulot yaratish) buzilmasligi kerak.
 * Log — yordamchi narsa, asosiy oqimni to'xtatmasligi shart.
 *
 * SAQLASH MUDDATI: faqat oxirgi AUDIT_LOG_RETENTION_DAYS kun
 * (default 7). Eskilari `src/jobs/auditCleanup.job.js` orqali
 * avtomatik o'chiriladi.
 * =============================================================
 */

'use strict';

const { prisma } = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const { getPaginationParams, buildPagination } = require('../utils/pagination');

/** Standart amal (action) nomlari */
const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  REFRESH_TOKEN: 'REFRESH_TOKEN',
  STATUS_CHANGE: 'STATUS_CHANGE',
  UPLOAD: 'UPLOAD',
  DB_SYNC_FAILED: 'DB_SYNC_FAILED',
  SERVER_ERROR: 'SERVER_ERROR',
  CLEANUP: 'CLEANUP',
};

/**
 * Audit yozuvini yaratadi — "yon(fire-and-forget)" usulida.
 * Ya'ni chaqiruvchi kutmaydi, xato bo'lsa faqat konsolga yoziladi.
 *
 * @param {object} params
 * @param {string|null} params.userId  amalni bajargan foydalanuvchi
 * @param {string} params.action       CREATE | UPDATE | DELETE ...
 * @param {string} params.entity       Product | Order | User ...
 * @param {string|null} [params.entityId]
 * @param {object} [params.meta]       qo'shimcha ma'lumot (ip, o'zgarishlar)
 */
function logAudit({ userId = null, action, entity, entityId = null, meta = {} }) {
  // Fonda bajaramiz — so'rov oqimini bloklamaydi
  setImmediate(async () => {
    try {
      await prisma.auditLog.create({
        data: {
          userId: userId || null,
          action: String(action).slice(0, 60),
          entity: String(entity).slice(0, 60),
          entityId: entityId ? String(entityId) : null,
          meta: sanitizeMeta(meta),
        },
      });
    } catch (error) {
      // Audit yozilmadi — bu jiddiy emas, lekin bilib turishimiz kerak
      logger.warn(`Audit log yozilmadi (${action} ${entity}): ${error.message}`);
    }
  });
}

/**
 * meta ichidan maxfiy maydonlarni olib tashlaydi.
 * Parol, token kabi narsalar HECH QACHON logga tushmasligi kerak!
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const forbidden = ['password', 'passwordHash', 'newPassword', 'oldPassword', 'token', 'accessToken', 'refreshToken', 'authorization'];
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (forbidden.includes(key)) {
      clean[key] = '***yashirilgan***';
    } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      clean[key] = sanitizeMeta(value);
    } else {
      clean[key] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return clean;
}

/**
 * Express so'rovidan foydali kontekstni yig'ib beradi (ip, user-agent).
 */
function requestMeta(req, extra = {}) {
  return {
    ip: req.ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    requestId: req.requestId,
    ...extra,
  };
}

/**
 * Audit loglarni sahifalab o'qish (faqat ADMIN uchun).
 * Bu yerda cache ISHLATILMAYDI — audit loglar to'g'ridan-to'g'ri
 * DB'dan o'qiladi, chunki ular "haqiqat manbai" bo'lishi kerak.
 *
 * @param {object} query req.query
 */
async function listAuditLogs(query = {}) {
  const { page, limit, skip } = getPaginationParams(query);

  // --- Filtrlar ---
  const where = {};
  if (query.userId) where.userId = String(query.userId);
  if (query.action) where.action = String(query.action).toUpperCase();
  if (query.entity) where.entity = String(query.entity);
  if (query.entityId) where.entityId = String(query.entityId);

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};
    if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
    if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
  }

  // --- Saralash ---
  const allowedSort = ['createdAt', 'action', 'entity'];
  const sortBy = allowedSort.includes(query.sortBy) ? query.sortBy : 'createdAt';
  const order = String(query.order).toLowerCase() === 'asc' ? 'asc' : 'desc';

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data: rows, pagination: buildPagination(total, page, limit) };
}

/**
 * Muddati o'tgan (eski) loglarni o'chiradi.
 * @returns {Promise<number>} o'chirilgan yozuvlar soni
 */
async function cleanupOldLogs() {
  const cutoff = new Date(Date.now() - env.AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });

  if (result.count > 0) {
    logger.info(
      `Audit tozalash: ${result.count} ta eski yozuv o'chirildi ` +
        `(${env.AUDIT_LOG_RETENTION_DAYS} kundan eski, ${cutoff.toISOString().slice(0, 10)} gacha)`
    );
  }
  return result.count;
}

/**
 * Audit statistikasi (admin dashboard uchun).
 */
async function getAuditStats() {
  const [total, byAction, byEntity, oldest] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ['action'], _count: { action: true } }),
    prisma.auditLog.groupBy({ by: ['entity'], _count: { entity: true } }),
    prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);

  return {
    totalLogs: total,
    retentionDays: env.AUDIT_LOG_RETENTION_DAYS,
    oldestLogAt: oldest?.createdAt || null,
    byAction: byAction.map((a) => ({ action: a.action, count: a._count.action })),
    byEntity: byEntity.map((e) => ({ entity: e.entity, count: e._count.entity })),
  };
}

module.exports = { logAudit, listAuditLogs, cleanupOldLogs, getAuditStats, requestMeta, sanitizeMeta, AUDIT_ACTIONS };
