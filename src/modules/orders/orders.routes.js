/**
 * =============================================================
 * src/modules/orders/orders.routes.js
 * -------------------------------------------------------------
 * Barcha buyurtma endpointlari AUTH talab qiladi — mehmon
 * buyurtmalarni umuman ko'ra olmaydi.
 *
 * DIQQAT: `/stats` va `/my` route'lari `/:id` dan OLDIN.
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./orders.controller');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole } = require('../../middlewares/auth');
const { writeLimiter } = require('../../middlewares/rateLimiter');
const { idParamSchema } = require('../../utils/commonValidation');
const schemas = require('./orders.validation');

const router = express.Router();

// Butun router uchun autentifikatsiya
router.use(authenticate);

// --- Maxsus yo'llar (/:id dan oldin!) ---
router.get('/stats', controller.stats);
// Ikkala yozuv ham ishlaydi: '/my' va '/my/list' (products moduli bilan bir xil).
// Muhim: bu route '/:id' dan OLDIN turishi shart — aks holda id='my' deb o'qiladi.
router.get(['/my', '/my/list'], validate({ query: schemas.listOrdersSchema }), controller.myOrders);

// --- Umumiy ro'yxat (rol asosida filtrlanadi) ---
router.get('/', validate({ query: schemas.listOrdersSchema }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);

// --- Buyurtma berish: USER va SELLER (sotuvchi ham xarid qilishi mumkin) ---
router.post('/', writeLimiter, validate({ body: schemas.createOrderSchema }), controller.create);

// --- Holatni o'zgartirish ---
router.patch(
  '/:id/status',
  writeLimiter,
  validate({ params: idParamSchema, body: schemas.updateOrderStatusSchema }),
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
