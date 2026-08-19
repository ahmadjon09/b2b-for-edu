/**
 * =============================================================
 * src/utils/helpers.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kichik, umumiy yordamchi funksiyalar. Bir nechta
 * modulda takrorlanadigan mayda mantiq shu yerga yig'iladi.
 * =============================================================
 */

'use strict';

const crypto = require('crypto');

/**
 * Prisma `Decimal` tipini oddiy JS number'ga aylantiradi.
 * NEGA? Prisma Decimal'ni obyekt sifatida qaytaradi va u JSON'da
 * `{"s":1,"e":4,"d":[...]}` ko'rinishida chiqib qoladi. Client uchun
 * esa oddiy son kerak.
 */
function toNumber(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber(); // Prisma.Decimal
  return Number(value);
}

/**
 * Pul summasini 2 xonagacha yaxlitlaydi (0.1 + 0.2 = 0.30000000000000004 muammosi).
 */
function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Obyektdan berilgan maydonlarni olib tashlaydi (masalan passwordHash).
 * @param {object} obj
 * @param {string[]} keys
 */
function omit(obj, keys = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  keys.forEach((k) => delete clone[k]);
  return clone;
}

/**
 * Obyektdan faqat kerakli maydonlarni oladi.
 */
function pick(obj, keys = []) {
  const out = {};
  keys.forEach((k) => {
    if (obj && obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

/**
 * Foydalanuvchini clientga yuborishdan oldin "tozalaydi":
 * passwordHash hech qachon tashqariga chiqmasligi kerak.
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

/**
 * UUID v4 generatsiya qiladi (cache'da optimistik id berish uchun).
 */
function uuid() {
  return crypto.randomUUID();
}

/**
 * Satrni SHA-256 bilan hash qiladi (refresh tokenni DB'da saqlash uchun).
 */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Berilgan millisekund kutadi (retry-with-backoff uchun).
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Qidiruv uchun matnni normallashtiradi (registrga sezgir bo'lmasin).
 */
function normalize(text) {
  return String(text ?? '').trim().toLowerCase();
}

/**
 * Chuqur nusxa (deep clone) — cache'dagi obyektni tashqariga
 * berishdan oldin nusxalash uchun. Shunda tashqarida kimdir
 * obyektni o'zgartirsa, cache buzilmaydi.
 */
function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
  return out;
}

module.exports = { toNumber, round2, omit, pick, sanitizeUser, uuid, sha256, sleep, normalize, deepClone };
