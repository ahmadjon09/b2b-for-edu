/**
 * =============================================================
 * src/app.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Express ilovasini yig'ish — middleware'lar,
 * route'lar va xatoliklarni boshqarish.
 *
 * DIQQAT: bu fayl serverni ISHGA TUSHIRMAYDI (`listen` yo'q).
 * U faqat `app` obyektini qaytaradi. Ishga tushirish `server.js`
 * ning ishi.
 *
 * NEGA SHUNDAY? Chunki testlarda (supertest) `app` ni port
 * ochmasdan ishlatish kerak bo'ladi. Bu Node.js dunyosidagi
 * standart naqsh.
 *
 * ┌──────────── MIDDLEWARE TARTIBI (juda muhim!) ────────────┐
 * │  1. trust proxy       — nginx orqasida to'g'ri IP olish  │
 * │  2. helmet            — xavfsizlik header'lari           │
 * │  3. cors              — brauzer ruxsatlari               │
 * │  4. compression       — javobni siqish                   │
 * │  5. body parser       — JSON o'qish                      │
 * │  6. requestContext    — requestId berish                 │
 * │  7. morgan            — HTTP loglar                      │
 * │  8. static / docs     — /docs, /api-docs                 │
 * │  9. rate limiter      — so'rovlar sonini cheklash        │
 * │ 10. ROUTE'LAR         — /api/v1/...                      │
 * │ 11. notFoundHandler   — 404                              │
 * │ 12. errorHandler      — HAMMA xatolar shu yerda tugaydi  │
 * └───────────────────────────────────────────────────────────┘
 * Tartibni buzsangiz (masalan errorHandler'ni route'lardan
 * oldin qo'ysangiz) — u umuman ishlamaydi!
 * =============================================================
 */

'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./utils/logger');
const requestContext = require('./middlewares/requestContext');
const { globalLimiter } = require('./middlewares/rateLimiter');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { mountSwagger } = require('./docs/swagger');
const apiRoutes = require('./routes');

const app = express();

/* -------------------------------------------------------------
 * 1) TRUST PROXY
 * -----------------------------------------------------------
 * Agar API nginx / Heroku / Railway orqasida ishlasa, `req.ip`
 * doim proxy'ning IP'sini ko'rsatadi. Bu rate limiting'ni
 * buzadi (hamma bitta IP'dan kelayotgandek ko'rinadi).
 * `trust proxy` yoqilsa, Express `X-Forwarded-For` header'iga
 * qaraydi va haqiqiy IP'ni oladi.
 * ----------------------------------------------------------- */
if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by'); // "men Express'man" deb aytmaymiz

/* -------------------------------------------------------------
 * 2) HELMET — xavfsizlik header'lari
 * -----------------------------------------------------------
 * XSS, clickjacking va boshqa hujumlardan himoya qiluvchi
 * HTTP header'larni qo'shadi.
 *
 * `contentSecurityPolicy: false` — chunki Swagger UI o'zining
 * inline skript va stillarini ishlatadi, qattiq CSP uni buzadi.
 * ----------------------------------------------------------- */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/* -------------------------------------------------------------
 * 3) CORS
 * -----------------------------------------------------------
 * Brauzerdan (boshqa domendan) so'rov yuborishga ruxsat.
 * Demo loyiha bo'lgani uchun hammaga ochiq. Productionda
 * `origin` ni aniq ro'yxat bilan cheklang!
 * ----------------------------------------------------------- */
app.use(
  cors({
    origin: true,          // so'rov kelgan origin'ga ruxsat
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  })
);

/* -------------------------------------------------------------
 * 4) COMPRESSION — javoblarni gzip bilan siqish
 * ----------------------------------------------------------- */
app.use(compression());

/* -------------------------------------------------------------
 * 5) BODY PARSER
 * -----------------------------------------------------------
 * `limit: '1mb'` — juda katta JSON yuborilsa 413 qaytadi.
 * Rasm yuklash bunga taalluqli emas: u multer orqali
 * `multipart/form-data` sifatida keladi.
 * ----------------------------------------------------------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* -------------------------------------------------------------
 * 6) REQUEST CONTEXT — har bir so'rovga unikal ID
 * ----------------------------------------------------------- */
app.use(requestContext);

/* -------------------------------------------------------------
 * 7) MORGAN — HTTP loglar (faqat dev rejimida batafsil)
 * ----------------------------------------------------------- */
if (env.NODE_ENV !== 'test') {
  const format = env.NODE_ENV === 'production' ? 'combined' : 'dev';
  app.use(
    morgan(format, {
      stream: { write: (message) => logger.http(message.trim()) },
      // Statik fayllar va docs loglarni to'ldirmasin
      skip: (req) => req.path.startsWith('/api-docs') || req.path.startsWith('/docs'),
    })
  );
}

/* -------------------------------------------------------------
 * 8) HUJJATLAR
 * -----------------------------------------------------------
 *   /api-docs  — interaktiv Swagger UI
 *   /docs      — qo'lda yozilgan statik HTML qo'llanma
 * ----------------------------------------------------------- */
mountSwagger(app);

const publicDir = path.join(__dirname, '..', 'public');
app.use('/static', express.static(publicDir, { maxAge: '1h' }));

app.get('/docs', (req, res) => {
  res.sendFile(path.join(publicDir, 'docs.html'));
});

/* -------------------------------------------------------------
 * 9) SODDA SOG'LIQ TEKSHIRUVI (rate limit'dan oldin!)
 * -----------------------------------------------------------
 * Batafsil versiyasi: GET /api/v1/system/health
 * ----------------------------------------------------------- */
app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) } });
});

/* -------------------------------------------------------------
 * 10) BOSH SAHIFA
 * ----------------------------------------------------------- */
app.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      message: "B2B Demo API ishlamoqda ✅",
      version: 'v1',
      api: '/api/v1',
      swagger: '/api-docs',
      openapiJson: '/api-docs.json',
      guide: '/docs',
      health: '/health',
    },
  });
});

/* -------------------------------------------------------------
 * 11) RATE LIMITER — barcha API so'rovlariga
 * ----------------------------------------------------------- */
app.use('/api', globalLimiter);

/* -------------------------------------------------------------
 * 12) ASOSIY ROUTE'LAR
 * -----------------------------------------------------------
 * `/api/v1` prefiksi — versiyalash uchun. Kelajakda v2 chiqsa,
 * eski clientlar v1 bilan ishlashda davom etadi.
 * ----------------------------------------------------------- */
app.use('/api/v1', apiRoutes);

// Versiyasiz murojaatlar uchun yordamchi xabar
app.use('/api', (req, res, next) => {
  if (req.path === '/' || req.path === '') {
    return res.json({
      success: true,
      data: { message: "API versiyasini ko'rsating: /api/v1", documentation: '/api-docs' },
    });
  }
  return next();
});

/* -------------------------------------------------------------
 * 13) 404 va MARKAZLASHGAN XATOLIK HANDLER
 * -----------------------------------------------------------
 * Bular ENG OXIRIDA turishi SHART.
 * `errorHandler` 4 ta argument oladi (err, req, res, next) —
 * Express aynan shu belgi orqali uni "xato handler" deb tanidi.
 * ----------------------------------------------------------- */
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
