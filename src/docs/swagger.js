/**
 * =============================================================
 * src/docs/swagger.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: To'liq OpenAPI 3.0 spetsifikatsiyasini yig'ish va
 * Swagger UI'ni Express'ga ulash.
 *
 * NEGA `swagger-jsdoc` ISHLATILMADI?
 *   `swagger-jsdoc` kod izohlaridan (JSDoc) spetsifikatsiya
 *   yasaydi. Bu qulay, lekin: (1) izohlar juda uzayib ketadi,
 *   (2) YAML xatolarini topish qiyin, (3) IDE yordam bermaydi.
 *   Biz esa oddiy JS obyektlari yozdik — bu yerda avtoto'ldirish
 *   ham ishlaydi, xato ham darhol ko'rinadi.
 *
 * MANZILLAR:
 *   /api-docs      -> interaktiv Swagger UI
 *   /api-docs.json -> "xom" OpenAPI JSON (Postman/Insomnia importi uchun)
 *   /docs          -> qo'lda yozilgan statik HTML qo'llanma
 * =============================================================
 */

'use strict';

const swaggerUi = require('swagger-ui-express');
const env = require('../config/env');
const components = require('./components');
const pathsAuth = require('./paths.auth');
const pathsCatalog = require('./paths.catalog');
const pathsOperations = require('./paths.operations');

const pkg = require('../../package.json');

/* -------------------------------------------------------------
 * UMUMIY TAVSIF (Swagger UI'ning yuqori qismida ko'rinadi)
 * ----------------------------------------------------------- */
const DESCRIPTION = `
Junior dasturchilar uchun **o'quv B2B REST API**.

Bu API oddiy CRUD emas — unda haqiqiy loyihalarda uchraydigan mavzular yig'ilgan:
rollar, JWT, cache, fon jarayonlari, audit, rate limiting va mustahkam xatoliklarni boshqarish.

---

### 1. Qanday boshlash kerak (3 qadam)

1. **Kirish:** \`POST /api/v1/auth/login\` — demo admin: \`admin@b2b.uz\` / \`Admin123!\`
2. Javobdan \`data.accessToken\` ni nusxalang
3. Yuqoridagi yashil **Authorize** tugmasini bosib, token'ni joylashtiring (\`Bearer \` so'zisiz)

Endi barcha himoyalangan endpointlarni sinab ko'rishingiz mumkin.

---

### 2. Javob formati — har doim bir xil

Muvaffaqiyatli javob:
\`\`\`json
{
  "success": true,
  "message": "Mahsulot yaratildi",
  "data": { "...": "..." },
  "pagination": { "currentPage": 1, "totalPages": 5, "totalItems": 42, "limit": 10, "hasNextPage": true, "hasPrevPage": false },
  "meta": { "requestId": "...", "timestamp": "2026-08-19T12:00:00.000Z" }
}
\`\`\`

Xatolik:
\`\`\`json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Kiritilgan ma'lumotlar noto'g'ri", "details": [ { "field": "price", "message": "Narx manfiy bo'lmasligi kerak" } ] },
  "meta": { "requestId": "...", "timestamp": "...", "path": "/api/v1/products", "method": "POST" }
}
\`\`\`

\`success\` maydonini tekshirish yetarli — kodda \`if (res.data.success)\` deb yozaverasiz.

---

### 3. Rollar

| Rol | Nima qila oladi |
|-----|-----------------|
| **ADMIN** | Hamma narsa: kategoriyalar, barcha mahsulot va buyurtmalar, foydalanuvchilar, audit loglar |
| **SELLER** | O'z mahsulotlarini boshqaradi, o'z mahsuloti bor buyurtmalarni ko'radi va holatini o'zgartiradi |
| **USER** | Katalogni ko'radi, buyurtma beradi, faqat o'z buyurtmalarini ko'radi va bekor qila oladi |

Mehmon (tokensiz) — faqat kategoriyalar va faol mahsulotlarni ko'ra oladi.

---

### 4. Cache (RAM) qanday ishlaydi — va nega Redis emas?

Bu loyihada **Redis yo'q**. Uning o'rniga Node.js jarayonining o'z xotirasida (\`Map\`) cache saqlanadi:

1. Server ishga tushganda DB'dan hamma narsa RAM'ga yuklanadi (*warm-up*)
2. Barcha \`GET\` so'rovlar **faqat RAM'dan** o'qiydi — DB'ga umuman bormaydi
3. \`POST/PATCH/DELETE\` — avval RAM yangilanadi va javob **darhol** qaytadi
4. DB'ga yozish esa navbat (queue) orqali **fonda** bajariladi
5. Agar DB'ga yozib bo'lmasa — 3 marta qayta uriniladi (500ms → 1s → 2s), baribir bo'lmasa RAM eski holatga qaytariladi va audit logga \`DB_SYNC_FAILED\` yoziladi

**Nega bu productionga yaramaydi?**
- Bir nechta server nusxasi (instance) bo'lsa, har birining o'z RAM'i bo'ladi va ular bir-biridan bexabar qoladi
- Server qayta ishga tushsa — navbatda turgan yozuvlar yo'qoladi
- Ma'lumotlar hajmi RAM sig'imidan oshib ketishi mumkin

**Productionda qanday bo'lishi kerak:** Redis (yoki Memcached) — u alohida jarayon bo'lgani uchun barcha server nusxalari bitta cache'ni baham ko'radi, TTL va \`INVALIDATE\` mexanizmlari tayyor, ma'lumot diskka saqlanadi (persistence). Yozish esa avval **DB'ga** (write-through) qilinib, keyin cache yangilanadi.

---

### 5. Rate limiting

| Endpoint turi | Limit |
|---------------|-------|
| Umumiy (barcha API) | ${env.RATE_LIMIT_MAX} so'rov / ${Math.round(env.RATE_LIMIT_WINDOW_MS / 1000)} soniya |
| \`/auth/login\`, \`/auth/register\` | ${env.AUTH_RATE_LIMIT_MAX} so'rov / daqiqa |
| Rasm yuklash | 10 so'rov / daqiqa |

Limit tokenli foydalanuvchida **user id**, tokensizda **IP** bo'yicha hisoblanadi.
Limitdan oshsangiz \`429\` va \`Retry-After\` sarlavhasi qaytadi.

---

### 6. Xatolik kodlari

\`VALIDATION_ERROR\` (400) · \`UNAUTHORIZED\` (401) · \`TOKEN_EXPIRED\` (401) · \`FORBIDDEN\` (403) ·
\`NOT_FOUND\` (404) · \`CONFLICT\` (409) · \`PAYLOAD_TOO_LARGE\` (413) · \`UNSUPPORTED_MEDIA_TYPE\` (415) ·
\`UNPROCESSABLE\` (422) · \`TOO_MANY_REQUESTS\` (429) · \`INTERNAL_ERROR\` (500) · \`SERVICE_UNAVAILABLE\` (503)

**401 vs 403 farqi:** 401 — "kim ekaningizni bilmayapman" (token yo'q/yaroqsiz).
403 — "kim ekaningizni bilaman, lekin ruxsatingiz yo'q".

**400 vs 422 farqi:** 400 — so'rov shakli noto'g'ri (masalan \`price\` matn ko'rinishida).
422 — shakl to'g'ri, lekin biznes-qoida buzildi (masalan omborda mahsulot yetarli emas).

Batafsil qo'llanma: [/docs](/docs)
`.trim();

/* -------------------------------------------------------------
 * SPETSIFIKATSIYA
 * ----------------------------------------------------------- */
const swaggerSpec = {
  openapi: '3.0.3',

  info: {
    title: 'B2B Demo API',
    version: pkg.version || '1.0.0',
    description: DESCRIPTION,
    contact: { name: "O'quv loyiha", url: 'https://github.com/' },
    license: { name: 'MIT' },
  },

  servers: [
    { url: '/api/v1', description: 'Joriy server (nisbiy manzil)' },
    { url: `http://localhost:${env.PORT}/api/v1`, description: 'Lokal ishga tushirish' },
  ],

  // Sukut bo'yicha BARCHA endpointlar token talab qiladi.
  // Ochiq endpointlarda `security: []` deb bekor qilinadi.
  security: [{ bearerAuth: [] }],

  tags: [
    { name: 'Auth', description: "Ro'yxatdan o'tish, kirish, token yangilash" },
    { name: 'Categories', description: 'Mahsulot kategoriyalari (boshqarish — ADMIN)' },
    { name: 'Products', description: 'Mahsulotlar katalogi' },
    { name: 'Orders', description: 'Buyurtmalar va ularning holati' },
    { name: 'Users', description: 'Foydalanuvchilarni boshqarish' },
    { name: 'Uploads', description: "Rasm yuklash (imgbb.com)" },
    { name: 'Audit', description: "Amallar jurnali (faqat ADMIN)" },
    { name: 'System', description: "Sog'liq, cache statistikasi" },
  ],

  components: {
    securitySchemes: components.securitySchemes,
    schemas: components.schemas,
    responses: components.responses,
    parameters: components.parameters,
  },

  paths: {
    ...pathsAuth,
    ...pathsCatalog,
    ...pathsOperations,
  },
};

/* -------------------------------------------------------------
 * SWAGGER UI SOZLAMALARI
 * ----------------------------------------------------------- */
const uiOptions = {
  customSiteTitle: 'B2B Demo API — Swagger',
  customCss: `
    .topbar { display: none }
    .swagger-ui .info .title { font-size: 2.2rem }
    .swagger-ui .info { margin: 24px 0 }
    .swagger-ui table { font-size: 13px }
  `,
  swaggerOptions: {
    persistAuthorization: true,  // sahifa yangilanganda token saqlanadi
    displayRequestDuration: true,
    docExpansion: 'none',        // bo'limlar yig'ilgan holda ochiladi
    filter: true,                // qidiruv maydoni
    tryItOutEnabled: true,
    defaultModelsExpandDepth: 1,
  },
};

/**
 * Swagger UI va JSON endpointlarini Express ilovasiga ulaydi.
 *
 * @param {import('express').Express} app
 */
function mountSwagger(app) {
  // "Xom" spetsifikatsiya — Postman yoki kod generatorlari uchun
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(swaggerSpec, null, 2));
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, uiOptions));
}

module.exports = { swaggerSpec, mountSwagger };
