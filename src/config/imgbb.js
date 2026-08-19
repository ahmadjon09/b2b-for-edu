/**
 * =============================================================
 * src/config/imgbb.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Rasmlarni imgbb.com xizmatiga yuklash.
 *
 * NEGA IMGBB? Rasmlarni o'z serverimizda saqlash uchun disk,
 * zaxira nusxa, CDN kerak bo'ladi. imgbb esa bepul, oddiy va
 * API'si juda sodda — demo loyiha uchun ideal.
 *
 * QANDAY ISHLAYDI?
 *   1) Client `multipart/form-data` orqali rasm yuboradi
 *   2) multer uni RAM'ga (buffer) oladi
 *   3) Biz buferni base64 ga aylantirib imgbb'ga POST qilamiz
 *   4) imgbb bizga doimiy URL qaytaradi
 *   5) Shu URL'ni DB'ga (product.imageUrl) yozamiz
 *
 * PRODUCTIONDA: AWS S3, Cloudflare R2 yoki o'z MinIO serveringiz
 * ishlatilgani ma'qul — chunki imgbb'da fayllarni boshqarish,
 * o'chirish va maxfiylik cheklangan.
 * =============================================================
 */

'use strict';

const axios = require('axios');
const env = require('./env');
const logger = require('../utils/logger');
const { ApiError } = require('../utils/ApiError');

/** Ruxsat etilgan rasm turlari */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

/**
 * Rasmni imgbb'ga yuklaydi.
 *
 * @param {Buffer} fileBuffer rasm baytlari
 * @param {string} [fileName] fayl nomi (imgbb'da ko'rinadi)
 * @returns {Promise<{url:string, deleteUrl:string, thumbUrl:string, size:number, width:number, height:number}>}
 */
async function uploadImage(fileBuffer, fileName = 'upload') {
  // 1) API kalit bormi?
  if (!env.imgbbEnabled) {
    throw ApiError.serviceUnavailable(
      "Rasm yuklash xizmati sozlanmagan. .env faylida IMGBB_API_KEY ni to'ldiring " +
        '(kalitni https://api.imgbb.com/ dan bepul olasiz)'
    );
  }

  // 2) Fayl bormi?
  if (!fileBuffer || fileBuffer.length === 0) {
    throw ApiError.badRequest("Rasm fayli bo'sh yoki yuborilmagan");
  }

  // 3) Hajm chegarasi
  if (fileBuffer.length > env.MAX_UPLOAD_SIZE_BYTES) {
    throw ApiError.payloadTooLarge(
      `Rasm hajmi juda katta (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB). ` +
        `Maksimal ruxsat: ${(env.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB`
    );
  }

  // 4) imgbb base64 kutadi
  const base64Image = fileBuffer.toString('base64');
  const form = new URLSearchParams();
  form.append('key', env.IMGBB_API_KEY);
  form.append('image', base64Image);
  form.append('name', String(fileName).replace(/[^\w.-]/g, '_').slice(0, 60));

  try {
    const response = await axios.post(env.IMGBB_UPLOAD_URL, form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,          // 30 soniya kutamiz, keyin bekor qilamiz
      maxBodyLength: Infinity,  // katta base64 satrlar uchun
    });

    const data = response.data?.data;
    if (!data?.url) {
      throw ApiError.serviceUnavailable("imgbb kutilmagan javob qaytardi — rasm yuklanmadi");
    }

    logger.info(`Rasm imgbb'ga yuklandi: ${data.url}`);

    return {
      url: data.display_url || data.url,
      thumbUrl: data.thumb?.url || data.display_url || data.url,
      deleteUrl: data.delete_url || null,
      size: Number(data.size) || fileBuffer.length,
      width: Number(data.width) || null,
      height: Number(data.height) || null,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // axios xatolari errorHandler'da tushunarli xabarga aylanadi
    logger.error("imgbb'ga yuklashda xato", error);
    throw error;
  }
}

/**
 * Fayl turini tekshiradi (multer fileFilter uchun).
 */
function isAllowedImage(mimetype) {
  return ALLOWED_MIME_TYPES.includes(String(mimetype).toLowerCase());
}

module.exports = { uploadImage, isAllowedImage, ALLOWED_MIME_TYPES };
