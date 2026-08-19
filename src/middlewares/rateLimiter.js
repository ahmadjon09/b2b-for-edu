/**
 * =============================================================
 * src/middlewares/rateLimiter.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Bir foydalanuvchi/IP juda ko'p so'rov yuborib
 * serverni "bo'g'ib" qo'yishining oldini olish (rate limiting).
 *
 * BIZDA 3 XIL LIMIT BOR:
 *   1) globalLimiter — butun API uchun: 100 so'rov / 1 daqiqa
 *   2) authLimiter   — login/register uchun qattiq: 5 so'rov / 1 daqiqa
 *      (parolni brute-force qilishning oldini oladi)
 *   3) writeLimiter  — create/update/delete uchun o'rtacha limit
 *
 * KALIT (key) QANDAY TANLANADI?
 *   - Agar foydalanuvchi tizimga kirgan bo'lsa — uning user id'si
 *   - Aks holda — IP manzili
 *   Shunday qilib bitta IP ortidagi (masalan ofis Wi-Fi) turli
 *   foydalanuvchilar bir-biriga xalaqit bermaydi.
 * =============================================================
 */

'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { ApiError } = require('../utils/ApiError');

/**
 * Limit kalitini aniqlaydi: user id yoki IP.
 */
function keyGenerator(req) {
  if (req.user?.id) return `user:${req.user.id}`;
  // express-rate-limit v7 da IPv6 uchun ipKeyGenerator tavsiya etiladi
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

/**
 * Limit oshganda ishlaydigan handler — bizning standart xato
 * formatimizda javob berish uchun errorHandler'ga uzatamiz.
 */
function limitReachedHandler(req, res, next, options) {
  const retryAfterSec = Math.ceil(options.windowMs / 1000);
  next(
    ApiError.tooManyRequests(
      `Juda ko'p so'rov yubordingiz. Iltimos, ${retryAfterSec} soniyadan keyin qayta urinib ko'ring`,
      { limit: options.max, windowMs: options.windowMs, retryAfterSeconds: retryAfterSec }
    )
  );
}

/** Umumiy sozlamalar (hamma limiterlar uchun bir xil) */
const baseOptions = {
  standardHeaders: 'draft-7', // RateLimit-* header'larini qo'shadi
  legacyHeaders: false,
  keyGenerator,
  handler: limitReachedHandler,
  // Sog'liq tekshiruvi va docs sahifalarini limitlamaymiz
  skip: (req) => req.path === '/health' || req.path.startsWith('/docs') || req.path.startsWith('/api-docs'),
};

/** 1) Global limiter — barcha API so'rovlari uchun */
const globalLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
});

/** 2) Auth limiter — login/register/refresh uchun qattiqroq */
const authLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  // Muvaffaqiyatli loginlar hisobga olinmasin — faqat xato urinishlar
  skipSuccessfulRequests: true,
  skip: () => false,
});

/** 3) Yozish (write) limiter — POST/PUT/PATCH/DELETE uchun */
const writeLimiter = rateLimit({
  ...baseOptions,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: Math.max(10, Math.floor(env.RATE_LIMIT_MAX / 2)),
});

/** 4) Fayl yuklash uchun alohida, kamroq limit */
const uploadLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60_000,
  max: 10,
});

module.exports = { globalLimiter, authLimiter, writeLimiter, uploadLimiter };
