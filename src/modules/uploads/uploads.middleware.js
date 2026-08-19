/**
 * =============================================================
 * src/modules/uploads/uploads.middleware.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: multer sozlamalari — kelayotgan faylni RAM'ga olish.
 *
 * NEGA memoryStorage (diskka emas)?
 *   Biz faylni imgbb'ga yuborib, o'zimizda saqlamaymiz. Diskka
 *   yozib, keyin o'qib, keyin o'chirish — ortiqcha ish. RAM'da
 *   buffer sifatida ushlab turish tez va sodda.
 *   Kamchiligi: juda katta fayllar RAM'ni to'ldiradi — shuning
 *   uchun `limits.fileSize` bilan chegaralaymiz.
 *
 * XATOLAR: multer o'z xatolarini (LIMIT_FILE_SIZE va h.k.)
 * `MulterError` sifatida tashlaydi — ularni markazlashgan
 * `errorHandler` tushunarli o'zbekcha xabarga aylantiradi.
 * =============================================================
 */

'use strict';

const multer = require('multer');
const env = require('../../config/env');
const { isAllowedImage, ALLOWED_MIME_TYPES } = require('../../config/imgbb');
const { ApiError } = require('../../utils/ApiError');

const storage = multer.memoryStorage();

/**
 * Fayl turini tekshiruvchi filtr.
 * Ruxsat berilmagan tur kelsa — 415 xatosi.
 */
function fileFilter(req, file, cb) {
  if (isAllowedImage(file.mimetype)) {
    return cb(null, true);
  }
  return cb(
    ApiError.unsupportedMediaType(
      `"${file.mimetype}" turdagi fayl qabul qilinmaydi. ` +
        `Ruxsat etilgan turlar: ${ALLOWED_MIME_TYPES.join(', ')}`
    )
  );
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_BYTES, // .env dagi MAX_UPLOAD_SIZE_BYTES
    files: 1,                            // bir marta faqat 1 ta fayl
    fields: 10,
  },
});

/**
 * Bitta rasm uchun middleware. Form maydoni nomi: `image`.
 *
 * Frontendda:
 *   const fd = new FormData();
 *   fd.append('image', fileInput.files[0]);
 *   fetch('/api/v1/uploads/image', { method:'POST', body: fd, headers:{ Authorization:'Bearer ...' } })
 *
 * DIQQAT: FormData bilan ishlaganda `Content-Type` ni QO'LDA
 * yozmang — brauzer uni boundary bilan birga o'zi qo'yadi.
 */
const singleImage = upload.single('image');

/**
 * Bir nechta rasm (maksimal 5 ta), form maydoni: `images`.
 */
const multipleImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_BYTES, files: 5 },
}).array('images', 5);

module.exports = { singleImage, multipleImages, upload };
