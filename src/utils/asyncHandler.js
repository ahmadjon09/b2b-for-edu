/**
 * =============================================================
 * src/utils/asyncHandler.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: async controller funksiyalaridagi xatolarni
 * avtomatik ravishda Express'ning error handler'iga uzatish.
 *
 * MUAMMO: Express 4 da async funksiya ichida `throw` qilsangiz,
 * Express uni USHLAMAYDI — natijada so'rov "osilib" qoladi
 * (client javob kutib turaveradi) va serverda
 * `UnhandledPromiseRejection` chiqadi.
 *
 * YECHIM: har bir async controller'ni shu wrapper bilan o'raymiz:
 *
 *   router.get('/', asyncHandler(async (req, res) => { ... }));
 *
 * Endi ichkarida `throw ApiError.notFound()` qilsangiz ham,
 * xato avtomatik `next(err)` orqali errorHandler'ga boradi.
 * =============================================================
 */

'use strict';

/**
 * @param {Function} fn async (req, res, next) => {...}
 * @returns {Function} Express uchun xavfsiz middleware
 */
function asyncHandler(fn) {
  return function wrappedHandler(req, res, next) {
    // Promise.resolve — fn sync bo'lsa ham, async bo'lsa ham ishlaydi
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
