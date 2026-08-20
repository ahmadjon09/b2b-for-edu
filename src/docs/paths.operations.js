/**
 * =============================================================
 * src/docs/paths.operations.js
 * -------------------------------------------------------------
 * Orders, Users, Uploads, Audit va System endpointlari.
 * =============================================================
 */

'use strict';

function ok(description, schemaRef) {
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
      },
    },
  };
}

function okList(description, itemRef) {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: itemRef },
            pagination: { $ref: '#/components/schemas/Pagination' },
            meta: { $ref: '#/components/schemas/Meta' },
          },
        },
      },
    },
  };
}

const COMMON_LIST_PARAMS = [
  { $ref: '#/components/parameters/PageParam' },
  { $ref: '#/components/parameters/LimitParam' },
  { $ref: '#/components/parameters/SearchParam' },
  { $ref: '#/components/parameters/OrderParam' },
];

module.exports = {
  /* ================= ORDERS ================= */
  '/orders': {
    get: {
      tags: ['Orders'],
      summary: "Buyurtmalar ro'yxati (rol asosida filtrlanadi)",
      description:
        "Kim nimani ko'radi:\n" +
        "- **USER** — faqat o'zi bergan buyurtmalarni\n" +
        "- **SELLER** — tarkibida o'z mahsuloti bor buyurtmalarni (faqat o'ziga tegishli qatorlar ko'rinadi)\n" +
        "- **ADMIN** — hammasini\n\n" +
        "Bu filtrlash **serverda** amalga oshiriladi, ya'ni `?buyerId=` ni o'zgartirib " +
        "boshqa odamning buyurtmalarini ko'rib bo'lmaydi (403 qaytadi).",
      parameters: [
        ...COMMON_LIST_PARAMS,
        {
          name: 'sortBy',
          in: 'query',
          schema: { type: 'string', enum: ['createdAt', 'updatedAt', 'totalPrice', 'status'], default: 'createdAt' },
        },
        { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/OrderStatus' } },
        { name: 'buyerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'sellerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'minPrice', in: 'query', schema: { type: 'number', minimum: 0 } },
        { name: 'maxPrice', in: 'query', schema: { type: 'number', minimum: 0 } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' }, example: '2026-01-01' },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' }, example: '2026-12-31' },
      ],
      responses: {
        200: okList('Buyurtmalar', { $ref: '#/components/schemas/Order' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
    post: {
      tags: ['Orders'],
      summary: 'Yangi buyurtma berish',
      description:
        "Bir nechta mahsulotni bitta buyurtmada yuborish mumkin.\n\n" +
        "**Server nima qiladi:**\n" +
        "1. Har bir mahsulot mavjudligini, faolligini va omborda yetarliligini tekshiradi\n" +
        "2. Umumiy summani hisoblaydi (`price * quantity` yig'indisi)\n" +
        "3. Har bir qatorga o'sha paytdagi narxni `priceAtOrder` sifatida **muzlatib** qo'yadi\n" +
        "4. Ombor qoldig'ini kamaytiradi\n" +
        "5. Buyurtmani `PENDING` holatida yaratadi\n\n" +
        "**Cheklovlar:** o'z mahsulotingizni sotib ololmaysiz; " +
        "omborda yetarli bo'lmasa 422 xatosi qaytadi va qancha qolganini aytadi.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                items: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 50,
                  items: {
                    type: 'object',
                    required: ['productId', 'quantity'],
                    properties: {
                      productId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'integer', minimum: 1, example: 2 },
                    },
                  },
                },
                note: { type: 'string', nullable: true, maxLength: 500, example: 'Ertalab yetkazib bering' },
              },
            },
            example: {
              items: [
                { productId: '3f1a...', quantity: 2 },
                { productId: '9c7b...', quantity: 1 },
              ],
              note: 'Tez yetkazib berilsin',
            },
          },
        },
      },
      responses: {
        201: ok('Buyurtma qabul qilindi', { $ref: '#/components/schemas/Order' }),
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        422: { $ref: '#/components/responses/Unprocessable' },
      },
    },
  },

  '/orders/my': {
    get: {
      tags: ['Orders'],
      summary: 'Mening buyurtmalarim',
      parameters: COMMON_LIST_PARAMS,
      responses: {
        200: okList('Buyurtmalar', { $ref: '#/components/schemas/Order' }),
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },

  '/orders/stats': {
    get: {
      tags: ['Orders'],
      summary: 'Buyurtmalar statistikasi',
      description: "Rolga qarab hisoblanadi: ADMIN — butun tizim, SELLER — o'z savdosi, USER — o'z xaridlari.",
      responses: {
        200: ok('Statistika', {
          type: 'object',
          properties: {
            totalOrders: { type: 'integer', example: 128 },
            byStatus: { type: 'object', example: { PENDING: 12, CONFIRMED: 40, DELIVERED: 70, CANCELLED: 6 } },
            revenue: { type: 'number', example: 45230.75 },
            averageOrderValue: { type: 'number', example: 353.36 },
          },
        }),
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },

  '/orders/{id}': {
    get: {
      tags: ['Orders'],
      summary: 'Bitta buyurtma',
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok('Buyurtma', { $ref: '#/components/schemas/Order' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Orders'],
      summary: "Buyurtmani o'chirish (ADMIN)",
      description: "Faqat `CANCELLED` holatidagi buyurtmani o'chirish mumkin.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok("O'chirildi", { type: 'object' }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        422: { $ref: '#/components/responses/Unprocessable' },
      },
    },
  },

  '/orders/{id}/status': {
    patch: {
      tags: ['Orders'],
      summary: "Buyurtma holatini o'zgartirish",
      description:
        "**Status mashinasi** — faqat quyidagi o'tishlarga ruxsat:\n\n" +
        "```\n" +
        "PENDING   -> CONFIRMED | CANCELLED\n" +
        "CONFIRMED -> SHIPPED   | CANCELLED\n" +
        "SHIPPED   -> DELIVERED | CANCELLED\n" +
        "DELIVERED -> (yakuniy holat)\n" +
        "CANCELLED -> (yakuniy holat)\n" +
        "```\n\n" +
        "**Kim o'zgartira oladi:**\n" +
        "- **USER** — faqat o'z buyurtmasini `CANCELLED` qila oladi\n" +
        "- **SELLER** — o'z mahsuloti bor buyurtmani oldinga suradi\n" +
        "- **ADMIN** — hammasini\n\n" +
        "Buyurtma bekor qilinsa, ombor qoldig'i avtomatik **qaytariladi**.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { $ref: '#/components/schemas/OrderStatus' },
                note: { type: 'string', nullable: true, maxLength: 500 },
              },
            },
            example: { status: 'CONFIRMED' },
          },
        },
      },
      responses: {
        200: ok("Holat o'zgartirildi", { $ref: '#/components/schemas/Order' }),
        400: { $ref: '#/components/responses/BadRequest' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        422: { $ref: '#/components/responses/Unprocessable' },
      },
    },
  },

  /* ================= USERS ================= */
  '/users': {
    get: {
      tags: ['Users'],
      summary: "Foydalanuvchilar ro'yxati (ADMIN)",
      parameters: [
        ...COMMON_LIST_PARAMS,
        {
          name: 'sortBy',
          in: 'query',
          schema: { type: 'string', enum: ['name', 'email', 'role', 'createdAt', 'updatedAt'], default: 'createdAt' },
        },
        { name: 'role', in: 'query', schema: { $ref: '#/components/schemas/Role' } },
        { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      ],
      responses: {
        200: okList('Foydalanuvchilar', { $ref: '#/components/schemas/User' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/users/{id}': {
    get: {
      tags: ['Users'],
      summary: "Bitta foydalanuvchi (o'zi yoki ADMIN)",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok('Foydalanuvchi', { $ref: '#/components/schemas/User' }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Users'],
      summary: "Profilni yangilash (o'zi yoki ADMIN)",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 80 },
                email: { type: 'string', format: 'email' },
                phone: { type: 'string', nullable: true, example: '+998901234567' },
                avatarUrl: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        200: ok('Yangilandi', { $ref: '#/components/schemas/User' }),
        400: { $ref: '#/components/responses/ValidationError' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: { $ref: '#/components/responses/Conflict' },
      },
    },
    delete: {
      tags: ['Users'],
      summary: "Foydalanuvchini o'chirish (ADMIN)",
      description:
        "Agar foydalanuvchida mahsulot yoki buyurtma bo'lsa — u o'chirilmaydi, " +
        "balki bloklanadi (`isActive: false`). Bu bog'liq ma'lumotlar yo'qolmasligi uchun.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok("O'chirildi yoki bloklandi", { type: 'object' }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        422: { $ref: '#/components/responses/Unprocessable' },
      },
    },
  },

  '/users/{id}/role': {
    patch: {
      tags: ['Users'],
      summary: "Rolni o'zgartirish (ADMIN)",
      description: "Admin o'z rolini pasaytira olmaydi va tizimda kamida bitta faol ADMIN qolishi shart.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['role'],
              properties: { role: { $ref: '#/components/schemas/Role' } },
            },
            example: { role: 'SELLER' },
          },
        },
      },
      responses: {
        200: ok("Rol o'zgartirildi", { $ref: '#/components/schemas/User' }),
        400: { $ref: '#/components/responses/BadRequest' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        422: { $ref: '#/components/responses/Unprocessable' },
      },
    },
  },

  '/users/{id}/status': {
    patch: {
      tags: ['Users'],
      summary: 'Bloklash / blokdan chiqarish (ADMIN)',
      description:
        "`isActive: false` qilinganda foydalanuvchining barcha refresh tokenlari bekor qilinadi " +
        "va u mavjud access token bilan ham API'ga kira olmaydi (403).",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['isActive'],
              properties: {
                isActive: { type: 'boolean', example: false },
                reason: { type: 'string', maxLength: 300, example: 'Qoidabuzarlik' },
              },
            },
          },
        },
      },
      responses: {
        200: ok("Holat o'zgartirildi", { $ref: '#/components/schemas/User' }),
        400: { $ref: '#/components/responses/BadRequest' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },

  /* ================= UPLOADS ================= */
  '/uploads/info': {
    get: {
      tags: ['Uploads'],
      summary: 'Yuklash qoidalari',
      description: 'Maksimal hajm, ruxsat etilgan turlar va maydon nomlari.',
      security: [],
      responses: { 200: ok('Qoidalar', { type: 'object' }) },
    },
  },

  '/uploads/image': {
    post: {
      tags: ['Uploads'],
      summary: 'Bitta rasm yuklash',
      description:
        "Rasm **imgbb.com** ga yuklanadi va doimiy URL qaytadi. Bu URL'ni mahsulot yoki " +
        "profil yaratishda `imageUrl` / `avatarUrl` maydoniga yozing.\n\n" +
        "Form maydoni nomi: **`image`**. Content-Type: `multipart/form-data`.\n\n" +
        "Rate limit: daqiqasiga 10 ta yuklash.",
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['image'],
              properties: { image: { type: 'string', format: 'binary' } },
            },
          },
        },
      },
      responses: {
        201: ok('Yuklandi', { $ref: '#/components/schemas/UploadResult' }),
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
        413: {
          description: 'Fayl juda katta',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        415: {
          description: 'Fayl turi qabul qilinmaydi',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        429: { $ref: '#/components/responses/TooManyRequests' },
        503: {
          description: "imgbb xizmati mavjud emas yoki IMGBB_API_KEY sozlanmagan",
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },

  '/uploads/images': {
    post: {
      tags: ['Uploads'],
      summary: "Bir nechta rasm yuklash (maks. 5 ta)",
      description:
        "Form maydoni nomi: **`images`**. Bitta rasm xato bo'lsa ham qolganlari yuklanadi — " +
        "javobda `uploaded` va `failed` massivlari qaytadi.",
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                images: { type: 'array', items: { type: 'string', format: 'binary' }, maxItems: 5 },
              },
            },
          },
        },
      },
      responses: {
        201: ok('Natija', {
          type: 'object',
          properties: {
            uploaded: { type: 'array', items: { $ref: '#/components/schemas/UploadResult' } },
            failed: { type: 'array', items: { type: 'object' } },
            summary: { type: 'string' },
          },
        }),
        400: { $ref: '#/components/responses/BadRequest' },
        401: { $ref: '#/components/responses/Unauthorized' },
      },
    },
  },

  /* ================= AUDIT ================= */
  '/audit-logs': {
    get: {
      tags: ['Audit'],
      summary: "Audit loglar (ADMIN)",
      description:
        "Har bir create/update/delete/login amali bu jurnalga yoziladi.\n\n" +
        "**Diqqat:** audit loglar cache'dan emas, to'g'ridan-to'g'ri **DB'dan** o'qiladi — " +
        "chunki ular \"haqiqat manbai\" bo'lishi kerak.\n\n" +
        "Loglar faqat oxirgi **7 kun** saqlanadi (`AUDIT_LOG_RETENTION_DAYS`), " +
        "eskilarini fon jarayoni avtomatik o'chiradi.",
      parameters: [
        { $ref: '#/components/parameters/PageParam' },
        { $ref: '#/components/parameters/LimitParam' },
        { $ref: '#/components/parameters/OrderParam' },
        { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'action', 'entity'] } },
        { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'action', in: 'query', schema: { type: 'string', example: 'CREATE' } },
        { name: 'entity', in: 'query', schema: { type: 'string', example: 'Product' } },
        { name: 'entityId', in: 'query', schema: { type: 'string' } },
        { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: okList('Audit loglar', { $ref: '#/components/schemas/AuditLog' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/audit-logs/stats': {
    get: {
      tags: ['Audit'],
      summary: 'Audit statistikasi (ADMIN)',
      responses: {
        200: ok('Statistika', {
          type: 'object',
          properties: {
            totalLogs: { type: 'integer', example: 842 },
            retentionDays: { type: 'integer', example: 7 },
            oldestLogAt: { type: 'string', format: 'date-time', nullable: true },
            byAction: { type: 'array', items: { type: 'object' } },
            byEntity: { type: 'array', items: { type: 'object' } },
          },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/audit-logs/actions': {
    get: {
      tags: ['Audit'],
      summary: "Mavjud action turlari (ADMIN)",
      responses: { 200: ok("Action ro'yxati", { type: 'object' }), 403: { $ref: '#/components/responses/Forbidden' } },
    },
  },

  '/audit-logs/cleanup': {
    post: {
      tags: ['Audit'],
      summary: "Eski loglarni qo'lda tozalash (ADMIN)",
      description: "Odatda buni fon jarayoni 24 soatda bir marta o'zi bajaradi.",
      responses: {
        200: ok('Tozalandi', { type: 'object', properties: { deletedCount: { type: 'integer' } } }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  /* ================= SYSTEM ================= */
  '/system/health': {
    get: {
      tags: ['System'],
      summary: 'Sog‘liq tekshiruvi',
      description: "Server, DB va cache holati. Monitoring tizimlari shu endpointni so'raydi.",
      security: [],
      responses: {
        200: ok('Holat', { type: 'object' }),
        503: {
          description: "Xizmat vaqtincha ishlamayapti (masalan DB'ga ulanib bo'lmadi)",
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },

  '/system/cache-stats': {
    get: {
      tags: ['System'],
      summary: 'Cache statistikasi (ADMIN)',
      description:
        "Har bir ombordagi yozuvlar soni, hit/miss nisbati va sinxronizatsiya navbati holati. " +
        "Javobdagi `autoRefresh` bo'limi — cache'ni har " +
        "`CACHE_REFRESH_INTERVAL_MINUTES` daqiqada (default 5) DB bilan " +
        "tenglashtiruvchi fon job'ining holati: yoqilgan/o'chirilgan, oxirgi " +
        "muvaffaqiyatli yangilanish vaqti, keyingi yangilanish vaqti, xatolar soni. " +
        "Cache mexanizmi qanday ishlayotganini kuzatish uchun juda foydali.",
      responses: {
        200: ok('Statistika', { type: 'object' }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/system/cache-reload': {
    post: {
      tags: ['System'],
      summary: 'Cache-ni DB dan qayta yuklash (ADMIN)',
      description:
        "Cache va DB o'rtasida nomuvofiqlik bo'lsa (masalan DB'ga qo'lda o'zgartirish kiritilgan bo'lsa), " +
        "shu endpoint orqali cache-ni to'liq yangilash mumkin.",
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                resource: {
                  type: 'string',
                  enum: ['users', 'categories', 'products', 'orders', 'all'],
                  default: 'all',
                },
              },
            },
          },
        },
      },
      responses: {
        200: ok('Qayta yuklandi', { type: 'object' }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/system/cache-refresh-now': {
    post: {
      tags: ['System'],
      summary: "Avtomatik yangilash job'ini hoziroq ishga tushirish (ADMIN)",
      description:
        "Cache DB bilan uch yo'l orqali sinxron turadi:\n\n" +
        "1. **Hodisa asosida** — mahsulot/buyurtma yaratilganda, o'zgarganda yoki " +
        "o'chirilganda cache darhol yangilanadi (avtomatik, kod ichida).\n" +
        "2. **Qo'lda** — ADMIN `POST /system/cache-reload` yoki shu endpointni chaqiradi.\n" +
        "3. **Davriy** — fon job'i har `CACHE_REFRESH_INTERVAL_MINUTES` daqiqada " +
        "(default: **5 daqiqa**) to'liq warm-up qiladi.\n\n" +
        "**Bu endpoint `/system/cache-reload` dan nimasi bilan farq qiladi?** " +
        "`cache-reload` warm-up funksiyasini to'g'ridan-to'g'ri chaqiradi va bitta " +
        "resursni ham yangilay oladi. `cache-refresh-now` esa AYNAN davriy job'ning " +
        "o'zini turtadi: uning \"bir vaqtda ikkita yangilanish bo'lmasin\" qulfi va " +
        "statistika hisoblagichlari ham ishlaydi. Ya'ni bu — \"5 daqiqa kutmayman, " +
        "hozir yangila\" tugmasi.\n\n" +
        "Agar ayni damda boshqa yangilanish ketayotgan bo'lsa, javobda " +
        "`refreshed: false, reason: \"BUSY\"` qaytadi — bu xato emas, oddiy holat.",
      responses: {
        200: ok('Yangilandi (yoki BUSY sababli o\'tkazib yuborildi)', { type: 'object' }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: {
          description: "Yangilash amalga oshmadi (DB javob bermadi). Eski cache saqlanib qoldi.",
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
    },
  },
};
