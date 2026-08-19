/**
 * =============================================================
 * src/modules/uploads/uploads.routes.js
 * -------------------------------------------------------------
 * Rasm yuklash — autentifikatsiyadan o'tgan har qanday
 * foydalanuvchi uchun (avatar yuklash USER'ga ham kerak).
 *
 * MIDDLEWARE TARTIBI MUHIM:
 *   authenticate -> uploadLimiter -> multer -> controller
 * multer eng oxirida turadi, chunki ruxsatsiz odam uchun
 * faylni umuman o'qib o'tirishning hojati yo'q.
 * =============================================================
 */

'use strict';

const express = require('express');
const controller = require('./uploads.controller');
const { authenticate } = require('../../middlewares/auth');
const { uploadLimiter } = require('../../middlewares/rateLimiter');
const { singleImage, multipleImages } = require('./uploads.middleware');

const router = express.Router();

// Cheklovlar haqida ma'lumot — token shart emas
router.get('/info', controller.info);

router.post('/image', authenticate, uploadLimiter, singleImage, controller.single);
router.post('/images', authenticate, uploadLimiter, multipleImages, controller.multiple);

module.exports = router;
