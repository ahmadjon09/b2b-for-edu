/**
 * =============================================================
 * src/config/env.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: `.env` faylidagi barcha o'zgaruvchilarni bitta
 * joyda o'qish, tekshirish (validatsiya) va standart qiymatlar
 * berish.
 *
 * NEGA SHUNDAY? Loyihaning istalgan joyida `process.env.XYZ`
 * yozib yurish xavfli: nomni xato yozsangiz `undefined` keladi
 * va xato faqat productionda ma'lum bo'ladi. Shuning uchun
 * hamma env o'zgaruvchilar SHU faylda bir marta o'qiladi,
 * zod bilan tekshiriladi va tayyor obyekt sifatida eksport
 * qilinadi. Majburiy o'zgaruvchi yo'q bo'lsa — server umuman
 * ishga tushmaydi (fail fast printsipi).
 * =============================================================
 */

'use strict';

require('dotenv').config();
const { z } = require('zod');

// Yordamchi: "true"/"1" kabi satrlarni boolean'ga aylantiradi
const boolFromString = (defaultValue) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ['1', 'true', 'yes'].includes(v.toLowerCase())));

// Yordamchi: satrni butun songa aylantiradi va tekshiradi
const intFromString = (defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .refine((v) => Number.isInteger(v) && v >= min && v <= max, {
      message: `butun son bo'lishi va ${min} dan ${max} gacha bo'lishi kerak`,
    });

/**
 * Env sxemasi. Bu yerda har bir o'zgaruvchi nima ekani yozilgan.
 */
const envSchema = z.object({
  // --- Server ---
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: intFromString(3000, { min: 1, max: 65535 }),

  // --- Database ---
  DATABASE_URL: z
    .string({ required_error: "DATABASE_URL majburiy — .env faylida ko'rsating" })
    .min(1, "DATABASE_URL bo'sh bo'lishi mumkin emas"),

  // --- JWT ---
  JWT_ACCESS_SECRET: z
    .string({ required_error: 'JWT_ACCESS_SECRET majburiy' })
    .min(16, "JWT_ACCESS_SECRET kamida 16 ta belgidan iborat bo'lsin"),
  JWT_REFRESH_SECRET: z
    .string({ required_error: 'JWT_REFRESH_SECRET majburiy' })
    .min(16, "JWT_REFRESH_SECRET kamida 16 ta belgidan iborat bo'lsin"),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // --- imgbb ---
  IMGBB_API_KEY: z.string().optional().default(''),
  IMGBB_UPLOAD_URL: z.string().url().default('https://api.imgbb.com/1/upload'),
  MAX_UPLOAD_SIZE_BYTES: intFromString(5 * 1024 * 1024, { min: 1024 }),

  // --- Rate limit ---
  RATE_LIMIT_WINDOW_MS: intFromString(60_000, { min: 1000 }),
  RATE_LIMIT_MAX: intFromString(100, { min: 1 }),
  AUTH_RATE_LIMIT_WINDOW_MS: intFromString(60_000, { min: 1000 }),
  AUTH_RATE_LIMIT_MAX: intFromString(5, { min: 1 }),

  // --- Audit log ---
  AUDIT_LOG_RETENTION_DAYS: intFromString(7, { min: 1, max: 365 }),
  AUDIT_CLEANUP_INTERVAL_HOURS: intFromString(24, { min: 1, max: 24 * 30 }),

  // --- Cache / sync ---
  CACHE_WARMUP_LIMIT: intFromString(5000, { min: 1 }),
  // Cache'ni DB bilan avtomatik sinxronlash oralig'i (daqiqada).
  // `0` -> avtomatik yangilash o'chadi (faqat CRUD hodisalari va
  // ADMIN'ning qo'lda `POST /api/v1/system/cache-reload` chaqiruvi qoladi).
  // Batafsil: src/jobs/cacheRefresh.job.js
  CACHE_REFRESH_INTERVAL_MINUTES: intFromString(5, { min: 0, max: 24 * 60 }),
  SYNC_MAX_RETRIES: intFromString(3, { min: 1, max: 10 }),
  SYNC_RETRY_BASE_DELAY_MS: intFromString(500, { min: 10 }),

  // --- Seed ---
  SEED_ADMIN_EMAIL: z.string().email().default('admin@b2b.uz'),
  SEED_ADMIN_PASSWORD: z.string().min(6).default('Admin123!'),

  // --- Statik fayllar / rasmlar ---
  // Lokal demo rasmlar uchun to'liq URL yasashda ishlatiladi.
  // Bo'sh qoldirilsa, PORT asosida "http://localhost:<PORT>" hisoblanadi.
  // Productionda: APP_BASE_URL=https://api.sizningdomen.uz
  APP_BASE_URL: z.string().optional().default(''),

  // --- Boshqa ---
  TRUST_PROXY: boolFromString(true),
});

// Env'ni tekshiramiz
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Server ishga tushmasin — chunki noto'g'ri konfiguratsiya bilan
  // ishlagandan ko'ra, darhol tushunarli xato berish yaxshiroq.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(
    `\n❌ .env konfiguratsiyasida xatolik bor. Server ishga tushmadi.\n${issues}\n\n` +
      `Maslahat: ".env.example" faylini nusxalab ".env" qiling va to'ldiring:\n  cp .env.example .env\n`
  );
  process.exit(1);
}

const env = parsed.data;

// Qulaylik uchun qo'shimcha hisoblangan bayroqlar
env.isProd = env.NODE_ENV === 'production';
env.isDev = env.NODE_ENV === 'development';
env.isTest = env.NODE_ENV === 'test';
env.imgbbEnabled = Boolean(env.IMGBB_API_KEY);

// Rasm URL'larini yasash uchun ildiz manzil.
// Oxiridagi "/" ni olib tashlaymiz, chunki keyin biz o'zimiz qo'shamiz.
env.baseUrl = (env.BASE_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, '');

module.exports = env;
