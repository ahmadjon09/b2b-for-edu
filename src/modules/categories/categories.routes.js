/**
 * =============================================================
 * src/modules/categories/categories.routes.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kategoriya URL'lari va ularga qo'yilgan huquqlar.
 *
 * RUXSATLAR:
 *   GET    /categories      — hamma (mehmon ham) ko'radi
 *   GET    /categories/:id  — hamma ko'radi
 *   POST   /categories      — faqat ADMIN
 *   PATCH  /categories/:id  — faqat ADMIN
 *   DELETE /categories/:id  — faqat ADMIN
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./categories.controller');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, optionalAuth } = require('../../middlewares/auth');
const { writeLimiter } = require('../../middlewares/rateLimiter');
const { idParamSchema } = require('../../utils/commonValidation');
const schemas = require('./categories.validation');

const router = express.Router();

// --- Ochiq (public) endpointlar ---
router.get('/', optionalAuth, validate({ query: schemas.listCategoriesSchema }), controller.list);
router.get('/:id', optionalAuth, validate({ params: idParamSchema }), controller.getById);

// --- Faqat ADMIN uchun ---
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  writeLimiter,
  validate({ body: schemas.createCategorySchema }),
  controller.create
);

router.patch(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateCategorySchema }),
  controller.update
);

router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  controller.remove
);

module.exports = router;
