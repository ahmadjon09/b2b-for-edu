/**
 * =============================================================
 * src/docs/paths.catalog.js
 * -------------------------------------------------------------
 * Categories va Products endpointlarining OpenAPI ta'rifi.
 * =============================================================
 */

'use strict';

/** Oddiy `data` javobi */
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

/** Sahifalangan ro'yxat javobi */
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
  /* ================= CATEGORIES ================= */
  '/categories': {
    get: {
      tags: ['Categories'],
      summary: "Kategoriyalar ro'yxati",
      description:
        "Ochiq endpoint — token shart emas. Ma'lumot **cache'dan** o'qiladi, " +
        "shuning uchun juda tez. Har bir kategoriya bilan birga `productCount` qaytadi.",
      security: [],
      parameters: [
        ...COMMON_LIST_PARAMS,
        {
          name: 'sortBy',
          in: 'query',
          schema: { type: 'string', enum: ['name', 'createdAt', 'updatedAt'], default: 'createdAt' },
        },
      ],
      responses: {
        200: okList('Kategoriyalar', { $ref: '#/components/schemas/Category' }),
        400: { $ref: '#/components/responses/ValidationError' },
      },
    },
    post: {
      tags: ['Categories'],
      summary: 'Yangi kategoriya (ADMIN)',
      description:
        "Faqat ADMIN. Kategoriya avval **cache'ga** yoziladi va javob darhol qaytadi, " +
        "DB'ga yozish esa fonda bajariladi.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 2, maxLength: 60, example: 'Elektronika' },
                description: { type: 'string', nullable: true, example: 'Gadjetlar va texnika' },
                imageUrl: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        201: ok('Yaratildi', { $ref: '#/components/schemas/Category' }),
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: { $ref: '#/components/responses/Conflict' },
      },
    },
  },

  '/categories/{id}': {
    get: {
      tags: ['Categories'],
      summary: 'Bitta kategoriya',
      security: [],
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok('Kategoriya', { $ref: '#/components/schemas/Category' }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Categories'],
      summary: 'Kategoriyani yangilash (ADMIN)',
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                name: { type: 'string' },
                description: { type: 'string', nullable: true },
                imageUrl: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        200: ok('Yangilandi', { $ref: '#/components/schemas/Category' }),
        400: { $ref: '#/components/responses/ValidationError' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
      },
    },
    delete: {
      tags: ['Categories'],
      summary: "Kategoriyani o'chirish (ADMIN)",
      description: "Agar kategoriyaga tegishli mahsulot bo'lsa — o'chirishga ruxsat berilmaydi (409).",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok("O'chirildi", { type: 'object', properties: { deleted: { type: 'boolean' }, id: { type: 'string' } } }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
      },
    },
  },

  /* ================= PRODUCTS ================= */
  '/products': {
    get: {
      tags: ['Products'],
      summary: "Mahsulotlar ro'yxati",
      description:
        "Ochiq endpoint. Barcha filtrlarni birga ishlatish mumkin, masalan:\n\n" +
        "`/api/v1/products?categoryId=...&minPrice=100&maxPrice=500&inStock=true&sortBy=price&order=asc&page=2`\n\n" +
        "**Eslatma:** mehmon va oddiy USER faqat `isActive=true` mahsulotlarni ko'radi. " +
        "ADMIN va SELLER `isActive=false` ni ham ko'ra oladi.",
      security: [],
      parameters: [
        ...COMMON_LIST_PARAMS,
        {
          name: 'sortBy',
          in: 'query',
          schema: { type: 'string', enum: ['title', 'price', 'stock', 'createdAt', 'updatedAt'], default: 'createdAt' },
        },
        { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'sellerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'minPrice', in: 'query', schema: { type: 'number', minimum: 0 }, example: 100 },
        { name: 'maxPrice', in: 'query', schema: { type: 'number', minimum: 0 }, example: 900 },
        {
          name: 'inStock',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false'] },
          description: "`true` — faqat omborda bor mahsulotlar (stock > 0)",
        },
        { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      ],
      responses: {
        200: okList('Mahsulotlar', { $ref: '#/components/schemas/Product' }),
        400: { $ref: '#/components/responses/ValidationError' },
      },
    },
    post: {
      tags: ['Products'],
      summary: 'Yangi mahsulot (SELLER yoki ADMIN)',
      description:
        "SELLER faqat **o'zi uchun** mahsulot qo'sha oladi — `sellerId` tokendan olinadi.\n" +
        "ADMIN esa `sellerId` ni ko'rsatib, boshqa sotuvchi nomidan qo'sha oladi.\n\n" +
        "`imageUrl` uchun avval `POST /uploads/image` orqali rasm yuklab, qaytgan `url` ni yozing.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'price', 'categoryId'],
              properties: {
                title: { type: 'string', minLength: 2, maxLength: 150, example: 'Simsiz quloqchin TWS-90' },
                description: { type: 'string', nullable: true },
                price: { type: 'number', minimum: 0, example: 249.99 },
                stock: { type: 'integer', minimum: 0, default: 0, example: 40 },
                imageUrl: { type: 'string', nullable: true },
                categoryId: { type: 'string', format: 'uuid' },
                sellerId: { type: 'string', format: 'uuid', description: 'Faqat ADMIN uchun' },
                isActive: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        201: ok('Yaratildi', { $ref: '#/components/schemas/Product' }),
        400: { $ref: '#/components/responses/ValidationError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/products/my/list': {
    get: {
      tags: ['Products'],
      summary: "Sotuvchining o'z mahsulotlari (SELLER/ADMIN)",
      description: "`GET /products?sellerId=<mening id>` ning qisqa varianti.",
      parameters: [
        ...COMMON_LIST_PARAMS,
        { name: 'isActive', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
      ],
      responses: {
        200: okList('Mahsulotlar', { $ref: '#/components/schemas/Product' }),
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    },
  },

  '/products/{id}': {
    get: {
      tags: ['Products'],
      summary: 'Bitta mahsulot',
      security: [],
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok('Mahsulot', { $ref: '#/components/schemas/Product' }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    patch: {
      tags: ['Products'],
      summary: 'Mahsulotni yangilash (egasi yoki ADMIN)',
      description: "SELLER faqat **o'z** mahsulotini tahrirlay oladi, aks holda 403 qaytadi.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              minProperties: 1,
              properties: {
                title: { type: 'string' },
                description: { type: 'string', nullable: true },
                price: { type: 'number', minimum: 0 },
                stock: { type: 'integer', minimum: 0 },
                imageUrl: { type: 'string', nullable: true },
                categoryId: { type: 'string', format: 'uuid' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        200: ok('Yangilandi', { $ref: '#/components/schemas/Product' }),
        400: { $ref: '#/components/responses/ValidationError' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
    delete: {
      tags: ['Products'],
      summary: "Mahsulotni o'chirish (egasi yoki ADMIN)",
      description:
        "Agar mahsulot biror buyurtmada ishlatilgan bo'lsa — u **o'chirilmaydi**, " +
        "balki `isActive: false` qilinadi (soft delete). Bu buyurtmalar tarixi buzilmasligi uchun.\n\n" +
        "Javobdagi `deleted` va `deactivated` maydonlariga qarab qaysi holat bo'lganini bilasiz.",
      parameters: [{ $ref: '#/components/parameters/IdParam' }],
      responses: {
        200: ok(
          "O'chirildi yoki deaktivatsiya qilindi",
          {
            type: 'object',
            properties: {
              deleted: { type: 'boolean', example: false },
              deactivated: { type: 'boolean', example: true },
              id: { type: 'string', format: 'uuid' },
              message: { type: 'string' },
            },
          }
        ),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },
};
