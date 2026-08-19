/**
 * =============================================================
 * src/modules/users/users.routes.js
 * -------------------------------------------------------------
 * RUXSATLAR:
 *   GET    /users             — ADMIN
 *   GET    /users/:id         — o'zi yoki ADMIN
 *   PATCH  /users/:id         — o'zi yoki ADMIN
 *   PATCH  /users/:id/role    — ADMIN
 *   PATCH  /users/:id/status  — ADMIN
 *   DELETE /users/:id         — ADMIN
 *
 * Eslatma: "men kimman?" so'rovi uchun alohida `/auth/me`
 * endpointi bor — u yerda id ni bilish shart emas.
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./users.controller');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, requireSelfOrAdmin } = require('../../middlewares/auth');
const { writeLimiter } = require('../../middlewares/rateLimiter');
const { idParamSchema } = require('../../utils/commonValidation');
const schemas = require('./users.validation');

const router = express.Router();

router.use(authenticate);

// --- Ro'yxat: faqat ADMIN ---
router.get('/', requireRole('ADMIN'), validate({ query: schemas.listUsersSchema }), controller.list);

// --- Bitta foydalanuvchi: o'zi yoki ADMIN ---
router.get('/:id', validate({ params: idParamSchema }), requireSelfOrAdmin(), controller.getById);

// --- Profilni yangilash: o'zi yoki ADMIN ---
router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateUserSchema }),
  requireSelfOrAdmin(),
  controller.update
);

// --- Rol: faqat ADMIN ---
router.patch(
  '/:id/role',
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateRoleSchema }),
  controller.updateRole
);

// --- Bloklash/blokdan chiqarish: faqat ADMIN ---
router.patch(
  '/:id/status',
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateStatusSchema }),
  controller.updateStatus
);

// --- O'chirish: faqat ADMIN ---
router.delete(
  '/:id',
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  controller.remove
);

module.exports = router;
