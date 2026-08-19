/**
 * =============================================================
 * src/modules/users/users.validation.js
 * =============================================================
 */

'use strict';

const { z } = require('zod');
const { buildListQuerySchema, optionalUrl } = require('../../utils/commonValidation');

const ROLES = ['ADMIN', 'SELLER', 'USER'];

/** PATCH /users/:id — o'zi yoki admin yangilaydi */
const updateUserSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Ism kamida 2 ta belgidan iborat bo'lsin")
      .max(80, "Ism 80 ta belgidan oshmasin")
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Email formati noto'g'ri")
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9\s\-()]{7,20}$/, "Telefon raqami noto'g'ri formatda, masalan: +998901234567")
      .optional()
      .nullable(),
    avatarUrl: optionalUrl,
  })
  .strict("Ruxsat etilmagan maydon yuborildi")
  .refine((data) => Object.keys(data).length > 0, {
    message: "Yangilash uchun kamida bitta maydon yuboring",
  });

/** PATCH /users/:id/role — faqat ADMIN */
const updateRoleSchema = z.object({
  role: z.enum(ROLES, {
    errorMap: () => ({ message: `role quyidagilardan biri bo'lsin: ${ROLES.join(', ')}` }),
  }),
});

/** PATCH /users/:id/status — faqat ADMIN (bloklash / blokdan chiqarish) */
const updateStatusSchema = z.object({
  isActive: z.boolean({
    required_error: 'isActive majburiy',
    invalid_type_error: "isActive true yoki false bo'lishi kerak",
  }),
  reason: z.string().trim().max(300).optional(),
});

/** GET /users — faqat ADMIN */
const listUsersSchema = buildListQuerySchema(['name', 'email', 'role', 'createdAt', 'updatedAt'], {
  role: z.enum(ROLES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

module.exports = { updateUserSchema, updateRoleSchema, updateStatusSchema, listUsersSchema, ROLES };
