/**
 * =============================================================
 * src/modules/auth/auth.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Autentifikatsiya BIZNES-MANTIQI.
 *
 * QATLAMLAR HAQIDA (junior uchun muhim):
 *   routes      -> qaysi URL qaysi controller'ga borishini belgilaydi
 *   controller  -> HTTP bilan ishlaydi (req/res), service'ni chaqiradi
 *   service     -> ASOSIY MANTIQ shu yerda (DB, cache, tekshiruvlar)
 *   validation  -> kirish ma'lumotlarini tekshiradi
 *
 * Service HTTP haqida hech narsa bilmaydi — `req`/`res` bu yerga
 * kirmaydi. Shuning uchun uni test qilish ham oson.
 *
 * DIQQAT: Auth moduli — cache'ga emas, to'g'ridan-to'g'ri DB'ga
 * yozadigan yagona joy. Nega? Chunki parol va tokenlar bilan
 * ishlashda "keyinroq yozamiz" degan yondashuv XAVFLI:
 * foydalanuvchi ro'yxatdan o'tdi deb o'ylab, keyin login qila
 * olmasligi mumkin. Tezlik bu yerda ikkinchi darajali.
 * =============================================================
 */

'use strict';

const bcrypt = require('bcryptjs');
const { prisma } = require('../../config/db');
const env = require('../../config/env');
const { signTokenPair, verifyRefreshToken, parseDurationToMs } = require('../../config/jwt');
const { ApiError } = require('../../utils/ApiError');
const { sanitizeUser, sha256 } = require('../../utils/helpers');
const cache = require('../../cache/cacheManager');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');

/** bcrypt "kuchi" — qancha katta bo'lsa, shuncha xavfsiz, lekin sekin */
const BCRYPT_ROUNDS = 10;

/**
 * Yangi foydalanuvchi ro'yxatdan o'tkazadi.
 *
 * @param {object} payload { name, email, password, role, avatarUrl }
 * @param {object} [meta] audit uchun (ip, userAgent)
 */
async function register(payload, meta = {}) {
  const { name, email, password, role = 'USER', avatarUrl = null } = payload;

  // 1) Email band emasligini tekshiramiz
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict(
      `"${email}" emaili bilan foydalanuvchi allaqachon mavjud. Tizimga kiring yoki boshqa email tanlang`
    );
  }

  // 2) Parolni hash qilamiz. ASL PAROL HECH QAYERDA SAQLANMAYDI.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 3) DB'ga yozamiz
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, avatarUrl },
  });

  // 4) Cache'ni ham yangilaymiz — keyingi so'rovlar DB'ga bormasin
  cache.users.set(user.id, user);

  // 5) Tokenlarni beramiz — foydalanuvchi darhol ishlay boshlaydi
  const tokens = signTokenPair(user);
  await persistRefreshToken(user.id, tokens.refreshToken);

  logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.REGISTER,
    entity: 'User',
    entityId: user.id,
    meta: { email: user.email, role: user.role, ...meta },
  });

  return { user: sanitizeUser(user), tokens };
}

/**
 * Tizimga kirish.
 */
async function login({ email, password }, meta = {}) {
  // 1) Foydalanuvchini topamiz
  const user = await prisma.user.findUnique({ where: { email } });

  // 2) MUHIM XAVFSIZLIK QOIDASI:
  // "Bunday email yo'q" va "Parol xato" uchun BIR XIL xabar beramiz.
  // Aks holda hujumchi qaysi emaillar ro'yxatdan o'tganini bilib oladi
  // (bu "user enumeration" hujumi deyiladi).
  const invalidMessage = "Email yoki parol noto'g'ri";

  if (!user) {
    // Vaqtni tenglashtirish uchun baribir hash tekshiramiz
    // (timing attack'ning oldini olish)
    await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw ApiError.unauthorized(invalidMessage);
  }

  if (!user.isActive) {
    throw ApiError.forbidden("Hisobingiz bloklangan. Administrator bilan bog'laning");
  }

  // 3) Parolni solishtiramiz
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    logAudit({
      userId: user.id,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      meta: { reason: 'wrong_password', ...meta },
    });
    throw ApiError.unauthorized(invalidMessage);
  }

  // 4) Tokenlar
  const tokens = signTokenPair(user);
  await persistRefreshToken(user.id, tokens.refreshToken);

  cache.users.set(user.id, user);

  logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.LOGIN,
    entity: 'User',
    entityId: user.id,
    meta: { email: user.email, ...meta },
  });

  return { user: sanitizeUser(user), tokens };
}

/**
 * Refresh token orqali yangi access token olish.
 *
 * ROTATION: eski refresh token bekor qilinadi va yangisi beriladi.
 * Bu "refresh token rotation" deyiladi va o'g'irlangan tokenni
 * qayta ishlatishni qiyinlashtiradi.
 */
async function refresh({ refreshToken }, meta = {}) {
  // 1) Imzo va muddatni tekshiramiz
  const payload = verifyRefreshToken(refreshToken);

  // 2) DB'da bu token bormi va bekor qilinmaganmi?
  const tokenHash = sha256(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    throw ApiError.unauthorized(
      "Refresh token topilmadi. Ehtimol siz allaqachon chiqib ketgansiz — qaytadan login qiling"
    );
  }
  if (stored.revokedAt) {
    // Bekor qilingan token ishlatilmoqda — bu shubhali!
    // Xavfsizlik uchun foydalanuvchining BARCHA tokenlarini bekor qilamiz.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logAudit({
      userId: stored.userId,
      action: 'REUSED_REVOKED_TOKEN',
      entity: 'RefreshToken',
      entityId: stored.id,
      meta,
    });
    throw ApiError.unauthorized(
      'Bu token allaqachon bekor qilingan. Xavfsizlik uchun barcha sessiyalar yopildi — qaytadan login qiling'
    );
  }
  if (stored.expiresAt < new Date()) {
    throw ApiError.tokenExpired('Refresh token muddati tugagan — qaytadan login qiling');
  }

  // 3) Foydalanuvchi hali ham mavjudmi?
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Foydalanuvchi topilmadi yoki bloklangan");
  }

  // 4) Eskisini bekor qilib, yangi juftlik beramiz (rotation)
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const tokens = signTokenPair(user);
  await persistRefreshToken(user.id, tokens.refreshToken);

  logAudit({
    userId: user.id,
    action: AUDIT_ACTIONS.REFRESH_TOKEN,
    entity: 'User',
    entityId: user.id,
    meta,
  });

  return { user: sanitizeUser(user), tokens };
}

/**
 * Tizimdan chiqish — refresh tokenni bekor qilish.
 * @param {string} userId
 * @param {string} [refreshToken] berilsa faqat shu sessiya, berilmasa hammasi
 */
async function logout(userId, refreshToken, meta = {}) {
  if (refreshToken) {
    const tokenHash = sha256(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    // Barcha qurilmalardan chiqish
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  logAudit({
    userId,
    action: AUDIT_ACTIONS.LOGOUT,
    entity: 'User',
    entityId: userId,
    meta: { allDevices: !refreshToken, ...meta },
  });

  return { loggedOut: true, allDevices: !refreshToken };
}

/**
 * Joriy foydalanuvchi ma'lumotlari (GET /auth/me).
 */
async function getMe(userId) {
  // Avval cache — tezroq
  let user = cache.users.get(userId);
  if (!user) {
    user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) cache.users.set(user.id, user);
  }
  if (!user) throw ApiError.notFound('Foydalanuvchi topilmadi');
  return sanitizeUser(user);
}

/**
 * Parolni o'zgartirish.
 */
async function changePassword(userId, { oldPassword, newPassword }, meta = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('Foydalanuvchi topilmadi');

  const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isMatch) throw ApiError.unauthorized("Joriy parol noto'g'ri kiritildi");

  if (oldPassword === newPassword) {
    throw ApiError.badRequest("Yangi parol eskisidan farq qilishi kerak");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  cache.users.set(updated.id, updated);

  // Parol o'zgardi — barcha eski sessiyalarni yopamiz
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  logAudit({ userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId, meta });

  return { changed: true, message: "Parol o'zgartirildi. Barcha qurilmalarda qaytadan login qiling" };
}

/* -------------------------------------------------------------
 * Ichki yordamchi: refresh tokenni DB'ga (hash ko'rinishida) yozadi
 * -----------------------------------------------------------
 * NEGA HASH? Agar DB sizib chiqsa, hujumchi tokenlarning o'zini
 * emas, faqat hash'ini ko'radi va ulardan foydalana olmaydi.
 */
async function persistRefreshToken(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN));
  await prisma.refreshToken.create({
    data: { tokenHash: sha256(refreshToken), userId, expiresAt },
  });

  // Eski/muddati o'tgan tokenlarni tozalab turamiz (jadval shishmasin)
  prisma.refreshToken
    .deleteMany({ where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] } })
    .catch(() => {});
}

module.exports = { register, login, refresh, logout, getMe, changePassword };
