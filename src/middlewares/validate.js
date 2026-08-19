/**
 * =============================================================
 * src/middlewares/validate.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: So'rov ma'lumotlarini (body, query, params) zod
 * sxemasi bo'yicha tekshirish.
 *
 * NEGA MIDDLEWARE? Validatsiyani controller ichida yozsak, har
 * bir controller `if (!req.body.title) ...` bilan to'lib ketadi.
 * Middleware esa route darajasida ishlaydi:
 *
 *   router.post('/', validate(createProductSchema), controller.create);
 *
 * Agar ma'lumot noto'g'ri bo'lsa — controller UMUMAN ishga
 * tushmaydi, darhol 422 qaytadi. Controller esa har doim
 * "toza" ma'lumot bilan ishlaydi.
 *
 * QO'SHIMCHA: zod `parse` natijasini qaytarib qo'yamiz —
 * shunda type coercion (masalan "10" -> 10) ham amalga oshadi.
 * =============================================================
 */

'use strict';

const { ZodError } = require('zod');
const { ApiError } = require('../utils/ApiError');
const { formatZodError } = require('./errorHandler');

/**
 * @param {object} schemas { body?, query?, params? } — zod sxemalari
 * @returns Express middleware
 */
function validate(schemas = {}) {
  return function validationMiddleware(req, res, next) {
    try {
      const errors = [];

      // --- body ---
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body ?? {});
        if (result.success) {
          req.body = result.data;
        } else {
          errors.push(...formatZodError(result.error).map((e) => ({ ...e, in: 'body' })));
        }
      }

      // --- query ---
      // DIQQAT: Express 5 da req.query faqat o'qish uchun (getter),
      // shuning uchun natijani alohida `req.validatedQuery` ga ham yozamiz.
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query ?? {});
        if (result.success) {
          req.validatedQuery = result.data;
          try {
            req.query = result.data;
          } catch (_) {
            /* Express 5 da yozib bo'lmaydi — validatedQuery ishlatiladi */
          }
        } else {
          errors.push(...formatZodError(result.error).map((e) => ({ ...e, in: 'query' })));
        }
      }

      // --- params ---
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params ?? {});
        if (result.success) {
          req.validatedParams = result.data;
        } else {
          errors.push(...formatZodError(result.error).map((e) => ({ ...e, in: 'params' })));
        }
      }

      if (errors.length > 0) {
        // Bitta umumiy, lekin batafsil xato qaytaramiz
        return next(
          ApiError.validation(
            `Kiritilgan ma'lumotlarda ${errors.length} ta xatolik bor. Quyidagi maydonlarni tekshiring`,
            errors
          )
        );
      }

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(ApiError.validation("Ma'lumotlar noto'g'ri", formatZodError(error)));
      }
      return next(error);
    }
  };
}

module.exports = validate;
