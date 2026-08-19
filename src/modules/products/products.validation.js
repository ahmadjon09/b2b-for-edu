/**
 * =============================================================
 * src/modules/products/products.validation.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Mahsulot endpointlari uchun validatsiya qoidalari.
 * =============================================================
 */

'use strict';

const { z } = require('zod');
const { buildListQuerySchema, optionalUrl, priceSchema } = require('../../utils/commonValidation');

/** POST /products */
const createProductSchema = z.object({
  title: z
    .string({ required_error: 'Mahsulot nomi majburiy' })
    .trim()
    .min(2, "Nom kamida 2 ta belgidan iborat bo'lsin")
    .max(150, "Nom 150 ta belgidan oshmasin"),
  description: z.string().trim().max(2000, "Tavsif 2000 ta belgidan oshmasin").optional().nullable(),
  price: priceSchema,
  stock: z.coerce
    .number({ invalid_type_error: "Ombor qoldig'i son bo'lishi kerak" })
    .int("stock butun son bo'lishi kerak")
    .min(0, "stock manfiy bo'lishi mumkin emas")
    .max(1_000_000, 'stock juda katta')
    .optional()
    .default(0),
  imageUrl: optionalUrl,
  categoryId: z
    .string({ required_error: 'categoryId majburiy' })
    .uuid("categoryId noto'g'ri formatda — UUID bo'lishi kerak"),
  // sellerId yuborilmaydi — server uni tokendan oladi.
  // Faqat ADMIN boshqa sotuvchi nomidan mahsulot qo'sha oladi.
  sellerId: z.string().uuid("sellerId noto'g'ri formatda").optional(),
  isActive: z.coerce.boolean().optional().default(true),
});

/** PATCH /products/:id */
const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });

/** GET /products — filtr + saralash */
const listProductsSchema = buildListQuerySchema(['title', 'price', 'stock', 'createdAt', 'updatedAt'], {
  categoryId: z.string().uuid("categoryId noto'g'ri formatda").optional(),
  sellerId: z.string().uuid("sellerId noto'g'ri formatda").optional(),
  minPrice: z.coerce.number().min(0, "minPrice manfiy bo'lmasin").optional(),
  maxPrice: z.coerce.number().min(0, "maxPrice manfiy bo'lmasin").optional(),
  inStock: z
    .enum(['true', 'false'], { errorMap: () => ({ message: "inStock 'true' yoki 'false' bo'lsin" }) })
    .optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsSchema };
