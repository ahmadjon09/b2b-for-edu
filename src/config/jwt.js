/**
 * =============================================================
 * src/config/jwt.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: JWT tokenlarni yaratish va tekshirish.
 *
 * IKKI XIL TOKEN ISHLATAMIZ:
 *   1) ACCESS TOKEN  — qisqa umr (15 daqiqa). Har bir so'rovda
 *      `Authorization: Bearer <token>` header'ida yuboriladi.
 *      O'g'irlansa ham tez orada yaroqsiz bo'ladi.
 *   2) REFRESH TOKEN — uzoq umr (7 kun). Faqat yangi access
 *      token olish uchun ishlatiladi (/auth/refresh). DB'da
 *      hash ko'rinishida saqlanadi — shunda logout qilganda
 *      uni bekor qilish (revoke) mumkin.
 *
 * NEGA IKKITA? Agar bitta uzoq muddatli token ishlatsak va u
 * o'g'irlansa — hujumchi 7 kun davomida hamma narsa qila oladi.
 * Ikki tokenli sxema xavfni sezilarli kamaytiradi.
 * =============================================================
 */

'use strict';

const jwt = require('jsonwebtoken');
const env = require('./env');
const { ApiError } = require('../utils/ApiError');

/**
 * Access token yaratadi.
 * @param {{id:string, email:string, role:string}} user
 * @returns {string} JWT
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN, issuer: 'b2b-demo-api' }
  );
}

/**
 * Refresh token yaratadi.
 * Ichida faqat minimal ma'lumot bo'ladi (id + type).
 */
function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'b2b-demo-api',
  });
}

/**
 * Ikkala tokenni birga yaratadi (login/register javobida ishlatiladi).
 */
function signTokenPair(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

/**
 * Access tokenni tekshiradi. Yaroqsiz bo'lsa xato tashlaydi —
 * xatoni errorHandler tushunarli xabarga aylantiradi.
 */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'b2b-demo-api' });
  if (payload.type !== 'access') {
    throw ApiError.unauthorized(
      "Bu access token emas. /auth/refresh uchun mo'ljallangan tokenni oddiy so'rovlarda ishlatib bo'lmaydi"
    );
  }
  return payload;
}

/**
 * Refresh tokenni tekshiradi.
 */
function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'b2b-demo-api' });
  if (payload.type !== 'refresh') {
    throw ApiError.unauthorized('Bu refresh token emas');
  }
  return payload;
}

/**
 * "7d", "15m" kabi satrni millisekundga aylantiradi.
 * Refresh tokenning DB'dagi `expiresAt` ustunini hisoblash uchun kerak.
 */
function parseDurationToMs(duration) {
  const match = String(duration).match(/^(\d+)\s*([smhd])$/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 kun
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * multipliers[unit];
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  signTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  parseDurationToMs,
};
