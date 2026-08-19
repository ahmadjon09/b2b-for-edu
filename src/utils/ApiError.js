/**
 * =============================================================
 * src/utils/ApiError.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Loyihaning YAGONA xato tipi. Har qanday "kutilgan"
 * xato (topilmadi, ruxsat yo'q, validatsiya xatosi ...) shu klass
 * orqali tashlanadi (`throw`), keyin markazlashgan errorHandler
 * uni ushlab, clientga chiroyli JSON qaytaradi.
 *
 * NEGA KERAK? Oddiy `throw new Error('not found')` bilan
 * errorHandler qaysi HTTP status kod qaytarishni bilmaydi.
 * ApiError esa o'zi bilan birga: statusCode, code (mashina
 * o'qiydigan kod) va details (masalan qaysi maydon xato) olib yuradi.
 *
 * ISHLATISH:
 *   throw ApiError.notFound('Mahsulot topilmadi');
 *   throw ApiError.badRequest('Narx manfiy bo\'lishi mumkin emas');
 *   throw new ApiError(409, 'CONFLICT', 'Bu email band');
 * =============================================================
 */

'use strict';

/**
 * Standart xato kodlari — clientdagi dasturchi shu kodlarga
 * qarab ish ko'radi (matn o'zgarishi mumkin, kod esa o'zgarmaydi).
 */
const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',   // 422 — input noto'g'ri
  BAD_REQUEST: 'BAD_REQUEST',             // 400 — so'rov noto'g'ri
  UNAUTHORIZED: 'UNAUTHORIZED',           // 401 — token yo'q/yaroqsiz
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',         // 401 — token muddati tugagan
  FORBIDDEN: 'FORBIDDEN',                 // 403 — ruxsat yetarli emas
  NOT_FOUND: 'NOT_FOUND',                 // 404 — resurs topilmadi
  CONFLICT: 'CONFLICT',                   // 409 — takrorlanuvchi ma'lumot
  UNPROCESSABLE: 'UNPROCESSABLE',         // 422 — mantiqiy xato
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS', // 429 — rate limit
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE', // 413 — fayl/JSON juda katta
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE', // 415
  INTERNAL_ERROR: 'INTERNAL_ERROR',       // 500 — kutilmagan xato
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE', // 503 — tashqi xizmat ishlamayapti
  DATABASE_ERROR: 'DATABASE_ERROR',       // 500 — DB xatosi
};

class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP status kodi (404, 403, ...)
   * @param {string} code Mashina o'qiydigan kod (ERROR_CODES dan)
   * @param {string} message Foydalanuvchiga ko'rinadigan xabar (o'zbekcha)
   * @param {any} [details] Qo'shimcha ma'lumot (masalan validatsiya maydonlari)
   */
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // `isOperational = true` degani: bu xato biz kutgan, "normal" xato.
    // Kutilmagan (dastur bug'i) xatolar esa isOperational bo'lmaydi va
    // ular productionda foydalanuvchiga batafsil ko'rsatilmaydi.
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  // --- Qulay "fabrika" metodlari ---

  static badRequest(message = "So'rov noto'g'ri yuborildi", details) {
    return new ApiError(400, ERROR_CODES.BAD_REQUEST, message, details);
  }

  static unauthorized(message = 'Avtorizatsiya talab qilinadi', details) {
    return new ApiError(401, ERROR_CODES.UNAUTHORIZED, message, details);
  }

  static tokenExpired(message = 'Token muddati tugagan, yangilang') {
    return new ApiError(401, ERROR_CODES.TOKEN_EXPIRED, message);
  }

  static forbidden(message = 'Bu amalni bajarishga ruxsatingiz yo\'q', details) {
    return new ApiError(403, ERROR_CODES.FORBIDDEN, message, details);
  }

  static notFound(message = 'Resurs topilmadi', details) {
    return new ApiError(404, ERROR_CODES.NOT_FOUND, message, details);
  }

  static conflict(message = "Bunday ma'lumot allaqachon mavjud", details) {
    return new ApiError(409, ERROR_CODES.CONFLICT, message, details);
  }

  static validation(message = "Kiritilgan ma'lumotlar noto'g'ri", details) {
    return new ApiError(422, ERROR_CODES.VALIDATION_ERROR, message, details);
  }

  static unprocessable(message = "So'rovni bajarib bo'lmadi", details) {
    return new ApiError(422, ERROR_CODES.UNPROCESSABLE, message, details);
  }

  static tooManyRequests(message = "Juda ko'p so'rov yubordingiz, biroz kuting", details) {
    return new ApiError(429, ERROR_CODES.TOO_MANY_REQUESTS, message, details);
  }

  static payloadTooLarge(message = 'Yuborilgan ma\'lumot hajmi juda katta', details) {
    return new ApiError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message, details);
  }

  static unsupportedMedia(message = "Fayl turi qo'llab-quvvatlanmaydi", details) {
    return new ApiError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, message, details);
  }

  static internal(message = 'Serverda kutilmagan xatolik yuz berdi', details) {
    return new ApiError(500, ERROR_CODES.INTERNAL_ERROR, message, details);
  }

  static database(message = "Ma'lumotlar bazasida xatolik", details) {
    return new ApiError(500, ERROR_CODES.DATABASE_ERROR, message, details);
  }

  static serviceUnavailable(message = 'Xizmat vaqtincha ishlamayapti', details) {
    return new ApiError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message, details);
  }
}

module.exports = { ApiError, ERROR_CODES };
