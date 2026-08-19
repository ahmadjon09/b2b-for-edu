/**
 * =============================================================
 * src/audit/audit.routes.js
 * -------------------------------------------------------------
 * Barcha audit endpointlari FAQAT ADMIN uchun.
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./audit.controller');
const validate = require('../middlewares/validate');
const { authenticate, requireRole } = require('../middlewares/auth');
const { writeLimiter } = require('../middlewares/rateLimiter');
const { listAuditSchema } = require('./audit.validation');

const router = express.Router();

// Butun router: avval kim ekanligini, keyin ADMIN ekanligini tekshiramiz
router.use(authenticate, requireRole('ADMIN'));

router.get('/stats', controller.stats);
router.get('/actions', controller.actions);
router.get('/', validate({ query: listAuditSchema }), controller.list);
router.post('/cleanup', writeLimiter, controller.cleanup);

module.exports = router;
