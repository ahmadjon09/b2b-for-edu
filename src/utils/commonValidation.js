/**
 * =============================================================
 * src/utils/commonValidation.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Bir necha modulda takrorlanadigan zod sxemalari.
 *
 * Masalan `page`, `limit`, `sortBy` — bu parametrlar HAMMA list
 * endpointda bir xil. Ularni har safar qaytadan yozish o'rniga
 * shu yerdan olib ishlatamiz.
 *
 * DIQQAT: query parametrlari doim SATR (string) ko'rinishida
 * keladi ("?page=2" -> "2"), shuning uchun `coerce` ishlatamiz —
 * u avtomatik songa aylantiradi.
 * =============================================================
 */

'use strict';

const { z } = require('zod');

/** UUID formatidagi id (route parametri uchun) */
const idParamSchema = z.object({
  id: z.string({ required_error: 'id majburiy' }).uuid("id noto'g'ri formatda — UUID bo'lishi kerak"),
});

/** Sahifalash parametrlari — barcha list endpointlar uchun umumiy */
const paginationQuery = {
  page: z.coerce
    .number()
    .int("page butun son bo'lishi kerak")
    .min(1, "page 1 dan kichik bo'lmasin")
    .optional()
    .default(1),
  limit: z.coerce
    .number()
    .int("limit butun son bo'lishi kerak")
    .min(1, "limit 1 dan kichik bo'lmasin")
    .max(100, "limit 100 dan katta bo'lmasin")
    .optional()
    .default(10),
  order: z
    .enum(['asc', 'desc'], { errorMap: () => ({ message: "order faqat 'asc' yoki 'desc' bo'lishi mumkin" }) })
    .optional()
    .default('desc'),
  search: z.string().trim().max(200, "search juda uzun").optional(),
};

/**
 * Berilgan saralash maydonlari bilan list query sxemasini yasaydi.
 * @param {string[]} sortFields ruxsat etilgan sortBy qiymatlari
 * @param {object} [extra] modulga xos qo'shimcha filtrlar
 */
function buildListQuerySchema(sortFields, extra = {}) {
  return z
    .object({
      ...paginationQuery,
      sortBy: z
        .enum(sortFields, {
          errorMap: () => ({ message: `sortBy quyidagilardan biri bo'lsin: ${sortFields.join(', ')}` }),
        })
        .optional(),
      ...extra,
    })
    .strict()
    .catchall(z.any()); // noma'lum parametrlar xato bermasin, e'tiborsiz qoldirilsin
}

/** Ixtiyoriy URL maydoni (rasm manzillari uchun) */
const optionalUrl = z
  .string()
  .trim()
  .url("To'g'ri URL kiriting (masalan https://i.ibb.co/abc/rasm.jpg)")
  .optional()
  .nullable();

/** Musbat pul summasi */
const priceSchema = z.coerce
  .number({ invalid_type_error: "Narx son bo'lishi kerak" })
  .positive("Narx 0 dan katta bo'lishi kerak")
  .max(99_999_999, 'Narx juda katta');

/** Musbat butun son (miqdor, ombor qoldig'i) */
const quantitySchema = z.coerce
  .number({ invalid_type_error: "Miqdor son bo'lishi kerak" })
  .int("Miqdor butun son bo'lishi kerak")
  .min(1, "Miqdor kamida 1 bo'lishi kerak")
  .max(1_000_000, 'Miqdor juda katta');

module.exports = { idParamSchema, paginationQuery, buildListQuerySchema, optionalUrl, priceSchema, quantitySchema };
