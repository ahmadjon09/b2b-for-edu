/**
 * =============================================================
 * src/middlewares/errorHandler.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Loyihadagi BARCHA xatolarni bitta joyda ushlab,
 * clientga bir xil formatdagi tushunarli JSON qaytarish.
 *
 * Bu fayl loyihaning "xavfsizlik to'ri" (safety net). Qaysi
 * qatlamda xato bo'lishidan qat'i nazar — controller, service,
 * Prisma, JSON parser, multer, axios — hammasi shu yerga keladi
 * va shu yerda "tarjima" qilinadi.
 *
 * ICHIDA NIMA BOR:
 *   1. translateError()  — har xil xato turlarini ApiError'ga aylantiradi
 *   2. errorHandler()    — Express'ning 4 argumentli error middleware'i
 *   3. notFoundHandler() — mavjud bo'lmagan route uchun 404
 *   4. registerProcessErrorHandlers() — process darajasidagi xatolar
 *      (unhandledRejection / uncaughtException) va graceful shutdown
 *
 * MUHIM QOIDA: xato javobida hech qachon maxfiy ma'lumot
 * (SQL matni, stack, parol, token) productionda chiqmasligi kerak.
 * =============================================================
 */

'use strict';

const { Prisma } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const { ZodError } = require('zod');
const multer = require('multer');

const env = require('../config/env');
const logger = require('../utils/logger');
const { ApiError, ERROR_CODES } = require('../utils/ApiError');
const { sendError } = require('../utils/response');

/* -------------------------------------------------------------
 * 1. Zod validatsiya xatosini o'qish oson formatga aylantirish
 * ----------------------------------------------------------- */
function formatZodError(error) {
  // Har bir muammoni { field, message, code } ko'rinishida beramiz
  return error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : '(body)',
    message: issue.message,
    code: issue.code,
  }));
}

/* -------------------------------------------------------------
 * 2. Prisma xatolarini insonga tushunarli xabarga aylantirish
 * -----------------------------------------------------------
 * Prisma xato kodlari: https://www.prisma.io/docs/reference/api-reference/error-reference
 * Eng ko'p uchraydiganlari:
 *   P2002 — unique constraint (takrorlanuvchi email va h.k.)
 *   P2003 — foreign key constraint (bog'liq yozuv yo'q)
 *   P2025 — yozuv topilmadi (update/delete paytida)
 *   P2000 — qiymat ustunga sig'madi
 *   P1001/P1002 — DB'ga ulanib bo'lmadi
 */
function translatePrismaError(error) {
  // --- Ma'lum kodli xatolar ---
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : error.meta?.target;

    switch (error.code) {
      case 'P2002':
        return ApiError.conflict(
          `Bu qiymat allaqachon mavjud${target ? `: "${target}" maydoni takrorlanmasligi kerak` : ''}`,
          { fields: error.meta?.target, prismaCode: error.code }
        );

      case 'P2003':
        return ApiError.badRequest(
          "Bog'liq yozuv topilmadi. Yuborilgan ID (masalan categoryId yoki productId) mavjud emas",
          { field: error.meta?.field_name, prismaCode: error.code }
        );

      case 'P2025':
        return ApiError.notFound(
          error.meta?.cause || "So'ralgan yozuv bazada topilmadi",
          { prismaCode: error.code }
        );

      case 'P2000':
        return ApiError.badRequest("Kiritilgan qiymat juda uzun — ustunga sig'madi", {
          column: error.meta?.column_name,
          prismaCode: error.code,
        });

      case 'P2011':
        return ApiError.badRequest("Majburiy maydon bo'sh (null) qoldirilgan", {
          constraint: error.meta?.constraint,
          prismaCode: error.code,
        });

      case 'P2014':
        return ApiError.badRequest(
          "Bu yozuvni o'zgartirib bo'lmaydi — u boshqa yozuvlar bilan bog'langan",
          { relation: error.meta?.relation_name, prismaCode: error.code }
        );

      case 'P1001':
      case 'P1002':
        return ApiError.serviceUnavailable(
          "Ma'lumotlar bazasiga ulanib bo'lmadi. Keyinroq urinib ko'ring",
          { prismaCode: error.code }
        );

      case 'P1008':
        return ApiError.serviceUnavailable("Ma'lumotlar bazasi javob bermadi (timeout)", {
          prismaCode: error.code,
        });

      default:
        return ApiError.database("Ma'lumotlar bazasida xatolik yuz berdi", {
          prismaCode: error.code,
        });
    }
  }

  // --- Prisma validatsiya xatosi (noto'g'ri so'rov tuzilgan — bu bizning bug) ---
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new ApiError(
      500,
      ERROR_CODES.DATABASE_ERROR,
      "Ma'lumotlar bazasiga noto'g'ri so'rov yuborildi (server tomonidagi xato)"
    );
  }

  // --- Ulanish/initsializatsiya xatosi ---
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return ApiError.serviceUnavailable(
      "Ma'lumotlar bazasi bilan aloqa o'rnatilmadi. DATABASE_URL to'g'riligini tekshiring"
    );
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return ApiError.internal("Ma'lumotlar bazasi drayverida jiddiy xatolik");
  }

  return null; // Prisma xatosi emas
}

/* -------------------------------------------------------------
 * 3. Har qanday xatoni ApiError'ga aylantiruvchi asosiy funksiya
 * ----------------------------------------------------------- */
function translateError(error) {
  // 3.1. Allaqachon bizning ApiError bo'lsa — shundoq qaytaramiz
  if (error instanceof ApiError) return error;

  // 3.2. Zod validatsiya xatosi
  if (error instanceof ZodError) {
    return ApiError.validation("Kiritilgan ma'lumotlar noto'g'ri", formatZodError(error));
  }

  // 3.3. JWT xatolari
  if (error instanceof jwt.TokenExpiredError) {
    return ApiError.tokenExpired(
      "Token muddati tugagan. /api/v1/auth/refresh orqali yangi token oling"
    );
  }
  if (error instanceof jwt.JsonWebTokenError) {
    return ApiError.unauthorized("Token yaroqsiz yoki buzilgan");
  }
  if (error instanceof jwt.NotBeforeError) {
    return ApiError.unauthorized("Token hali faollashmagan");
  }

  // 3.4. Multer (fayl yuklash) xatolari
  if (error instanceof multer.MulterError) {
    const map = {
      LIMIT_FILE_SIZE: ApiError.payloadTooLarge(
        `Fayl hajmi juda katta. Maksimal ruxsat: ${Math.round(env.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024)} MB`
      ),
      LIMIT_FILE_COUNT: ApiError.badRequest("Fayllar soni ruxsat etilganidan ko'p"),
      LIMIT_UNEXPECTED_FILE: ApiError.badRequest(
        `Kutilmagan fayl maydoni: "${error.field}". To'g'ri maydon nomi: "image"`
      ),
      LIMIT_PART_COUNT: ApiError.badRequest("Form-data qismlari juda ko'p"),
    };
    return map[error.code] || ApiError.badRequest(`Fayl yuklashda xatolik: ${error.message}`);
  }

  // 3.5. JSON parser xatosi (body-parser buzuq JSON yuborilganda)
  if (error?.type === 'entity.parse.failed' || (error instanceof SyntaxError && 'body' in error)) {
    return ApiError.badRequest(
      "So'rov tanasi (body) yaroqli JSON emas. Vergul/qavslarni tekshiring va Content-Type: application/json yuboring"
    );
  }
  if (error?.type === 'entity.too.large') {
    return ApiError.payloadTooLarge("So'rov tanasi (body) hajmi juda katta");
  }
  if (error?.type === 'encoding.unsupported') {
    return ApiError.badRequest("So'rov kodlanishi (encoding) qo'llab-quvvatlanmaydi");
  }

  // 3.6. CORS xatosi
  if (error?.message === 'CORS_NOT_ALLOWED') {
    return ApiError.forbidden("Bu domendan so'rov yuborishga ruxsat berilmagan (CORS)");
  }

  // 3.7. Tashqi HTTP xizmat (axios — imgbb) xatolari
  if (error?.isAxiosError) {
    if (error.code === 'ECONNABORTED') {
      return ApiError.serviceUnavailable('Tashqi xizmat javob bermadi (timeout). Keyinroq urinib ko\'ring');
    }
    if (['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(error.code)) {
      return ApiError.serviceUnavailable("Tashqi xizmatga ulanib bo'lmadi (tarmoq xatosi)");
    }
    const status = error.response?.status;
    if (status === 400) return ApiError.badRequest('Rasm yuklash xizmati so\'rovni rad etdi (fayl formati noto\'g\'ri bo\'lishi mumkin)');
    if (status === 401 || status === 403) return ApiError.serviceUnavailable('Rasm yuklash xizmati API kaliti yaroqsiz');
    return ApiError.serviceUnavailable('Tashqi xizmatda xatolik yuz berdi');
  }

  // 3.8. Tarmoq xatolari (umumiy)
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(error?.code)) {
    return ApiError.serviceUnavailable('Tashqi xizmat bilan aloqa uzildi');
  }

  // 3.9. Prisma xatolari
  const prismaError = translatePrismaError(error);
  if (prismaError) return prismaError;

  // 3.10. Express-ning o'z xatolari (status/statusCode maydoni bor)
  if (typeof error?.status === 'number' || typeof error?.statusCode === 'number') {
    const status = error.status || error.statusCode;
    if (status >= 400 && status < 500) {
      return new ApiError(status, ERROR_CODES.BAD_REQUEST, error.message || "So'rovda xatolik");
    }
  }

  // 3.11. Hech biriga to'g'ri kelmadi — kutilmagan xato (bizning bug)
  const unknown = ApiError.internal('Serverda kutilmagan xatolik yuz berdi');
  unknown.isOperational = false;
  unknown.originalError = error;
  return unknown;
}

/* -------------------------------------------------------------
 * 4. Asosiy error handler middleware
 * -----------------------------------------------------------
 * DIQQAT: Express error middleware'i ALBATTA 4 ta argumentli
 * bo'lishi kerak: (err, req, res, next). Aks holda Express uni
 * oddiy middleware deb o'ylaydi va xatolarni yubormaydi.
 * Bu middleware app.js da ENG OXIRIDA ulanadi.
 */
function errorHandler(err, req, res, next) {
  // Agar javob allaqachon yuborilgan bo'lsa (masalan stream oqib ketgan) —
  // Express'ning standart handler'iga topshiramiz, aks holda
  // "Cannot set headers after they are sent" xatosi chiqadi.
  if (res.headersSent) {
    logger.error('Javob allaqachon yuborilgan, xato Express-ga topshirildi', err);
    return next(err);
  }

  const apiError = translateError(err);

  // --- Log yozish ---
  const who = req.user ? `${req.user.email} (${req.user.role})` : 'mehmon';
  const line = `${req.method} ${req.originalUrl} -> ${apiError.statusCode} ${apiError.code} | ${who} | reqId=${req.requestId || '-'}`;

  if (apiError.statusCode >= 500) {
    // 5xx — jiddiy, to'liq stack bilan log qilamiz
    logger.error(line, apiError.originalError || err);
  } else if (apiError.statusCode === 429) {
    logger.warn(line);
  } else {
    // 4xx — bu foydalanuvchi xatosi, qisqa log yetarli
    logger.warn(`${line} | ${apiError.message}`);
  }

  // --- Xatoni audit logga yozish (faqat jiddiy 5xx uchun) ---
  // require ichkarida — aylanma (circular) import bo'lmasligi uchun
  if (apiError.statusCode >= 500) {
    try {
      const { logAudit } = require('../audit/audit.service');
      logAudit({
        userId: req.user?.id || null,
        action: 'SERVER_ERROR',
        entity: 'System',
        entityId: null,
        meta: {
          path: req.originalUrl,
          method: req.method,
          code: apiError.code,
          message: (apiError.originalError || err)?.message?.slice(0, 500),
          requestId: req.requestId,
        },
      });
    } catch (_) {
      /* audit yozilmasa ham asosiy oqim to'xtamasin */
    }
  }

  // --- Clientga javob ---
  return sendError(res, {
    statusCode: apiError.statusCode,
    code: apiError.code,
    message: apiError.message,
    details: apiError.details,
    // Stack faqat development'da va faqat 5xx uchun ko'rsatiladi
    stack: !env.isProd && apiError.statusCode >= 500 ? (apiError.originalError || err)?.stack : undefined,
  });
}

/* -------------------------------------------------------------
 * 5. 404 — mavjud bo'lmagan route
 * -----------------------------------------------------------
 * Barcha route'lardan KEYIN, errorHandler'dan OLDIN ulanadi.
 */
function notFoundHandler(req, res, next) {
  next(
    ApiError.notFound(
      `Bunday endpoint mavjud emas: ${req.method} ${req.originalUrl}. Barcha endpointlar ro'yxatini /api-docs da ko'ring`
    )
  );
}

/* -------------------------------------------------------------
 * 6. Process darajasidagi xatolar va graceful shutdown
 * -----------------------------------------------------------
 * Bu Express'dan tashqaridagi xatolar: masalan background job
 * ichida promise reject bo'lsa. Ularni ushlamasak, Node.js
 * jarayoni to'satdan o'lib qolishi mumkin.
 */
function registerProcessErrorHandlers({ server, onShutdown } = {}) {
  let shuttingDown = false;

  // Promise reject bo'ldi, lekin .catch() yozilmagan
  process.on('unhandledRejection', (reason) => {
    logger.error("Ushlanmagan Promise rejection (unhandledRejection)", reason);
    // Serverni o'ldirmaymiz — log qilamiz va davom etamiz,
    // chunki bu demo loyiha va bitta xato butun API'ni to'xtatmasligi kerak.
  });

  // Sinxron kodda ushlanmagan xato — bu jiddiyroq holat
  process.on('uncaughtException', (error) => {
    logger.error('Ushlanmagan istisno (uncaughtException) — server xavfsiz to\'xtatilmoqda', error);
    // Bunday holatda process holati ishonchsiz bo'lib qoladi,
    // shuning uchun to'g'ri yo'l — tozalab chiqish va qayta ishga tushish
    // (productionda pm2/docker restart qiladi).
    gracefulShutdown('uncaughtException', 1);
  });

  /**
   * Serverni bosqichma-bosqich, ma'lumot yo'qotmasdan to'xtatish:
   *   1) yangi so'rovlarni qabul qilishni to'xtatish
   *   2) cache'dagi navbatni (queue) DB'ga yozib bo'lish
   *   3) DB ulanishini yopish
   */
  async function gracefulShutdown(signal, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`"${signal}" signali qabul qilindi — server to'xtatilmoqda...`);

    // Majburiy chiqish taymeri: 15 soniyada tugamasa, majburan yopamiz
    const forceTimer = setTimeout(() => {
      logger.error("Graceful shutdown 15 soniyada tugamadi — majburiy to'xtatish");
      process.exit(exitCode || 1);
    }, 15_000);
    forceTimer.unref();

    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
        logger.info('HTTP server yangi so\'rovlarni qabul qilishni to\'xtatdi');
      }
      if (typeof onShutdown === 'function') {
        await onShutdown();
      }
      clearTimeout(forceTimer);
      logger.success("Server xavfsiz to'xtatildi. Xayr!");
      process.exit(exitCode);
    } catch (error) {
      logger.error("Shutdown paytida xato", error);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return gracefulShutdown;
}

module.exports = {
  errorHandler,
  notFoundHandler,
  translateError,
  registerProcessErrorHandlers,
  formatZodError,
};
