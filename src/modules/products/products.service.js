/**
 * =============================================================
 * src/modules/products/products.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Mahsulotlar biznes-mantiqi.
 *
 * BU MODULDA E'TIBOR BERISH KERAK BO'LGAN NARSALAR:
 *   1) Cache-first o'qish/yozish (categories bilan bir xil naqsh)
 *   2) ROL asosida ruxsat: SELLER faqat O'Z mahsulotini tahrirlaydi
 *   3) Filtrlash: categoryId, sellerId, minPrice, maxPrice, search
 *   4) Bog'liq ma'lumotni cache'dan "yig'ish" (category va seller
 *      obyektlarini mahsulotga qo'shib berish) — DB'da JOIN
 *      qilish o'rniga RAM'da birlashtiramiz.
 * =============================================================
 */

'use strict';

const { prisma } = require('../../config/db');
const cache = require('../../cache/cacheManager');
const syncQueue = require('../../cache/syncQueue');
const { ApiError } = require('../../utils/ApiError');
const { uuid, normalize, toNumber, round2 } = require('../../utils/helpers');
const { getPaginationParams, paginateArray, sortArray } = require('../../utils/pagination');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');

const SORTABLE = ['title', 'price', 'stock', 'createdAt', 'updatedAt'];

/* -------------------------------------------------------------
 * Yordamchi: mahsulotga kategoriya va sotuvchi ma'lumotini qo'shadi.
 * DB'da bu `include: { category: true, seller: true }` bo'lardi,
 * bizda esa cache'dan olinadi — DB'ga umuman bormaymiz.
 * ----------------------------------------------------------- */
function enrich(product) {
  if (!product) return product;

  const category = cache.categories.get(product.categoryId);
  const seller = cache.users.get(product.sellerId);

  return {
    ...product,
    price: toNumber(product.price),
    category: category ? { id: category.id, name: category.name, imageUrl: category.imageUrl } : null,
    seller: seller ? { id: seller.id, name: seller.name, email: seller.email } : null,
  };
}

/**
 * Mahsulotlar ro'yxati — cache'dan, filtrlar bilan.
 *
 * @param {object} query { page, limit, search, categoryId, sellerId, minPrice, maxPrice, inStock, sortBy, order }
 * @param {object} [actor] so'rov yuborgan foydalanuvchi (ixtiyoriy)
 */
async function list(query = {}, actor = null) {
  const { page, limit } = getPaginationParams(query);

  // Zaxira yo'l: cache to'lmagan bo'lsa DB'dan yuklaymiz
  if (!cache.products.isWarmedUp) {
    const rows = await prisma.product.findMany({ orderBy: { createdAt: 'desc' } });
    cache.products.warmUp(rows.map((p) => ({ ...p, price: toNumber(p.price) })));
  }

  let items = cache.products.getAll();

  // --- FILTRLAR ---

  // 1) Faqat faol mahsulotlar (admin/seller o'zinikini nofaol holda ham ko'radi)
  if (query.isActive === 'true') items = items.filter((p) => p.isActive === true);
  else if (query.isActive === 'false') items = items.filter((p) => p.isActive === false);
  else if (!actor || actor.role === 'USER') items = items.filter((p) => p.isActive !== false);

  // 2) Kategoriya bo'yicha
  if (query.categoryId) items = items.filter((p) => p.categoryId === query.categoryId);

  // 3) Sotuvchi bo'yicha
  if (query.sellerId) items = items.filter((p) => p.sellerId === query.sellerId);

  // 4) Narx oralig'i
  if (query.minPrice !== undefined && query.minPrice !== '') {
    const min = Number(query.minPrice);
    items = items.filter((p) => toNumber(p.price) >= min);
  }
  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    const max = Number(query.maxPrice);
    items = items.filter((p) => toNumber(p.price) <= max);
  }

  // 5) Faqat omborda bori
  if (query.inStock === 'true') items = items.filter((p) => (p.stock ?? 0) > 0);
  if (query.inStock === 'false') items = items.filter((p) => (p.stock ?? 0) === 0);

  // 6) Matnli qidiruv (nom va tavsif bo'yicha)
  if (query.search) {
    const q = normalize(query.search);
    items = items.filter((p) => normalize(p.title).includes(q) || normalize(p.description).includes(q));
  }

  // --- SARALASH ---
  items = sortArray(items, query.sortBy, query.order, SORTABLE, 'createdAt');

  // --- SAHIFALASH + boyitish ---
  const result = paginateArray(items, page, limit);
  result.data = result.data.map(enrich);
  return result;
}

/**
 * Bitta mahsulot.
 */
async function getById(id) {
  let product = cache.products.get(id);

  if (!product) {
    const row = await prisma.product.findUnique({ where: { id } });
    if (row) {
      product = { ...row, price: toNumber(row.price) };
      cache.products.set(product.id, product);
    }
  }

  if (!product) throw ApiError.notFound(`Mahsulot topilmadi (id: ${id})`);
  return enrich(product);
}

/**
 * Yangi mahsulot — CACHE-FIRST.
 *
 * @param {object} payload
 * @param {object} actor req.user (SELLER yoki ADMIN)
 */
async function create(payload, actor, meta = {}) {
  // 1) Kategoriya mavjudmi? (cache'dan tekshiramiz — tez)
  const category = cache.categories.get(payload.categoryId);
  if (!category) {
    const dbCategory = await prisma.category.findUnique({ where: { id: payload.categoryId } });
    if (!dbCategory) {
      throw ApiError.badRequest(
        `Bunday kategoriya mavjud emas (categoryId: ${payload.categoryId}). ` +
          'Mavjud kategoriyalarni GET /api/v1/categories orqali ko\'ring'
      );
    }
    cache.categories.set(dbCategory.id, dbCategory);
  }

  // 2) sellerId ni aniqlaymiz.
  //    SELLER faqat O'ZI uchun mahsulot qo'sha oladi.
  //    ADMIN esa istalgan sotuvchi nomidan qo'shishi mumkin.
  let sellerId = actor.id;
  if (payload.sellerId && payload.sellerId !== actor.id) {
    if (actor.role !== 'ADMIN') {
      throw ApiError.forbidden(
        "Boshqa sotuvchi nomidan mahsulot qo'sha olmaysiz. sellerId maydonini yubormang"
      );
    }
    const seller = cache.users.get(payload.sellerId) || (await prisma.user.findUnique({ where: { id: payload.sellerId } }));
    if (!seller) throw ApiError.badRequest(`Bunday sotuvchi topilmadi (sellerId: ${payload.sellerId})`);
    if (!['SELLER', 'ADMIN'].includes(seller.role)) {
      throw ApiError.badRequest("Ko'rsatilgan foydalanuvchi sotuvchi (SELLER) emas");
    }
    sellerId = payload.sellerId;
  }

  // 3) Obyektni yasaymiz
  const now = new Date();
  const product = {
    id: uuid(),
    title: payload.title,
    description: payload.description ?? null,
    price: round2(payload.price),
    stock: payload.stock ?? 0,
    imageUrl: payload.imageUrl ?? null,
    isActive: payload.isActive !== false,
    categoryId: payload.categoryId,
    sellerId,
    createdAt: now,
    updatedAt: now,
  };

  // 4) CACHE'GA DARHOL — barcha foydalanuvchilar shu zahoti ko'radi
  cache.products.set(product.id, product);

  // 5) DB'ga fonda yozamiz
  syncQueue.enqueue({
    name: 'product.create',
    meta: { entity: 'Product', entityId: product.id, userId: actor.id },
    run: () => prisma.product.create({ data: product }),
    onSuccess: (saved) => cache.products.set(saved.id, { ...saved, price: toNumber(saved.price) }),
    onFailure: () => cache.products.delete(product.id),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.CREATE,
    entity: 'Product',
    entityId: product.id,
    meta: { title: product.title, price: product.price, ...meta },
  });

  return enrich(product);
}

/**
 * Mahsulotni yangilash — CACHE-FIRST + egalik tekshiruvi.
 */
async function update(id, payload, actor, meta = {}) {
  const existing = cache.products.get(id) || (await loadFromDb(id));
  if (!existing) throw ApiError.notFound(`Mahsulot topilmadi (id: ${id})`);

  // EGALIK TEKSHIRUVI: SELLER faqat o'z mahsulotini tahrirlaydi
  assertCanModify(existing, actor);

  // Kategoriya o'zgartirilayotgan bo'lsa — mavjudligini tekshiramiz
  if (payload.categoryId && payload.categoryId !== existing.categoryId) {
    const exists =
      cache.categories.has(payload.categoryId) ||
      (await prisma.category.findUnique({ where: { id: payload.categoryId } }));
    if (!exists) throw ApiError.badRequest(`Bunday kategoriya mavjud emas (categoryId: ${payload.categoryId})`);
  }

  // SELLER mahsulot egasini o'zgartira olmaydi
  if (payload.sellerId && payload.sellerId !== existing.sellerId && actor.role !== 'ADMIN') {
    throw ApiError.forbidden("Mahsulot egasini (sellerId) faqat ADMIN o'zgartira oladi");
  }

  const snapshot = { ...existing };
  const updated = {
    ...existing,
    ...payload,
    price: payload.price !== undefined ? round2(payload.price) : existing.price,
    updatedAt: new Date(),
  };

  cache.products.set(id, updated);

  syncQueue.enqueue({
    name: 'product.update',
    meta: { entity: 'Product', entityId: id, userId: actor.id },
    run: () =>
      prisma.product.update({
        where: { id },
        data: {
          title: updated.title,
          description: updated.description,
          price: updated.price,
          stock: updated.stock,
          imageUrl: updated.imageUrl,
          isActive: updated.isActive,
          categoryId: updated.categoryId,
          sellerId: updated.sellerId,
          updatedAt: updated.updatedAt,
        },
      }),
    onSuccess: (saved) => cache.products.set(saved.id, { ...saved, price: toNumber(saved.price) }),
    onFailure: () => cache.products.set(id, snapshot),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.UPDATE,
    entity: 'Product',
    entityId: id,
    meta: { changes: payload, ...meta },
  });

  return enrich(updated);
}

/**
 * Mahsulotni o'chirish.
 * Agar mahsulot buyurtmalarda ishlatilgan bo'lsa — DB uni o'chirishga
 * ruxsat bermaydi (onDelete: Restrict). Shuning uchun bunday holatda
 * uni "nofaol" (isActive=false) qilamiz — bu "soft delete" deyiladi.
 */
async function remove(id, actor, meta = {}) {
  const existing = cache.products.get(id) || (await loadFromDb(id));
  if (!existing) throw ApiError.notFound(`Mahsulot topilmadi (id: ${id})`);

  assertCanModify(existing, actor);

  // Buyurtmalarda ishlatilganmi?
  const usedInOrders = cache.orderItems.getAll((i) => i.productId === id).length > 0;

  if (usedInOrders) {
    // Soft delete
    const snapshot = { ...existing };
    const updated = { ...existing, isActive: false, updatedAt: new Date() };
    cache.products.set(id, updated);

    syncQueue.enqueue({
      name: 'product.softDelete',
      meta: { entity: 'Product', entityId: id, userId: actor.id },
      run: () => prisma.product.update({ where: { id }, data: { isActive: false, updatedAt: updated.updatedAt } }),
      onFailure: () => cache.products.set(id, snapshot),
    });

    logAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.DELETE,
      entity: 'Product',
      entityId: id,
      meta: { softDelete: true, reason: 'buyurtmalarda ishlatilgan', ...meta },
    });

    return {
      deleted: false,
      deactivated: true,
      id,
      message:
        "Mahsulot buyurtmalarda ishlatilgani uchun to'liq o'chirilmadi, faqat nofaol (isActive=false) qilindi",
    };
  }

  // To'liq o'chirish
  cache.products.delete(id);

  syncQueue.enqueue({
    name: 'product.delete',
    meta: { entity: 'Product', entityId: id, userId: actor.id },
    run: () => prisma.product.delete({ where: { id } }),
    onFailure: () => cache.products.set(id, existing),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.DELETE,
    entity: 'Product',
    entityId: id,
    meta: { title: existing.title, ...meta },
  });

  return { deleted: true, id };
}

/* -------------------------------------------------------------
 * Ichki yordamchilar
 * ----------------------------------------------------------- */

async function loadFromDb(id) {
  const row = await prisma.product.findUnique({ where: { id } });
  if (!row) return null;
  const product = { ...row, price: toNumber(row.price) };
  cache.products.set(product.id, product);
  return product;
}

/**
 * Foydalanuvchi shu mahsulotni o'zgartira oladimi?
 * ADMIN — hammasini, SELLER — faqat o'zinikini.
 */
function assertCanModify(product, actor) {
  if (actor.role === 'ADMIN') return;
  if (product.sellerId !== actor.id) {
    throw ApiError.forbidden(
      "Bu mahsulot sizga tegishli emas. Sotuvchi faqat o'z mahsulotlarini tahrirlashi/o'chirishi mumkin"
    );
  }
}

/**
 * Ombor qoldig'ini o'zgartirish (buyurtma yaratilganda ishlatiladi).
 * @param {string} productId
 * @param {number} delta manfiy (kamaytirish) yoki musbat (qaytarish)
 */
function adjustStock(productId, delta) {
  const product = cache.products.get(productId);
  if (!product) return null;

  const newStock = Math.max(0, (product.stock ?? 0) + delta);
  const updated = { ...product, stock: newStock, updatedAt: new Date() };
  cache.products.set(productId, updated);

  syncQueue.enqueue({
    name: 'product.adjustStock',
    meta: { entity: 'Product', entityId: productId },
    // `increment` ishlatamiz — bir vaqtda bir necha buyurtma
    // kelsa ham qoldiq to'g'ri hisoblanadi (atomik amal)
    run: () => prisma.product.update({ where: { id: productId }, data: { stock: { increment: delta } } }),
    onSuccess: (saved) => cache.products.set(saved.id, { ...saved, price: toNumber(saved.price) }),
    onFailure: () => cache.products.set(productId, product),
  });

  return updated;
}

module.exports = { list, getById, create, update, remove, adjustStock, enrich, assertCanModify };
