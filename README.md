# B2B Demo API

> Junior dasturchilar uchun **to'liq ishlaydigan** o'quv B2B REST API.
> Node.js + Express + Prisma + PostgreSQL. Redis'siz, RAM'dagi cache bilan.
> Barcha kod izohlari va hujjatlar **o'zbek tilida**.

---

## Mundarija

1. [Bu nima?](#bu-nima)
2. [Tez boshlash](#tez-boshlash)
3. [Loyiha strukturasi](#loyiha-strukturasi)
4. [Hujjatlar](#hujjatlar)
5. [Muhit o'zgaruvchilari](#muhit-ozgaruvchilari)
6. [Endpointlar](#endpointlar)
7. [Asosiy tushunchalar](#asosiy-tushunchalar)
8. [npm skriptlari](#npm-skriptlari)
9. [Muammolarni yechish](#muammolarni-yechish)

---

## Bu nima?

**B2B** (*business to business*) — korxonalar bir-biriga ulgurji savdo qiladigan tizim.
Bu loyiha shunday platformaning **backend** qismi.

Loyiha o'quv maqsadida yozilgan, lekin kod haqiqiy production loyihalardagi kabi tashkil qilingan:

| Xususiyat | Tavsif |
|---|---|
| 🧱 **Modulli struktura** | Har mavzu o'z papkasida: `routes` → `controller` → `service` → `validation` |
| 🔐 **JWT auth** | Access (15 daq.) + refresh (7 kun) token, rotation bilan |
| 👥 **3 ta rol** | ADMIN / SELLER / USER — ikki qatlamli ruxsat tekshiruvi |
| ⚡ **In-memory cache** | Write-behind: RAM'ga yozib darhol javob, DB'ga fonda |
| 📋 **Audit log** | Har o'zgarish yoziladi, 7 kundan eskisi avto o'chadi |
| 🛡️ **Mustahkam xatoliklar** | Bitta markazlashgan `errorHandler`, hamma xato o'zbekcha |
| 📄 **Pagination + filtrlar** | Barcha ro'yxatlarda bir xil format |
| 🚦 **Rate limiting** | IP yoki foydalanuvchi bo'yicha, 4 xil daraja |
| 🖼 **Rasm yuklash** | imgbb.com orqali (ixtiyoriy) |
| 📚 **Ikki xil hujjat** | Swagger UI + statik HTML qo'llanma |

### Texnologiyalar

| Texnologiya | Vazifasi |
|---|---|
| Node.js 18+ / Express 4 | HTTP server, routing |
| PostgreSQL 14+ | Ma'lumotlar bazasi |
| Prisma 5 | ORM, migratsiyalar |
| jsonwebtoken | JWT tokenlar |
| bcryptjs | Parollarni hashlash |
| zod | Kiruvchi ma'lumot validatsiyasi |
| express-rate-limit | So'rovlar sonini cheklash |
| swagger-ui-express | Interaktiv hujjat |
| helmet, cors, compression, morgan | Xavfsizlik, siqish, loglar |

---

## Tez boshlash

### Talablar
- Node.js **18+** (`node -v`)
- PostgreSQL **14+** (`psql --version`)

### 1) Bog'liqliklarni o'rnatish
```bash
npm install
```

### 2) Bazani yaratish
```bash
sudo -u postgres psql -c "CREATE USER b2b WITH PASSWORD 'b2bpass' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE b2b_demo OWNER b2b;"
```

### 3) `.env` faylini tayyorlash
```bash
cp .env.example .env
```

`.env` ichidagi maxfiy kalitlarni **albatta** o'zgartiring:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4) Migratsiya va demo ma'lumotlar
```bash
npx prisma migrate dev     # jadvallarni yaratadi
npm run seed               # demo ma'lumotlarni yozadi
```

### 5) Ishga tushirish
```bash
npm run dev
```

Konsolda quyidagicha banner chiqadi:

```
╔══════════════════════════════════════════════════════════╗
║  🚀  B2B DEMO API ishga tushdi
╠══════════════════════════════════════════════════════════╣
║  API ildizi       : http://localhost:3000/api/v1
║  Swagger UI       : http://localhost:3000/api-docs
║  HTML qo'llanma   : http://localhost:3000/docs
╚══════════════════════════════════════════════════════════╝
```

### 6) Birinchi so'rov
```bash
# Ochiq endpoint
curl http://localhost:3000/api/v1/products?limit=3

# Kirish va token olish
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@b2b.uz","password":"Admin123!"}'
```

### Demo hisoblar (`npm run seed` dan keyin)

| Rol | Email | Parol |
|---|---|---|
| ADMIN | `admin@b2b.uz` | `Admin123!` |
| SELLER | `seller1@b2b.uz` | `Parol123!` |
| SELLER | `seller2@b2b.uz` | `Parol123!` |
| USER | `user1@b2b.uz` | `Parol123!` |
| USER | `user2@b2b.uz` | `Parol123!` |

---

## Loyiha strukturasi

```
b2b-demo-api/
├── server.js                 ← KIRISH NUQTASI: DB → cache → job → listen
├── prisma/
│   ├── schema.prisma         ← ma'lumotlar modeli
│   ├── migrations/           ← SQL migratsiyalar tarixi
│   └── seed.js               ← demo ma'lumotlar
├── public/
│   └── docs.html             ← statik HTML qo'llanma (/docs)
└── src/
    ├── app.js                ← Express: middleware'lar + route'lar
    ├── routes.js             ← barcha modul router'lari
    ├── config/
    │   ├── env.js            ← .env ni o'qiydi va TEKSHIRADI
    │   ├── db.js             ← Prisma client, connect/disconnect
    │   ├── jwt.js            ← token yaratish/tekshirish
    │   └── imgbb.js          ← rasm yuklash servisi
    ├── middlewares/
    │   ├── errorHandler.js   ← MARKAZIY xato boshqaruvi
    │   ├── auth.js           ← authenticate, requireRole
    │   ├── validate.js       ← zod sxemasi bo'yicha tekshirish
    │   ├── rateLimiter.js    ← so'rovlar sonini cheklash
    │   └── requestContext.js ← har so'rovga requestId
    ├── cache/
    │   ├── cacheManager.js   ← RAM'dagi omborlar (Map)
    │   ├── syncQueue.js      ← DB'ga fonda yozish navbati (retry bilan)
    │   └── warmup.js         ← start'da DB'dan to'ldirish
    ├── modules/
    │   ├── auth/             ← register, login, refresh, logout, me
    │   ├── users/            ← foydalanuvchilar (ADMIN)
    │   ├── categories/       ← kategoriyalar
    │   ├── products/         ← mahsulotlar
    │   ├── orders/           ← buyurtmalar
    │   ├── uploads/          ← rasm yuklash
    │   └── system/           ← health, cache-stats, cache-reload
    ├── audit/                ← audit log servisi va endpointlari
    ├── jobs/                 ← fon vazifalari
    ├── docs/                 ← Swagger/OpenAPI ta'rifi
    └── utils/                ← logger, ApiError, response, pagination
```

### Har bir modulda 4 ta fayl

| Fayl | Mas'uliyati | Nimani BILMAYDI |
|---|---|---|
| `*.routes.js` | URL → funksiya, middleware zanjiri | biznes mantiqni |
| `*.validation.js` | zod sxemalari | HTTP va DB'ni |
| `*.controller.js` | `req` dan olib service'ga uzatish, javob | DB va cache'ni |
| `*.service.js` | Biznes mantiq: cache, DB, huquqlar | HTTP'ni (`req`/`res` yo'q) |

### Bitta so'rovning yo'li

```
Client → helmet → cors → compression → express.json()
       → requestContext (requestId)
       → globalLimiter (rate limit)
       → routes.js → products.routes.js
       → writeLimiter → validate → authenticate → requireRole
       → controller → service
              ├── cache.set(...)        ← DARHOL, RAM'ga
              ├── syncQueue.enqueue()   ← DB'ga FONDA
              └── logAudit(...)
       → sendCreated(res, data)         ← 201 javob (~2 ms)

Xato bo'lsa → next(err) → errorHandler → toza JSON
```

---

## Hujjatlar

| Manzil | Nima |
|---|---|
| **`/docs`** | Statik HTML qo'llanma — batafsil, "nega shunday" izohlari bilan |
| **`/api-docs`** | Swagger UI — endpointlarni brauzerdan bevosita sinash |
| **`/api-docs.json`** | Xom OpenAPI 3.0 JSON (Postman/Insomnia'ga import qilish uchun) |
| **`/api/v1`** | API "xaritasi" — barcha modullar ro'yxati |
| **`/api/v1/system/health`** | DB, cache, navbat va xotira holati |

### Swagger UI'da avtorizatsiya
1. `POST /auth/login` → **Try it out** → demo admin → **Execute**
2. Javobdan `accessToken` ni nusxalang
3. Yuqoridagi **Authorize 🔓** tugmasi → tokenni qo'ying (faqat token, `Bearer` so'zisiz)

---

## Muhit o'zgaruvchilari

| O'zgaruvchi | Default | Izoh |
|---|---|---|
| `NODE_ENV` | `development` | `production` da stack trace yashiriladi |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | **Majburiy.** PostgreSQL ulanish satri |
| `JWT_ACCESS_SECRET` | — | **Majburiy.** Access token kaliti |
| `JWT_REFRESH_SECRET` | — | **Majburiy.** Refresh token kaliti |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token muddati |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token muddati |
| `IMGBB_API_KEY` | — | Bo'sh bo'lsa rasm yuklash o'chiq (503) |
| `MAX_UPLOAD_SIZE_BYTES` | `5242880` | 5 MB |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Limit oynasi (1 daqiqa) |
| `RATE_LIMIT_MAX` | `100` | Oynadagi maks. so'rov |
| `AUTH_RATE_LIMIT_MAX` | `5` | Login uchun alohida limit |
| `AUDIT_LOG_RETENTION_DAYS` | `7` | Loglar necha kun saqlansin |
| `AUDIT_CLEANUP_INTERVAL_HOURS` | `24` | Tozalash qanchada bir ishlasin |
| `CACHE_WARMUP_LIMIT` | `5000` | Start'da cache'ga max nechta yozuv |
| `CACHE_REFRESH_INTERVAL_MINUTES` | `5` | Cache'ni DB bilan avtomatik tenglashtirish oralig'i (daqiqa). `0` — o'chirish |
| `SYNC_MAX_RETRIES` | `3` | DB yozuvini necha marta qayta urinish |
| `SYNC_RETRY_BASE_DELAY_MS` | `500` | Backoff boshlang'ich kutish |
| `SEED_ADMIN_EMAIL` | `admin@b2b.uz` | Seed admin emaili |
| `SEED_ADMIN_PASSWORD` | `Admin123!` | Seed admin paroli |
| `TRUST_PROXY` | `false` | nginx/Heroku orqasida `true` qiling |

> ⚠️ `.env` faylini **hech qachon Git'ga yubormang**. Git'da faqat `.env.example` turadi.

---

## Endpointlar

Umumiy prefiks: **`/api/v1`**

### 🔐 Auth
| Metod | Yo'l | Ruxsat | Tavsif |
|---|---|---|---|
| POST | `/auth/register` | ochiq | Ro'yxatdan o'tish (USER/SELLER) |
| POST | `/auth/login` | ochiq | Kirish, tokenlar olish |
| POST | `/auth/refresh` | ochiq | Access tokenni yangilash |
| POST | `/auth/logout` | auth | Refresh tokenni bekor qilish |
| GET | `/auth/me` | auth | O'z profilim |
| PATCH | `/auth/change-password` | auth | Parolni almashtirish |

### 📁 Categories
| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/categories` | ochiq |
| GET | `/categories/:id` | ochiq |
| POST | `/categories` | ADMIN |
| PATCH | `/categories/:id` | ADMIN |
| DELETE | `/categories/:id` | ADMIN |

### 📦 Products
| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/products` | ochiq |
| GET | `/products/:id` | ochiq |
| GET | `/products/my` | SELLER |
| POST | `/products` | SELLER, ADMIN |
| PATCH | `/products/:id` | egasi, ADMIN |
| DELETE | `/products/:id` | egasi, ADMIN |

### 🛒 Orders
| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/orders` | auth (rolga qarab filtrlanadi) |
| GET | `/orders/my` | auth |
| GET | `/orders/stats` | auth |
| GET | `/orders/:id` | egasi, sotuvchi, ADMIN |
| POST | `/orders` | auth |
| PATCH | `/orders/:id/status` | rolga qarab |
| DELETE | `/orders/:id` | ADMIN (faqat CANCELLED) |

### 👤 Users
| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/users` | ADMIN |
| GET | `/users/:id` | o'zi yoki ADMIN |
| PATCH | `/users/:id` | o'zi yoki ADMIN |
| PATCH | `/users/:id/role` | ADMIN |
| PATCH | `/users/:id/status` | ADMIN |
| DELETE | `/users/:id` | ADMIN |

### 🖼 Uploads / 📋 Audit / ⚙️ System
| Metod | Yo'l | Ruxsat |
|---|---|---|
| GET | `/uploads/info` | ochiq |
| POST | `/uploads/image` | auth |
| POST | `/uploads/images` | auth (max 5) |
| GET | `/audit-logs` | ADMIN |
| GET | `/audit-logs/stats` | ADMIN |
| GET | `/audit-logs/actions` | ADMIN |
| POST | `/audit-logs/cleanup` | ADMIN |
| GET | `/system/health` | ochiq |
| GET | `/system/cache-stats` | ADMIN |
| POST | `/system/cache-reload` | ADMIN |
| POST | `/system/cache-refresh-now` | ADMIN |

---

## Asosiy tushunchalar

### Javob formati

Barcha javoblar bir xil ko'rinishda:

```json
{
  "success": true,
  "message": "Mahsulot yaratildi",
  "data": { "id": "uuid", "title": "Noutbuk" },
  "meta": { "requestId": "165ca88a-...", "timestamp": "2026-08-19T17:53:04.450Z" }
}
```

Ro'yxatlarda qo'shimcha `pagination`:

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "currentPage": 1, "totalPages": 3, "totalItems": 12,
    "limit": 5, "hasNextPage": true, "hasPrevPage": false
  }
}
```

Xatolar:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Kiritilgan ma'lumotlarda 1 ta xatolik bor",
    "details": [ { "field": "name", "message": "Nom kamida 2 ta belgidan iborat bo'lsin" } ]
  },
  "meta": { "requestId": "...", "path": "/api/v1/categories", "method": "POST" }
}
```

> `meta.requestId` javob header'ida ham keladi (`X-Request-Id`). Foydalanuvchi shu ID ni aytsa,
> loglardan aynan o'sha so'rovni topasiz.

### Rollar

| Rol | Ruxsatlar |
|---|---|
| **ADMIN** | Hamma narsa |
| **SELLER** | Faqat o'z mahsulotlari va o'z sotuvlari bo'lgan buyurtmalar |
| **USER** | Katalogni ko'rish, buyurtma berish, faqat o'zinikini ko'rish |
| **Mehmon** | Faqat faol mahsulot va kategoriyalar ro'yxati |

Ruxsat **ikki qatlamda** tekshiriladi:
1. Route darajasida — `requireRole('SELLER', 'ADMIN')`
2. Service ichida — `if (product.sellerId !== user.id) throw ApiError.forbidden(...)`

> Faqat 1-qatlamni yozish — OWASP API Top-10 dagi №1 xato (*Broken Object Level Authorization*).

### Buyurtma holatlari

```
PENDING ──→ CONFIRMED ──→ SHIPPED ──→ DELIVERED   (yakuniy)
   │            │            │
   └────────────┴────────────┴──────→ CANCELLED     (yakuniy)
```

- **USER** faqat `CANCELLED` qila oladi
- Bekor qilinsa — mahsulot zaxirasi qaytariladi
- Noto'g'ri o'tishda `422` + ruxsat etilgan holatlar ro'yxati qaytadi

### Cache mexanizmi (write-behind)

```
Server start:  PostgreSQL ──→ RAM (Map)

O'qish (GET):  Client ← RAM (~1 ms), bazaga bormaydi

Yozish:        1. RAM'ga yozamiz
               2. Clientga DARHOL javob  ✅
               3. FONDA navbat orqali DB'ga
               4. DB javobidan keyin RAM'ni yangilaymiz
```

Xato bo'lsa: **3 marta** qayta uriniladi (500 → 1000 → 2000 ms backoff),
baribir yiqilsa — cache **rollback** qilinadi va `DB_SYNC_FAILED` audit log yoziladi.

#### Cache qachon yangilanadi? — uchta yo'l

Bu loyihada cache **uch xil yo'l bilan** DB bilan tenglashib turadi. Ular
bir-birini almashtirmaydi — **uchalasi bir vaqtda ishlaydi**.

| # | Yo'l | Qachon ishlaydi | Kim ishga tushiradi |
|---|---|---|---|
| **A** | Hodisa asosida (event-driven) | Har `POST` / `PATCH` / `DELETE` da, **darhol** | Kodning o'zi (avtomatik) |
| **B** | Qo'lda (manual) | ADMIN tugmani bosganda | Odam |
| **C** | Davriy (scheduled) | Har **5 daqiqada** | Fon job'i (avtomatik) |

**A — hodisa asosida.** Mahsulot yaratilsa `cache.products.set(...)`, o'zgarsa
`update(...)`, o'chirilsa `delete(...)`. Bu eng tez va eng aniq yo'l: o'zgarish
ro'y bergan zahoti cache to'g'ri bo'ladi. Kod: `src/modules/*/*.service.js`.

**B — qo'lda.** Ikkita endpoint bor:

```bash
# Butun cache yoki bitta resursni DB'dan qayta yuklash
curl -X POST http://localhost:3000/api/v1/system/cache-reload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource":"products"}'      # yoki "all", "users", "categories", "orders"

# Davriy job'ning AYNAN o'zini "hozir ishga tushir" (5 daqiqa kutmasdan)
curl -X POST http://localhost:3000/api/v1/system/cache-refresh-now \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Ikkalasining farqi: `cache-reload` warm-up funksiyasini to'g'ridan-to'g'ri
chaqiradi va **bitta resursni** ham yangilay oladi. `cache-refresh-now` esa
davriy job'ni turtadi — uning **qulfi** (bir vaqtda ikkita yangilanish
ketmasligi) va **statistika hisoblagichlari** ham ishlaydi.

**C — davriy (har 5 daqiqada).** `src/jobs/cacheRefresh.job.js`. Server
ishga tushganda yoqiladi va `setInterval` orqali har
`CACHE_REFRESH_INTERVAL_MINUTES` daqiqada to'liq `warmUpCache()` qiladi.

*Nega A yetarli emas, C ham kerak?* Chunki A faqat **shu server** orqali
o'tgan o'zgarishlarni biladi. Cache DB'dan quyidagi hollarda "ajralib" qolishi
mumkin:

1. Kimdir DB'ga to'g'ridan-to'g'ri SQL yozsa (`psql`, DBeaver, migratsiya skripti).
2. Boshqa servis yoki cron shu bazaga yozsa.
3. `syncQueue` retry'dan keyin ham yiqilib, rollback qilsa — nozik holatlarda farq qolishi mumkin.
4. Bir nechta nusxada (instance) ishlatilsa — biri yozadi, ikkinchisi bilmaydi.

C ana shu "sekin oqib ketish"ni (*cache drift*) har 5 daqiqada tuzatib turadi —
ya'ni **eng yomon holatda ma'lumot 5 daqiqagacha eskiradi**, undan ko'p emas.

Job'ning holatini ko'rish:

```bash
curl http://localhost:3000/api/v1/system/cache-stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Javobdagi `autoRefresh` bo'limi:

```json
{
  "enabled": true,
  "intervalMinutes": 5,
  "runCount": 12,
  "successCount": 12,
  "failureCount": 0,
  "skippedCount": 0,
  "lastRunAt": "2026-08-19T19:38:27.711Z",
  "lastSuccessAt": "2026-08-19T19:38:27.719Z",
  "lastDurationMs": 8,
  "lastError": null,
  "nextRunAt": "2026-08-19T19:43:27.719Z",
  "isRunningNow": false
}
```

Job'ning muhim xususiyatlari (kodni o'qiyotganda e'tibor bering):

- **Hech qachon `throw` qilmaydi.** DB yiqilsa job xatoni yozib qo'yadi
  (`failureCount++`, `lastError`) va eski cache **saqlanib qoladi** — API
  ishlashda davom etadi. Fon job'idagi ishlanmagan xato butun Node
  jarayonini o'ldirishi mumkin, shuning uchun bu juda muhim.
- **Qulf (`isRunning`) bor.** Agar oldingi yangilanish hali tugamagan bo'lsa,
  yangisi ishga tushmaydi — `skippedCount` oshadi. Bu DB sekin bo'lganda
  yangilanishlarning ustma-ust tushib ketishini oldini oladi.
- **`intervalHandle.unref()`** chaqirilgan — bu taymer Node'ning
  o'chishiga to'sqinlik qilmaydi.
- Graceful shutdown'da `stopCacheRefreshJob()` chaqiriladi.

O'chirish uchun `.env` da `CACHE_REFRESH_INTERVAL_MINUTES=0` qiling — u holda
A va B yo'llari ishlashda davom etadi, faqat davriy yangilanish o'chadi.

> **Productionda bu qanday bo'lardi?** `setInterval` bitta jarayon uchun
> yaxshi, lekin 3 ta nusxa ishlayotganda uchalasi ham bir vaqtda DB'ni
> o'qiydi. To'g'ri yechim: **Redis Pub/Sub** (biri o'zgartirsa, qolganlariga
> xabar beradi) yoki **node-cron / BullMQ repeatable job** (bitta "yetakchi"
> nusxa bajaradi), yoki Kubernetes'da **CronJob**.

#### Nega Redis emas?

Bu **o'quv loyihasi**. Redis'ni o'rnatish va sozlash asosiy mavzudan chalg'itadi.
Oddiy `Map` bilan cache g'oyasini — warm-up, invalidatsiya, write-behind, rollback —
hech qanday qo'shimcha servissiz o'rganasiz.

**Hozirgi yechimning cheklovlari:**
- Server o'chsa cache yo'qoladi (warm-up qayta to'ldiradi, lekin navbatdagi yozuvlar yo'qolishi mumkin —
  shuning uchun *graceful shutdown* bor)
- Bir nechta server bilan ishlamaydi (har biri o'z RAM'ida)
- RAM cheklangan → `CACHE_WARMUP_LIMIT`
- TTL yo'q

**Productionda qanday bo'lishi kerak edi:**
- **Redis** — umumiy cache, TTL bilan
- **Redis Pub/Sub** — serverlar o'rtasida cache invalidation
- **BullMQ** — vazifalar diskda saqlanadi, server o'chsa ham yo'qolmaydi
- **Muhim:** ko'p holatda write-behind umuman kerak emas. To'g'ridan-to'g'ri DB'ga
  yozish 10 ms olsa, foydalanuvchi buni sezmaydi. **Muammo bo'lmagan joyni optimallashtirmang.**

### Xato kodlari

| HTTP | Kod | Ma'nosi |
|---|---|---|
| 400 | `BAD_REQUEST` | So'rov shakli buzuq |
| 401 | `UNAUTHORIZED` | Token yo'q/yaroqsiz |
| 401 | `TOKEN_EXPIRED` | Muddati tugadi → `/auth/refresh` |
| 403 | `FORBIDDEN` | Token bor, ruxsat yo'q |
| 404 | `NOT_FOUND` | Topilmadi |
| 409 | `CONFLICT` | Ziddiyat (email band) |
| 413 | `PAYLOAD_TOO_LARGE` | Juda katta |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Fayl turi mos emas |
| 422 | `VALIDATION_ERROR` | Maydonlar noto'g'ri |
| 422 | `UNPROCESSABLE` | Biznes qoidasi buzilgan |
| 429 | `TOO_MANY_REQUESTS` | Limit oshdi |
| 500 | `INTERNAL_ERROR` | Kutilmagan xato |
| 503 | `SERVICE_UNAVAILABLE` | DB/tashqi servis javob bermayapti |

**401 vs 403:** 401 = "kimligingizni tanimadim", 403 = "tanidim, lekin ruxsat yo'q".
**400 vs 422:** 400 = so'rov *shakli* buzuq, 422 = shakl to'g'ri, *mazmuni* qoidaga zid.

Prisma xatolari avtomatik tarjima qilinadi: `P2002` → 409, `P2003` → 400, `P2025` → 404, `P1001` → 503.

### Rate limiting

| Limiter | Cheklov | Qayerda |
|---|---|---|
| globalLimiter | 100/daqiqa | Barcha `/api/*` |
| authLimiter | 5/daqiqa | login, register, refresh (faqat **muvaffaqiyatsiz** urinishlar) |
| writeLimiter | 50/daqiqa | POST/PATCH/DELETE |
| uploadLimiter | 10/daqiqa | Rasm yuklash |

Kalit: tizimga kirgan bo'lsa `user:<id>`, aks holda `ip:<ip>`.

### Pagination va filtrlar

Umumiy: `page` (1), `limit` (10, **max 100**), `search`, `sortBy`, `order` (`asc`/`desc`).

Mahsulotlar: `categoryId`, `sellerId`, `minPrice`, `maxPrice`, `inStock`, `isActive`
Buyurtmalar: `status`, `buyerId`, `minTotal`, `maxTotal`, `dateFrom`, `dateTo`

```
GET /api/v1/products?page=2&limit=5&minPrice=1000000&inStock=true&sortBy=price&order=asc
```

### Nega narx `Decimal`, `Float` emas?

JavaScript'da `0.1 + 0.2 === 0.30000000000000004`. Pul bilan ishlaganda bunday
yaxlitlash xatolari yig'iladi. **Pulni hech qachon float'da saqlamang.**

### Nega `priceAtOrder` alohida saqlanadi?

Ertaga sotuvchi narxni oshirsa, kechagi buyurtma summasi o'zgarmasligi kerak.
Bu *snapshot* naqshi — moliyaviy ma'lumotlarda majburiy.

---

## npm skriptlari

| Buyruq | Nima qiladi |
|---|---|
| `npm run dev` | Nodemon bilan ishga tushiradi |
| `npm start` | Oddiy holda ishga tushiradi |
| `npm run seed` | Demo ma'lumotlarni yozadi |
| `npm run db:migrate` | Migratsiya yaratadi va qo'llaydi |
| `npm run db:generate` | Prisma client'ni qayta generatsiya qiladi |
| `npm run db:studio` | Bazani brauzerda ko'rish |
| `npm run db:reset` | Bazani to'liq tozalab qayta yaratadi |

---

## Muammolarni yechish

**`Can't reach database server at 127.0.0.1:5432`**
```bash
sudo service postgresql start
psql -h 127.0.0.1 -U b2b -d b2b_demo
```

**`EADDRINUSE: address already in use :::3000`**
```bash
lsof -i :3000 && kill -9 <PID>     # yoki .env da PORT=3001
```

**`JWT_ACCESS_SECRET is required`**
```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**`@prisma/client did not initialize yet`**
```bash
npx prisma generate     # schema.prisma o'zgargandan keyin HAR DOIM
```

**401 kelyapti, token esa bor**
- Header formati: `Authorization: Bearer <token>` (bitta bo'sh joy)
- Token 15 daqiqada eskiradi → `/auth/refresh`
- Swagger'da faqat tokenni qo'ying, `Bearer` so'zisiz

**Ma'lumot yaratdim, lekin bazada yo'q**
Cache write-behind ishlatadi — DB yozuvi bir necha ms keyin bo'ladi:
```bash
curl localhost:3000/api/v1/system/health          # syncQueue holati
curl "localhost:3000/api/v1/audit-logs?action=DB_SYNC_FAILED" -H "Authorization: Bearer $ADMIN"
```

**Umumiy diagnostika**
```bash
curl http://localhost:3000/api/v1/system/health
```

---

## Yangi modul qo'shish

1. `prisma/schema.prisma` ga model qo'shing → `npx prisma migrate dev --name add_xxx`
2. `src/modules/xxx/` — 4 ta fayl yozing (`categories` modulini namuna sifatida nusxalang)
3. `src/routes.js` ga qo'shing: `router.use('/xxx', xxxRoutes)`
4. Cache kerak bo'lsa: `cacheManager.js` + `warmup.js` ga qo'shing
5. Hujjat uchun: `src/docs/paths.*.js`

---

## Litsenziya

O'quv maqsadida erkin foydalanish mumkin.
