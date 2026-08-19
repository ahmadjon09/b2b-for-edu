/**
 * =============================================================
 * src/middlewares/requestContext.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Har bir so'rovga unikal `requestId` berish va
 * so'rov davomiyligini o'lchash.
 *
 * NEGA KERAK? Foydalanuvchi "menda xato chiqdi" desa, u javobdagi
 * `meta.requestId` ni aytadi va siz loglardan aynan o'sha so'rovni
 * bir zumda topasiz. Bu productionda hayot qutqaradigan narsa.
 * =============================================================
 */

'use strict';

const crypto = require('crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  // Agar client (yoki nginx) o'z ID'sini yuborgan bo'lsa — shuni ishlatamiz
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.startTime = Date.now();

  // Javob header'ida ham qaytaramiz — client uni ko'ra oladi
  res.setHeader('X-Request-Id', req.requestId);

  // Javob tugagach — davomiylikni log qilamiz
  res.on('finish', () => {
    const ms = Date.now() - req.startTime;
    const status = res.statusCode;
    const msg = `${req.method} ${req.originalUrl} ${status} - ${ms}ms`;
    // 4xx/5xx allaqachon errorHandler tomonidan log qilingan,
    // shuning uchun bu yerda faqat muvaffaqiyatlilarini yozamiz
    if (status < 400) logger.info(msg);
  });

  next();
}

module.exports = requestContext;
