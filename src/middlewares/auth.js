/**
 * =============================================================
 * src/middlewares/auth.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kim so'rov yuborayotganini aniqlash (autentifikatsiya)
 * va unga ruxsat bor-yo'qligini tekshirish (avtorizatsiya).
 *
 * BU YERDA 3 TA MIDDLEWARE BOR:
 *   1) authenticate     — token majburiy. Token bo'lmasa 401.
 *   2) optionalAuth     — token bo'lsa o'qiydi, bo'lmasa ham o'tkazadi.
 *                         (masalan mahsulotlar ro'yxatini mehmon ham
 *                          ko'rishi mumkin, lekin login qilgan bo'lsa
 *                          qo'shimcha ma'lumot beramiz)
 *   3) requireRole(...) — faqat ma'lum rollarga ruxsat: requireRole('ADMIN')
 *
 * ISHLATISH TARTIBI MUHIM:
 *   router.post('/', authenticate, requireRole('ADMIN','SELLER'), handler)
 *   ya'ni avval "kimligini aniqlash", keyin "ruxsatini tekshirish".
 * =============================================================
 */

'use strict';

const { verifyAccessToken } = require('../config/jwt');
const { prisma } = require('../config/db');
const { ApiError } = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const cache = require('../cache/cacheManager');

/**
 * `Authorization: Bearer <token>` header'idan tokenni ajratib oladi.
 * @returns {string|null}
 */
function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  if (!parts[1] || parts[1] === 'null' || parts[1] === 'undefined') return null;

  return parts[1];
}

/**
 * Foydalanuvchini avval cache'dan, topilmasa DB'dan oladi.
 * NEGA? Har bir so'rovda DB'ga bormaslik uchun — bu API'ni
 * sezilarli tezlashtiradi.
 */
async function loadUser(userId) {
  const cached = cache.users.get(userId);
  if (cached) return cached;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) cache.users.set(user.id, user);
  return user;
}

/**
 * 1) MAJBURIY autentifikatsiya.
 * Muvaffaqiyatli bo'lsa `req.user` ga foydalanuvchi yoziladi.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    throw ApiError.unauthorized(
      "Avtorizatsiya talab qilinadi. So'rovga 'Authorization: Bearer <accessToken>' header'ini qo'shing. " +
        'Tokenni /api/v1/auth/login orqali olasiz'
    );
  }

  // Token yaroqsiz/muddati tugagan bo'lsa — jwt xato tashlaydi,
  // uni errorHandler tushunarli xabarga aylantiradi.
  const payload = verifyAccessToken(token);

  const user = await loadUser(payload.sub);
  if (!user) {
    throw ApiError.unauthorized("Token egasi topilmadi — foydalanuvchi o'chirilgan bo'lishi mumkin");
  }
  if (user.isActive === false) {
    throw ApiError.forbidden('Sizning hisobingiz bloklangan. Administrator bilan bog\'laning');
  }

  // Keyingi middleware/controller'lar shu obyektdan foydalanadi
  req.user = { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl };
  req.token = token;

  next();
});

/**
 * 2) IXTIYORIY autentifikatsiya — token bo'lsa o'qiydi, bo'lmasa o'tkazadi.
 * Xato tokenda ham so'rovni to'xtatmaydi (mehmon deb hisoblaydi).
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await loadUser(payload.sub);
    if (user && user.isActive !== false) {
      req.user = { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl };
      req.token = token;
    }
  } catch (_) {
    // Token yaroqsiz — mehmon sifatida davom etamiz
  }
  next();
});

/**
 * 3) ROL TEKSHIRUVI.
 * @param {...string} allowedRoles ruxsat etilgan rollar: 'ADMIN', 'SELLER', 'USER'
 *
 * Misol: requireRole('ADMIN')            — faqat admin
 *        requireRole('ADMIN', 'SELLER')  — admin yoki sotuvchi
 */
function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(
        ApiError.unauthorized("Avval tizimga kiring — bu amal uchun autentifikatsiya kerak")
      );
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Bu amal uchun quyidagi rollardan biri kerak: ${allowedRoles.join(', ')}. Sizning rolingiz: ${req.user.role}`,
          { requiredRoles: allowedRoles, yourRole: req.user.role }
        )
      );
    }
    next();
  };
}

/**
 * Qulaylik uchun: faqat ADMIN.
 */
const requireAdmin = requireRole('ADMIN');

/**
 * "O'zi yoki admin" tekshiruvi — masalan foydalanuvchi faqat
 * o'z profilini tahrirlashi mumkin, admin esa hammasini.
 *
 * @param {(req)=>string} getOwnerId so'rovdan egasining id'sini oladigan funksiya
 */
function requireSelfOrAdmin(getOwnerId = (req) => req.params.id) {
  return function selfOrAdminGuard(req, res, next) {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'ADMIN') return next();

    const ownerId = getOwnerId(req);
    if (ownerId && ownerId === req.user.id) return next();

    return next(ApiError.forbidden("Faqat o'zingizga tegishli ma'lumotni o'zgartira olasiz"));
  };
}

module.exports = { authenticate, optionalAuth, requireRole, requireAdmin, requireSelfOrAdmin, extractToken };
