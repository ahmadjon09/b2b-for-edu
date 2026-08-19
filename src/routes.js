/**
 * =============================================================
 * src/routes.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Barcha modul router'larini bitta joyga yig'ish.
 *
 * NEGA ALOHIDA FAYL? `app.js` faqat middleware'lar bilan
 * shug'ullansin, endpointlar ro'yxati esa shu yerda ko'rinsin.
 * Yangi modul qo'shsangiz — bitta qator qo'shasiz, xolos.
 * =============================================================
 */

'use strict';

const express = require('express');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const categoriesRoutes = require('./modules/categories/categories.routes');
const productsRoutes = require('./modules/products/products.routes');
const ordersRoutes = require('./modules/orders/orders.routes');
const uploadsRoutes = require('./modules/uploads/uploads.routes');
const systemRoutes = require('./modules/system/system.routes');
const auditRoutes = require('./audit/audit.routes');

const router = express.Router();

/**
 * GET /api/v1 — API "xaritasi".
 * Yangi dasturchi qaysi endpointlar borligini shu yerdan ko'radi.
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'B2B Demo API',
      version: 'v1',
      documentation: {
        swagger: '/api-docs',
        openapiJson: '/api-docs.json',
        htmlGuide: '/docs',
      },
      endpoints: {
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        categories: '/api/v1/categories',
        products: '/api/v1/products',
        orders: '/api/v1/orders',
        uploads: '/api/v1/uploads',
        auditLogs: '/api/v1/audit-logs',
        system: '/api/v1/system',
      },
      hint: "Boshlash uchun: POST /api/v1/auth/login (admin@b2b.uz / Admin123!)",
    },
    meta: { requestId: req.requestId, timestamp: new Date().toISOString() },
  });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/categories', categoriesRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/system', systemRoutes);

module.exports = router;
