/**
 * =============================================================
 * src/modules/auth/auth.controller.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: HTTP qatlami. So'rovdan kerakli ma'lumotni oladi,
 * service'ni chaqiradi va natijani standart formatda qaytaradi.
 *
 * QOIDA: controller ichida biznes-mantiq YOZILMAYDI. U faqat
 * "vositachi": req -> service -> res. Shuning uchun har bir
 * funksiya 3-5 qatordan iborat.
 *
 * Barcha funksiyalar `asyncHandler` bilan o'ralgan — shuning
 * uchun ichkarida `try/catch` yozish shart emas, har qanday
 * xato avtomatik errorHandler'ga boradi.
 * =============================================================
 */

'use strict';

const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');

/** POST /api/v1/auth/register — yangi foydalanuvchi */
const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, requestMeta(req));
  return sendCreated(res, result, "Ro'yxatdan o'tish muvaffaqiyatli yakunlandi");
});

/** POST /api/v1/auth/login — tizimga kirish */
const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, requestMeta(req));
  return sendSuccess(res, result, { message: 'Tizimga muvaffaqiyatli kirdingiz' });
});

/** POST /api/v1/auth/refresh — yangi access token */
const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body, requestMeta(req));
  return sendSuccess(res, result, { message: 'Token yangilandi' });
});

/** POST /api/v1/auth/logout — chiqish */
const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.user.id, req.body?.refreshToken, requestMeta(req));
  return sendSuccess(res, result, {
    message: result.allDevices ? 'Barcha qurilmalardan chiqdingiz' : 'Tizimdan chiqdingiz',
  });
});

/** GET /api/v1/auth/me — joriy foydalanuvchi */
const me = asyncHandler(async (req, res) => {
  const user = await authService.getMe(req.user.id);
  return sendSuccess(res, user);
});

/** PATCH /api/v1/auth/change-password — parolni o'zgartirish */
const changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body, requestMeta(req));
  return sendSuccess(res, result, { message: result.message });
});

module.exports = { register, login, refresh, logout, me, changePassword };
