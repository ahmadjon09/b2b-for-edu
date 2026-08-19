/**
 * =============================================================
 * src/modules/categories/categories.validation.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kategoriya endpointlari uchun kirish ma'lumotlari
 * tekshiruvi.
 * =============================================================
 */

'use strict';

const { z } = require('zod');
const { buildListQuerySchema, optionalUrl } = require('../../utils/commonValidation');

/** POST /categories */
const createCategorySchema = z.object({
  name: z
    .string({ required_error: 'Kategoriya nomi majburiy' })
    .trim()
    .min(2, "Nom kamida 2 ta belgidan iborat bo'lsin")
    .max(60, "Nom 60 ta belgidan oshmasin"),
  description: z.string().trim().max(500, "Tavsif 500 ta belgidan oshmasin").optional().nullable(),
  imageUrl: optionalUrl,
});

/** PATCH /categories/:id — barcha maydonlar ixtiyoriy */
const updateCategorySchema = createCategorySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "O'zgartirish uchun kamida bitta maydon yuboring (name, description yoki imageUrl)" }
);

/** GET /categories — filtr va saralash */
const listCategoriesSchema = buildListQuerySchema(['name', 'createdAt', 'updatedAt']);

module.exports = { createCategorySchema, updateCategorySchema, listCategoriesSchema };
