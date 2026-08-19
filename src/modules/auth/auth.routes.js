/**
 * =============================================================
 * src/modules/auth/auth.routes.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Auth modulining URL manzillari (route'lari).
 *
 * Har bir route quyidagi zanjirdan iborat:
 *   [rate limiter] -> [validate] -> [authenticate?] -> [controller]
 *
 * Tartib MUHIM: avval limit, keyin validatsiya, keyin token
 * tekshiruvi, eng oxirida asosiy ish.
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/auth');
const { authLimiter } = require('../../middlewares/rateLimiter');
const schemas = require('./auth.validation');

const router = express.Router();

/**
 * POST /api/v1/auth/register
 * Yangi foydalanuvchi ro'yxatdan o'tkazadi. Token qaytaradi.
 * Ochiq (token kerak emas). Qattiq rate limit ostida.
 */
router.post('/register', authLimiter, validate({ body: schemas.registerSchema }), controller.register);

/**
 * POST /api/v1/auth/login
 * Email + parol -> access va refresh token.
 */
router.post('/login', authLimiter, validate({ body: schemas.loginSchema }), controller.login);

/**
 * POST /api/v1/auth/refresh
 * Refresh token -> yangi access + refresh token juftligi.
 */
router.post('/refresh', authLimiter, validate({ body: schemas.refreshSchema }), controller.refresh);

/**
 * POST /api/v1/auth/logout
 * Refresh tokenni bekor qiladi. Token talab qilinadi.
 */
router.post('/logout', authenticate, validate({ body: schemas.logoutSchema }), controller.logout);

/**
 * GET /api/v1/auth/me
 * Joriy foydalanuvchi profili.
 */
router.get('/me', authenticate, controller.me);

/**
 * PATCH /api/v1/auth/change-password
 * Parolni o'zgartiradi va barcha sessiyalarni yopadi.
 */
router.patch(
  '/change-password',
  authenticate,
  validate({ body: schemas.changePasswordSchema }),
  controller.changePassword
);

module.exports = router;
