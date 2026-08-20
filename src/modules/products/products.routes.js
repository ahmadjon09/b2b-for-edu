/**
 * =============================================================
 * src/modules/products/products.routes.js
 * -------------------------------------------------------------
 * RUXSATLAR JADVALI:
 *   GET    /products          — hamma (mehmon ham)
 *   GET    /products/:id      — hamma
 *   GET    /products/my/list  — SELLER (o'z mahsulotlari)
 *   POST   /products          — SELLER, ADMIN
 *   PATCH  /products/:id      — mahsulot egasi (SELLER) yoki ADMIN
 *   DELETE /products/:id      — mahsulot egasi (SELLER) yoki ADMIN
 *
 * DIQQAT: `/my/list` route'i `/:id` dan OLDIN yozilgan. Aks holda
 * Express "/my" ni id deb qabul qilib yuboradi!
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./products.controller');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, optionalAuth } = require('../../middlewares/auth');
const { writeLimiter } = require('../../middlewares/rateLimiter');
const { idParamSchema } = require('../../utils/commonValidation');
const schemas = require('./products.validation');

const router = express.Router();

// --- Sotuvchining o'z mahsulotlari ---
//
// DIQQAT (juniorlar uchun eng ko'p uchraydigan xato):
// Bu route '/:id' dan OLDIN turishi SHART. Express route'larni
// yozilgan tartibda tekshiradi. Agar '/:id' oldinroq bo'lsa,
// '/my' so'rovi unga tushib ketadi va id="my" deb o'qiladi —
// natijada "UUID bo'lishi kerak" degan 422 xato chiqadi.
//
// Ikkala yozuv ham qabul qilinadi: '/my' va '/my/list'.
// (orders moduli '/my' ishlatadi — API bir xil bo'lishi uchun.)
router.get(
  ['/my', '/my/list'],
  authenticate,
  requireRole('SELLER', 'ADMIN'),
  validate({ query: schemas.listProductsSchema }),
  controller.myProducts
);

// --- Ochiq endpointlar ---
router.get('/', optionalAuth, validate({ query: schemas.listProductsSchema }), controller.list);
router.get('/:id', optionalAuth, validate({ params: idParamSchema }), controller.getById);

// --- Yozish amallari ---
router.post(
  '/',
  authenticate,
  requireRole('SELLER', 'ADMIN'),
  writeLimiter,
  validate({ body: schemas.createProductSchema }),
  controller.create
);

router.patch(
  '/:id',
  authenticate,
  requireRole('SELLER', 'ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateProductSchema }),
  controller.update
);

router.delete(
  '/:id',
  authenticate,
  requireRole('SELLER', 'ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  controller.remove
);

module.exports = router;
