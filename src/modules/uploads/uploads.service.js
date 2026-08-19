/**
 * =============================================================
 * src/modules/uploads/uploads.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Rasmni imgbb'ga yuklash + audit log yozish.
 *
 * Bu modul cache ishlatmaydi: fayl yuklash tashqi xizmatga
 * bog'liq va uni "keyinroq fonda bajaramiz" deb bo'lmaydi —
 * client URL'ni DARHOL olishi kerak.
 * =============================================================
 */

'use strict';

const { uploadImage } = require('../../config/imgbb');
const { ApiError } = require('../../utils/ApiError');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');

/**
 * Bitta rasmni yuklaydi.
 *
 * @param {Express.Multer.File} file multer bergan fayl obyekti
 * @param {object} actor req.user
 * @param {object} meta  audit uchun qo'shimcha ma'lumot
 */
async function uploadSingle(file, actor, meta = {}) {
  if (!file) {
    throw ApiError.badRequest(
      "Rasm yuborilmadi. `multipart/form-data` orqali `image` nomli maydonda fayl yuboring"
    );
  }

  const result = await uploadImage(file.buffer, file.originalname);

  logAudit({
    userId: actor?.id,
    action: AUDIT_ACTIONS.UPLOAD,
    entity: 'Image',
    entityId: result.url,
    meta: {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: result.size,
      ...meta,
    },
  });

  return {
    url: result.url,
    thumbUrl: result.thumbUrl,
    deleteUrl: result.deleteUrl,
    size: result.size,
    width: result.width,
    height: result.height,
    originalName: file.originalname,
    mimeType: file.mimetype,
    hint: "Bu `url` ni mahsulot yaratishda `imageUrl` maydoniga yozing",
  };
}

/**
 * Bir nechta rasmni yuklaydi.
 *
 * DIQQAT: `Promise.allSettled` ishlatamiz — bitta rasm xato
 * bo'lsa ham qolganlari yuklanaveradi va client qaysi biri
 * muvaffaqiyatsiz bo'lganini aniq ko'radi.
 */
async function uploadMultiple(files, actor, meta = {}) {
  if (!files || files.length === 0) {
    throw ApiError.badRequest(
      "Rasm yuborilmadi. `multipart/form-data` orqali `images` nomli maydonda 1-5 ta fayl yuboring"
    );
  }

  const settled = await Promise.allSettled(files.map((f) => uploadSingle(f, actor, meta)));

  const uploaded = [];
  const failed = [];

  settled.forEach((res, index) => {
    if (res.status === 'fulfilled') {
      uploaded.push(res.value);
    } else {
      failed.push({
        originalName: files[index]?.originalname || `fayl-${index + 1}`,
        error: res.reason?.message || "Noma'lum xato",
      });
    }
  });

  // Hammasi muvaffaqiyatsiz bo'lsa — bu haqiqiy xato
  if (uploaded.length === 0) {
    throw ApiError.serviceUnavailable("Hech qanday rasm yuklanmadi", { failed });
  }

  return {
    uploaded,
    failed,
    summary: `${uploaded.length} ta rasm yuklandi${failed.length ? `, ${failed.length} tasi xato bilan tugadi` : ''}`,
  };
}

module.exports = { uploadSingle, uploadMultiple };
