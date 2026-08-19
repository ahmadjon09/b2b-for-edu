/**
 * =============================================================
 * src/modules/categories/categories.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kategoriyalar biznes-mantiqi + "cache-first"
 * yondashuvining TO'LIQ NAMUNASI.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ O'QISH (GET):  faqat cache'dan. DB'ga MUROJAAT YO'Q.     │
 * │ YOZISH (POST/PATCH/DELETE):                              │
 * │    1) cache'ga darhol yozamiz                            │
 * │    2) clientga javob qaytaramiz (tez!)                   │
 * │    3) navbat orqali fonda DB'ga yozamiz                  │
 * │    4) xato bo'lsa — 3 marta retry, keyin cache rollback  │
 * └──────────────────────────────────────────────────────────┘
 *
 * Products va Orders modullari ham xuddi shu naqsh bo'yicha
 * yozilgan — bittasini tushunsangiz, hammasini tushunasiz.
 * =============================================================
 */

'use strict';

const { prisma } = require('../../config/db');
const cache = require('../../cache/cacheManager');
const syncQueue = require('../../cache/syncQueue');
const { ApiError } = require('../../utils/ApiError');
const { uuid, normalize } = require('../../utils/helpers');
const { getPaginationParams, paginateArray, sortArray } = require('../../utils/pagination');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');

/** sortBy uchun ruxsat etilgan maydonlar */
const SORTABLE = ['name', 'createdAt', 'updatedAt'];

/**
 * Kategoriyalar ro'yxati (cache'dan o'qiladi).
 *
 * @param {object} query { page, limit, search, sortBy, order }
 */
async function list(query = {}) {
  const { page, limit } = getPaginationParams(query);

  // 1) Cache'dan hammasini olamiz
  let items = cache.categories.getAll();

  // Cache bo'sh bo'lsa (masalan warm-up ishlamagan) — DB'dan olamiz.
  // Bu "zaxira yo'l" (fallback): cache ishlamay qolsa ham API ishlaydi.
  if (!cache.categories.isWarmedUp) {
    items = await prisma.category.findMany({ orderBy: { createdAt: 'desc' } });
    cache.categories.warmUp(items);
  }

  // 2) Qidiruv (nom bo'yicha, registrga sezgir emas)
  if (query.search) {
    const q = normalize(query.search);
    items = items.filter(
      (c) => normalize(c.name).includes(q) || normalize(c.description).includes(q)
    );
  }

  // 3) Saralash
  items = sortArray(items, query.sortBy, query.order, SORTABLE, 'createdAt');

  // 4) Har bir kategoriyaga mahsulotlar sonini qo'shamiz (cache'dan hisoblaymiz)
  const products = cache.products.getAll();
  const withCounts = items.map((c) => ({
    ...c,
    productCount: products.filter((p) => p.categoryId === c.id).length,
  }));

  // 5) Sahifalash
  return paginateArray(withCounts, page, limit);
}

/**
 * Bitta kategoriya (cache'dan, topilmasa DB'dan).
 */
async function getById(id) {
  let category = cache.categories.get(id);

  if (!category) {
    // Cache'da yo'q — DB'ni tekshiramiz (ehtimol warm-up limitidan tashqarida)
    category = await prisma.category.findUnique({ where: { id } });
    if (category) cache.categories.set(category.id, category);
  }

  if (!category) {
    throw ApiError.notFound(`Kategoriya topilmadi (id: ${id})`);
  }

  const productCount = cache.products.getAll((p) => p.categoryId === id).length;
  return { ...category, productCount };
}

/**
 * Yangi kategoriya yaratish — CACHE-FIRST.
 *
 * @param {object} payload { name, description, imageUrl }
 * @param {object} actor   so'rov yuborgan foydalanuvchi (req.user)
 */
async function create(payload, actor, meta = {}) {
  // 1) Biznes-qoida: nom takrorlanmasin (cache'dan tekshiramiz — tez)
  const duplicate = cache.categories.find((c) => normalize(c.name) === normalize(payload.name));
  if (duplicate) {
    throw ApiError.conflict(`"${payload.name}" nomli kategoriya allaqachon mavjud`);
  }

  // 2) Obyektni yasaymiz. ID'ni SERVER o'zi beradi (UUID) —
  //    shuning uchun DB'dan id kutib o'tirmaymiz va cache'dagi
  //    id keyinchalik o'zgarmaydi. Bu muhim soddalashtirish!
  const now = new Date();
  const category = {
    id: uuid(),
    name: payload.name,
    description: payload.description ?? null,
    imageUrl: payload.imageUrl ?? null,
    createdAt: now,
    updatedAt: now,
  };

  // 3) CACHE'GA DARHOL YOZAMIZ — endi barcha foydalanuvchilar
  //    (GET /categories yuborganlar) buni ko'radi.
  cache.categories.set(category.id, category);

  // 4) DB'ga yozishni NAVBATGA qo'yamiz (client kutmaydi)
  syncQueue.enqueue({
    name: 'category.create',
    meta: { entity: 'Category', entityId: category.id, userId: actor?.id },
    run: () => prisma.category.create({ data: category }),
    onSuccess: (saved) => {
      // DB haqiqiy qiymat qaytardi — cache'ni moslashtiramiz
      cache.categories.set(saved.id, saved);
    },
    onFailure: () => {
      // DB'ga yozib bo'lmadi — cache'dan olib tashlaymiz,
      // aks holda "mavjud bo'lmagan" kategoriya ko'rinib qoladi
      cache.categories.delete(category.id);
    },
  });

  logAudit({
    userId: actor?.id,
    action: AUDIT_ACTIONS.CREATE,
    entity: 'Category',
    entityId: category.id,
    meta: { name: category.name, ...meta },
  });

  return { ...category, productCount: 0 };
}

/**
 * Kategoriyani yangilash — CACHE-FIRST.
 */
async function update(id, payload, actor, meta = {}) {
  const existing = cache.categories.get(id) || (await prisma.category.findUnique({ where: { id } }));
  if (!existing) throw ApiError.notFound(`Kategoriya topilmadi (id: ${id})`);

  // Nom o'zgarayotgan bo'lsa — takrorlanmasligini tekshiramiz
  if (payload.name) {
    const duplicate = cache.categories.find(
      (c) => c.id !== id && normalize(c.name) === normalize(payload.name)
    );
    if (duplicate) throw ApiError.conflict(`"${payload.name}" nomli kategoriya allaqachon mavjud`);
  }

  const updated = { ...existing, ...payload, updatedAt: new Date() };

  // Rollback uchun eski holatni saqlab qo'yamiz
  const snapshot = { ...existing };

  cache.categories.set(id, updated);

  syncQueue.enqueue({
    name: 'category.update',
    meta: { entity: 'Category', entityId: id, userId: actor?.id },
    run: () =>
      prisma.category.update({
        where: { id },
        data: {
          name: updated.name,
          description: updated.description,
          imageUrl: updated.imageUrl,
          updatedAt: updated.updatedAt,
        },
      }),
    onSuccess: (saved) => cache.categories.set(saved.id, saved),
    onFailure: () => cache.categories.set(id, snapshot), // eski holatga qaytaramiz
  });

  logAudit({
    userId: actor?.id,
    action: AUDIT_ACTIONS.UPDATE,
    entity: 'Category',
    entityId: id,
    meta: { changes: payload, ...meta },
  });

  return updated;
}

/**
 * Kategoriyani o'chirish — CACHE-FIRST.
 * Biznes-qoida: ichida mahsulot bo'lsa o'chirib bo'lmaydi.
 */
async function remove(id, actor, meta = {}) {
  const existing = cache.categories.get(id) || (await prisma.category.findUnique({ where: { id } }));
  if (!existing) throw ApiError.notFound(`Kategoriya topilmadi (id: ${id})`);

  const productCount = cache.products.getAll((p) => p.categoryId === id).length;
  if (productCount > 0) {
    throw ApiError.conflict(
      `Bu kategoriyani o'chirib bo'lmaydi — unga ${productCount} ta mahsulot bog'langan. ` +
        'Avval mahsulotlarni boshqa kategoriyaga ko\'chiring yoki o\'chiring'
    );
  }

  cache.categories.delete(id);

  syncQueue.enqueue({
    name: 'category.delete',
    meta: { entity: 'Category', entityId: id, userId: actor?.id },
    run: () => prisma.category.delete({ where: { id } }),
    onFailure: () => cache.categories.set(id, existing), // qaytarib qo'yamiz
  });

  logAudit({
    userId: actor?.id,
    action: AUDIT_ACTIONS.DELETE,
    entity: 'Category',
    entityId: id,
    meta: { name: existing.name, ...meta },
  });

  return { deleted: true, id };
}

module.exports = { list, getById, create, update, remove };
