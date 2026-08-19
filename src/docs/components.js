/**
 * =============================================================
 * src/docs/components.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: OpenAPI 3.0 "components" bo'limi — qayta
 * ishlatiladigan sxemalar, javoblar, parametrlar va xavfsizlik
 * sxemasi.
 *
 * NEGA ALOHIDA FAYL? Swagger spetsifikatsiyasi juda uzun bo'lib
 * ketadi. Uni `components` (nima) va `paths` (qayerda) ga bo'lsak,
 * o'qish va tahrirlash osonlashadi.
 * =============================================================
 */

'use strict';

/* -------------------------------------------------------------
 * XAVFSIZLIK SXEMASI
 * ----------------------------------------------------------- */
const securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      "Access token. Avval `POST /api/v1/auth/login` orqali token oling, " +
      "so'ng Swagger'dagi yashil **Authorize** tugmasini bosib token'ni kiriting " +
      "(faqat token'ning o'zi, `Bearer ` so'zisiz).",
  },
};

/* -------------------------------------------------------------
 * UMUMIY (ENVELOPE) SXEMALAR
 * ----------------------------------------------------------- */
const envelopeSchemas = {
  Meta: {
    type: 'object',
    description: "Har bir javobda qaytadigan texnik ma'lumot",
    properties: {
      requestId: { type: 'string', example: '5f2c1a9e-2f7d-4c1a-9c2b-9a1f0e3d4b55' },
      timestamp: { type: 'string', format: 'date-time', example: '2026-08-19T12:00:00.000Z' },
    },
  },

  Pagination: {
    type: 'object',
    properties: {
      currentPage: { type: 'integer', example: 1 },
      totalPages: { type: 'integer', example: 5 },
      totalItems: { type: 'integer', example: 42 },
      limit: { type: 'integer', example: 10 },
      hasNextPage: { type: 'boolean', example: true },
      hasPrevPage: { type: 'boolean', example: false },
    },
  },

  ErrorObject: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Mashina o‘qishi uchun xato kodi',
        example: 'VALIDATION_ERROR',
        enum: [
          'VALIDATION_ERROR',
          'BAD_REQUEST',
          'UNAUTHORIZED',
          'TOKEN_EXPIRED',
          'FORBIDDEN',
          'NOT_FOUND',
          'CONFLICT',
          'UNPROCESSABLE',
          'TOO_MANY_REQUESTS',
          'PAYLOAD_TOO_LARGE',
          'UNSUPPORTED_MEDIA_TYPE',
          'INTERNAL_ERROR',
          'SERVICE_UNAVAILABLE',
          'DATABASE_ERROR',
        ],
      },
      message: { type: 'string', example: "Kiritilgan ma'lumotlar noto'g'ri" },
      details: {
        description: "Qo'shimcha tafsilotlar (masalan qaysi maydon xato)",
        nullable: true,
        example: [{ field: 'email', message: "Email formati noto'g'ri" }],
      },
    },
  },

  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { $ref: '#/components/schemas/ErrorObject' },
      meta: {
        allOf: [
          { $ref: '#/components/schemas/Meta' },
          {
            type: 'object',
            properties: {
              path: { type: 'string', example: '/api/v1/products' },
              method: { type: 'string', example: 'POST' },
            },
          },
        ],
      },
    },
  },
};

/* -------------------------------------------------------------
 * DOMEN SXEMALARI
 * ----------------------------------------------------------- */
const domainSchemas = {
  Role: { type: 'string', enum: ['ADMIN', 'SELLER', 'USER'], example: 'USER' },

  OrderStatus: {
    type: 'string',
    enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    example: 'PENDING',
  },

  User: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Ali Valiyev' },
      email: { type: 'string', format: 'email', example: 'ali@example.com' },
      phone: { type: 'string', nullable: true, example: '+998901234567' },
      role: { $ref: '#/components/schemas/Role' },
      avatarUrl: { type: 'string', nullable: true, example: 'https://i.ibb.co/xxx/avatar.png' },
      isActive: { type: 'boolean', example: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      stats: {
        type: 'object',
        description: "Cache'dan hisoblanadigan statistika",
        properties: {
          productCount: { type: 'integer', example: 3 },
          orderCount: { type: 'integer', example: 7 },
          totalSpent: { type: 'number', example: 1250.5 },
          soldItemCount: { type: 'integer', example: 19 },
        },
      },
    },
  },

  Category: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Elektronika' },
      description: { type: 'string', nullable: true, example: 'Maishiy texnika va gadjetlar' },
      imageUrl: { type: 'string', nullable: true },
      productCount: { type: 'integer', example: 12 },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  Product: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', example: 'Simsiz quloqchin TWS-90' },
      description: { type: 'string', nullable: true },
      price: { type: 'number', format: 'double', example: 249.99 },
      stock: { type: 'integer', example: 40 },
      imageUrl: { type: 'string', nullable: true },
      isActive: { type: 'boolean', example: true },
      categoryId: { type: 'string', format: 'uuid' },
      sellerId: { type: 'string', format: 'uuid' },
      category: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Elektronika' },
          imageUrl: { type: 'string', nullable: true },
        },
      },
      seller: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'TechShop MChJ' },
          email: { type: 'string', format: 'email' },
        },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  OrderItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      orderId: { type: 'string', format: 'uuid' },
      productId: { type: 'string', format: 'uuid' },
      sellerId: { type: 'string', format: 'uuid' },
      quantity: { type: 'integer', example: 2 },
      priceAtOrder: {
        type: 'number',
        example: 249.99,
        description: "Buyurtma berilgan paytdagi narx — keyin mahsulot narxi o'zgarsa ham bu o'zgarmaydi",
      },
      subtotal: { type: 'number', example: 499.98 },
      product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          imageUrl: { type: 'string', nullable: true },
          currentPrice: { type: 'number', nullable: true },
        },
      },
    },
  },

  Order: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      buyerId: { type: 'string', format: 'uuid' },
      status: { $ref: '#/components/schemas/OrderStatus' },
      totalPrice: { type: 'number', example: 749.97 },
      note: { type: 'string', nullable: true },
      itemCount: { type: 'integer', example: 2 },
      totalQuantity: { type: 'integer', example: 5 },
      buyer: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      items: { type: 'array', items: { $ref: '#/components/schemas/OrderItem' } },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  AuditLog: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid', nullable: true },
      action: {
        type: 'string',
        example: 'CREATE',
        enum: [
          'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'REGISTER',
          'REFRESH_TOKEN', 'STATUS_CHANGE', 'UPLOAD', 'DB_SYNC_FAILED',
          'SERVER_ERROR', 'CLEANUP',
        ],
      },
      entity: { type: 'string', example: 'Product' },
      entityId: { type: 'string', nullable: true },
      meta: { type: 'object', description: "Ixtiyoriy JSON — IP, user-agent, o'zgargan maydonlar va h.k." },
      createdAt: { type: 'string', format: 'date-time' },
      user: { type: 'object', nullable: true },
    },
  },

  AuthTokens: {
    type: 'object',
    properties: {
      accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      accessTokenExpiresIn: { type: 'string', example: '15m' },
      refreshTokenExpiresIn: { type: 'string', example: '7d' },
      user: { $ref: '#/components/schemas/User' },
    },
  },

  UploadResult: {
    type: 'object',
    properties: {
      url: { type: 'string', example: 'https://i.ibb.co/abc123/rasm.jpg' },
      thumbUrl: { type: 'string' },
      deleteUrl: { type: 'string', nullable: true },
      size: { type: 'integer', example: 154321 },
      width: { type: 'integer', nullable: true },
      height: { type: 'integer', nullable: true },
      originalName: { type: 'string', example: 'mahsulot.jpg' },
      mimeType: { type: 'string', example: 'image/jpeg' },
    },
  },
};

/* -------------------------------------------------------------
 * TAYYOR JAVOBLAR (qayta ishlatish uchun)
 * ----------------------------------------------------------- */
function errorResponse(description, code, message) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: {
          success: false,
          error: { code, message },
          meta: {
            requestId: '5f2c1a9e-2f7d-4c1a-9c2b-9a1f0e3d4b55',
            timestamp: '2026-08-19T12:00:00.000Z',
            path: '/api/v1/...',
            method: 'GET',
          },
        },
      },
    },
  };
}

const responses = {
  BadRequest: errorResponse("So'rov noto'g'ri tuzilgan", 'BAD_REQUEST', "So'rov noto'g'ri"),
  ValidationError: errorResponse(
    "Validatsiya xatosi — `error.details` da qaysi maydon xato ekani ko'rsatiladi",
    'VALIDATION_ERROR',
    "Kiritilgan ma'lumotlar noto'g'ri"
  ),
  Unauthorized: errorResponse(
    "Token yo'q, yaroqsiz yoki muddati o'tgan",
    'UNAUTHORIZED',
    "Avtorizatsiya talab qilinadi. Authorization: Bearer <token> sarlavhasini yuboring"
  ),
  Forbidden: errorResponse(
    "Roli yoki egaligi yetarli emas",
    'FORBIDDEN',
    "Bu amalni bajarishga ruxsatingiz yo'q"
  ),
  NotFound: errorResponse('Resurs topilmadi', 'NOT_FOUND', 'Resurs topilmadi'),
  Conflict: errorResponse('Ziddiyat — masalan takrorlanuvchi nom yoki email', 'CONFLICT', 'Bunday yozuv allaqachon mavjud'),
  Unprocessable: errorResponse(
    "Biznes-qoida buzildi (masalan omborda yetarli mahsulot yo'q)",
    'UNPROCESSABLE',
    "Amalni bajarib bo'lmadi"
  ),
  TooManyRequests: errorResponse(
    "Rate limit — juda ko'p so'rov yuborildi",
    'TOO_MANY_REQUESTS',
    "Juda ko'p so'rov yubordingiz. Biroz kutib qayta urinib ko'ring"
  ),
  ServerError: errorResponse('Serverdagi kutilmagan xato', 'INTERNAL_ERROR', 'Serverda kutilmagan xato yuz berdi'),
};

/* -------------------------------------------------------------
 * UMUMIY PARAMETRLAR
 * ----------------------------------------------------------- */
const parameters = {
  IdParam: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'Resurs identifikatori (UUID)',
  },
  PageParam: {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, default: 1 },
    description: 'Sahifa raqami (1 dan boshlanadi)',
  },
  LimitParam: {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
    description: 'Bir sahifadagi yozuvlar soni (maksimal 100)',
  },
  SearchParam: {
    name: 'search',
    in: 'query',
    schema: { type: 'string' },
    description: "Matnli qidiruv (registrga sezgir emas)",
  },
  OrderParam: {
    name: 'order',
    in: 'query',
    schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    description: "Saralash yo'nalishi",
  },
};

module.exports = {
  securitySchemes,
  schemas: { ...envelopeSchemas, ...domainSchemas },
  responses,
  parameters,
};
