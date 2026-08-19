/**
 * =============================================================
 * src/modules/auth/auth.validation.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Auth endpointlariga keladigan ma'lumotlarni
 * tekshirish qoidalari (zod sxemalari).
 *
 * Bu yerda faqat "shakl" tekshiriladi: email haqiqiy emailmi,
 * parol yetarlicha uzunmi va h.k. Biznes-mantiq (masalan bu
 * email band emasmi) service qatlamida tekshiriladi.
 * =============================================================
 */

'use strict';

const { z } = require('zod');

/** Parol qoidalari — bir joyda, chunki bir necha sxemada ishlatiladi */
const passwordSchema = z
  .string({ required_error: 'Parol majburiy' })
  .min(6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak")
  .max(72, "Parol 72 ta belgidan oshmasligi kerak (bcrypt cheklovi)");

const emailSchema = z
  .string({ required_error: 'Email majburiy' })
  .trim()
  .toLowerCase()
  .email("Email formati noto'g'ri. Masalan: user@example.com");

/** POST /auth/register */
const registerSchema = z.object({
  name: z
    .string({ required_error: 'Ism majburiy' })
    .trim()
    .min(2, "Ism kamida 2 ta belgidan iborat bo'lsin")
    .max(80, "Ism 80 ta belgidan oshmasin"),
  email: emailSchema,
  password: passwordSchema,
  // Ro'yxatdan o'tishda faqat USER yoki SELLER tanlash mumkin.
  // ADMIN rolini faqat mavjud admin bera oladi (xavfsizlik!).
  role: z
    .enum(['USER', 'SELLER'], {
      errorMap: () => ({ message: "Rol faqat 'USER' yoki 'SELLER' bo'lishi mumkin" }),
    })
    .optional()
    .default('USER'),
  avatarUrl: z.string().url("avatarUrl to'g'ri URL bo'lishi kerak").optional().nullable(),
});

/** POST /auth/login */
const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ required_error: 'Parol majburiy' }).min(1, "Parol bo'sh bo'lmasin"),
});

/** POST /auth/refresh */
const refreshSchema = z.object({
  refreshToken: z
    .string({ required_error: 'refreshToken majburiy' })
    .min(20, "refreshToken noto'g'ri ko'rinishda"),
});

/** POST /auth/logout */
const logoutSchema = z.object({
  refreshToken: z.string().min(20, "refreshToken noto'g'ri ko'rinishda").optional(),
});

/** PATCH /auth/change-password */
const changePasswordSchema = z.object({
  oldPassword: z.string({ required_error: 'Joriy parol majburiy' }).min(1, "Joriy parolni kiriting"),
  newPassword: passwordSchema,
});

module.exports = { registerSchema, loginSchema, refreshSchema, logoutSchema, changePasswordSchema, passwordSchema, emailSchema };
