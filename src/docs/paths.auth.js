/**
 * =============================================================
 * src/docs/paths.auth.js
 * -------------------------------------------------------------
 * Auth endpointlarining OpenAPI ta'rifi.
 * =============================================================
 */

'use strict';

const TAG = 'Auth';

/** Muvaffaqiyatli javob qobig'ini yasovchi yordamchi */
function ok(description, schemaRef, example) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: schemaRef,
            meta: { $ref: '#/components/schemas/Meta' },
          },
        },
        ...(example ? { example } : {}),
      },
    },
  };
}

module.exports = {
  '/auth/register': {
    post: {
      tags: [TAG],
      summary: "Ro'yxatdan o'tish",
      description:
        "Yangi foydalanuvchi yaratadi va darhol access + refresh token qaytaradi.\n\n" +
        "**Muhim:** `role` sifatida faqat `USER` yoki `SELLER` yuborish mumkin. " +
        "`ADMIN` rolini faqat mavjud admin `PATCH /users/{id}/role` orqali bera oladi.\n\n" +
        "Rate limit: daqiqasiga 5 ta so'rov (IP bo'yicha).",
      security: [], // token kerak emas
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 80, example: 'Ali Valiyev' },
                email: { type: 'string', format: 'email', example: 'ali@example.com' },
                password: { type: 'string', minLength: 6, maxLength: 72, example: 'parol123' },
                role: { type: 'string', enum: ['USER', 'SELLER'], default: 'USER' },
                avatarUrl: { type: 'string', nullable: true },
              },
            },
            example: { name: 'Ali Valiyev', email: 'ali@example.com', password: 'parol123', role: 'SELLER' },
          },
        },
      },
      responses: {
        201: ok("Foydalanuvchi yaratildi", { $ref: '#/components/schemas/AuthTokens' }),
        400: { $ref: '#/components/responses/ValidationError' },
        409: { $ref: '#/components/responses/Conflict' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    },
  },

  '/auth/login': {
    post: {
      tags: [TAG],
      summary: 'Tizimga kirish',
      description:
        "Email va parol orqali kirish. Muvaffaqiyatli bo'lsa access (15 daqiqa) va " +
        "refresh (7 kun) tokenlarini qaytaradi.\n\n" +
        "**Xavfsizlik eslatmasi:** email topilmasa ham, parol xato bo'lsa ham " +
        "**bir xil** xabar qaytadi — shunda hujumchi qaysi emaillar mavjudligini bilib ololmaydi.\n\n" +
        "Rate limit: daqiqasiga 5 ta urinish.",
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email', example: 'admin@b2b.uz' },
                password: { type: 'string', example: 'Admin123!' },
              },
            },
          },
        },
      },
      responses: {
        200: ok('Kirish muvaffaqiyatli', { $ref: '#/components/schemas/AuthTokens' }),
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    },
  },

  '/auth/refresh': {
    post: {
      tags: [TAG],
      summary: 'Tokenni yangilash',
      description:
        "Access token muddati tugaganda, refresh token orqali yangi juftlik olinadi.\n\n" +
        "**Token rotation:** har safar yangi refresh token beriladi, eskisi bekor qilinadi. " +
        "Agar allaqachon ishlatilgan (bekor qilingan) refresh token qayta yuborilsa — " +
        "bu o'g'irlik belgisi hisoblanadi va foydalanuvchining **barcha** sessiyalari yopiladi.",
      security: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['refreshToken'],
              properties: { refreshToken: { type: 'string' } },
            },
          },
        },
      },
      responses: {
        200: ok('Yangi tokenlar', { $ref: '#/components/schemas/AuthTokens' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    },
  },

  '/auth/logout': {
    post: {
      tags: [TAG],
      summary: 'Tizimdan chiqish',
      description:
        "`refreshToken` yuborilsa — faqat o'sha qurilma sessiyasi yopiladi.\n" +
        "Yuborilmasa — **barcha qurilmalardagi** sessiyalar yopiladi.",
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { refreshToken: { type: 'string' } } },
          },
        },
      },
      responses: {
        200: ok('Chiqish bajarildi', { type: 'object' }),
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },

  '/auth/me': {
    get: {
      tags: [TAG],
      summary: 'Joriy foydalanuvchi profili',
      description: 'Token egasi haqidagi to‘liq ma’lumotni qaytaradi.',
      responses: {
        200: ok('Profil', { $ref: '#/components/schemas/User' }),
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },

  '/auth/change-password': {
    patch: {
      tags: [TAG],
      summary: "Parolni o'zgartirish",
      description:
        "Joriy parolni tekshirib, yangisini o'rnatadi.\n\n" +
        "**Diqqat:** parol o'zgargach barcha refresh tokenlar bekor qilinadi — " +
        "foydalanuvchi hamma qurilmada qaytadan kirishi kerak bo'ladi.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['oldPassword', 'newPassword'],
              properties: {
                oldPassword: { type: 'string', example: 'eskiParol123' },
                newPassword: { type: 'string', minLength: 6, example: 'yangiParol456' },
              },
            },
          },
        },
      },
      responses: {
        200: ok("Parol o'zgartirildi", { type: 'object' }),
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },
};
