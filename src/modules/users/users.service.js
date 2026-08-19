/**
 * =============================================================
 * src/modules/users/users.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Foydalanuvchilarni boshqarish.
 *
 * RUXSATLAR:
 *   ADMIN  — barcha foydalanuvchilarni ko'radi, rol o'zgartiradi,
 *            bloklaydi, o'chiradi
 *   SELLER — faqat o'z profilini ko'radi/yangilaydi
 *   USER   — faqat o'z profilini ko'radi/yangilaydi
 *
 * DIQQAT: bu yerda ham cache-first naqsh ishlatiladi, lekin
 * parol (passwordHash) HECH QACHON javobga chiqmaydi —
 * `sanitizeUser()` orqali olib tashlanadi.
 * =============================================================
 */

'use strict';

const { prisma } = require('../../config/db');
const cache = require('../../cache/cacheManager');
const syncQueue = require('../../cache/syncQueue');
const { ApiError } = require('../../utils/ApiError');
const { sanitizeUser, normalize, toNumber, round2 } = require('../../utils/helpers');
const { getPaginationParams, paginateArray, sortArray } = require('../../utils/pagination');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');

const SORTABLE = ['name', 'email', 'role', 'createdAt', 'updatedAt'];

/**
 * Foydalanuvchiga qo'shimcha statistika qo'shadi (cache'dan hisoblanadi).
 */
function enrich(user) {
  if (!user) return null;
  const safe = sanitizeUser(user);

  const products = cache.products.getAll((p) => p.sellerId === user.id);
  const orders = cache.orders.getAll((o) => o.buyerId === user.id);
  const soldItems = cache.orderItems.getAll((i) => i.sellerId === user.id);

  return {
    ...safe,
    stats: {
      productCount: products.length,
      orderCount: orders.length,
      totalSpent: round2(orders.reduce((s, o) => s + toNumber(o.totalPrice), 0)),
      soldItemCount: soldItems.reduce((s, i) => s + (i.quantity || 0), 0),
    },
  };
}

/**
 * Foydalanuvchilar ro'yxati — FAQAT ADMIN uchun.
 */
async function list(query = {}) {
  const { page, limit } = getPaginationParams(query);

  if (!cache.users.isWarmedUp) {
    const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    cache.users.warmUp(rows);
  }

  let items = cache.users.getAll();

  if (query.role) items = items.filter((u) => u.role === query.role);

  if (query.isActive !== undefined && query.isActive !== '') {
    const wanted = query.isActive === 'true' || query.isActive === true;
    items = items.filter((u) => (u.isActive !== false) === wanted);
  }

  if (query.search) {
    const q = normalize(query.search);
    items = items.filter(
      (u) => normalize(u.name).includes(q) || normalize(u.email).includes(q) || normalize(u.phone).includes(q)
    );
  }

  items = sortArray(items, query.sortBy, query.order, SORTABLE, 'createdAt');

  const result = paginateArray(items, page, limit);
  result.data = result.data.map(enrich);
  return result;
}

/**
 * Bitta foydalanuvchi. `actor` — so'rov yuborgan odam.
 * Admin bo'lmasa, faqat o'zini ko'ra oladi.
 */
async function getById(id, actor) {
  if (actor.role !== 'ADMIN' && actor.id !== id) {
    throw ApiError.forbidden("Faqat o'z profilingizni ko'ra olasiz");
  }

  const user = await findUser(id);
  if (!user) throw ApiError.notFound(`Foydalanuvchi topilmadi (id: ${id})`);

  return enrich(user);
}

/**
 * Profilni yangilash (o'zi yoki admin).
 */
async function update(id, payload, actor, meta = {}) {
  if (actor.role !== 'ADMIN' && actor.id !== id) {
    throw ApiError.forbidden("Faqat o'z profilingizni tahrirlay olasiz");
  }

  const existing = await findUser(id);
  if (!existing) throw ApiError.notFound(`Foydalanuvchi topilmadi (id: ${id})`);

  // Email o'zgarayotgan bo'lsa — band emasligini tekshiramiz
  if (payload.email && normalize(payload.email) !== normalize(existing.email)) {
    const taken =
      cache.users.find((u) => u.id !== id && normalize(u.email) === normalize(payload.email)) ||
      (await prisma.user.findUnique({ where: { email: payload.email } }));
    if (taken) throw ApiError.conflict(`"${payload.email}" email allaqachon band`);
  }

  const snapshot = { ...existing };
  const updated = { ...existing, ...payload, updatedAt: new Date() };

  cache.users.set(id, updated);

  syncQueue.enqueue({
    name: 'user.update',
    meta: { entity: 'User', entityId: id, userId: actor.id },
    run: () =>
      prisma.user.update({
        where: { id },
        data: {
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          avatarUrl: updated.avatarUrl,
          updatedAt: updated.updatedAt,
        },
      }),
    onSuccess: (saved) => cache.users.set(saved.id, saved),
    onFailure: () => cache.users.set(id, snapshot),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.UPDATE,
    entity: 'User',
    entityId: id,
    meta: { changes: Object.keys(payload), ...meta },
  });

  return enrich(updated);
}

/**
 * Rolni o'zgartirish — FAQAT ADMIN.
 * Admin o'z rolini pasaytira olmaydi (o'zini "qulflab" qo'ymasligi uchun).
 */
async function updateRole(id, role, actor, meta = {}) {
  const existing = await findUser(id);
  if (!existing) throw ApiError.notFound(`Foydalanuvchi topilmadi (id: ${id})`);

  if (actor.id === id && role !== 'ADMIN') {
    throw ApiError.badRequest(
      "O'zingizning ADMIN rolingizni o'zgartira olmaysiz. Buni boshqa admin bajarishi kerak"
    );
  }

  if (existing.role === role) {
    throw ApiError.badRequest(`Foydalanuvchi allaqachon "${role}" rolida`);
  }

  // Oxirgi adminni "pasaytirib" yubormaslik
  if (existing.role === 'ADMIN' && role !== 'ADMIN') {
    const adminCount = cache.users.getAll((u) => u.role === 'ADMIN' && u.isActive !== false).length;
    if (adminCount <= 1) {
      throw ApiError.unprocessable("Tizimda kamida bitta faol ADMIN qolishi kerak");
    }
  }

  const snapshot = { ...existing };
  const updated = { ...existing, role, updatedAt: new Date() };
  cache.users.set(id, updated);

  syncQueue.enqueue({
    name: 'user.updateRole',
    meta: { entity: 'User', entityId: id, userId: actor.id },
    run: () => prisma.user.update({ where: { id }, data: { role, updatedAt: updated.updatedAt } }),
    onSuccess: (saved) => cache.users.set(saved.id, saved),
    onFailure: () => cache.users.set(id, snapshot),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.UPDATE,
    entity: 'User',
    entityId: id,
    meta: { field: 'role', from: existing.role, to: role, ...meta },
  });

  return enrich(updated);
}

/**
 * Bloklash / blokdan chiqarish — FAQAT ADMIN.
 * Bloklangan foydalanuvchi token bilan ham kira olmaydi
 * (`authenticate` middleware `isActive === false` bo'lsa 403 qaytaradi).
 */
async function updateStatus(id, { isActive, reason }, actor, meta = {}) {
  const existing = await findUser(id);
  if (!existing) throw ApiError.notFound(`Foydalanuvchi topilmadi (id: ${id})`);

  if (actor.id === id) {
    throw ApiError.badRequest("O'zingizni bloklay olmaysiz");
  }
  if (existing.isActive === isActive) {
    throw ApiError.badRequest(`Foydalanuvchi allaqachon ${isActive ? 'faol' : 'bloklangan'} holatda`);
  }
  if (existing.role === 'ADMIN' && isActive === false) {
    const adminCount = cache.users.getAll((u) => u.role === 'ADMIN' && u.isActive !== false).length;
    if (adminCount <= 1) throw ApiError.unprocessable("Tizimda kamida bitta faol ADMIN qolishi kerak");
  }

  const snapshot = { ...existing };
  const updated = { ...existing, isActive, updatedAt: new Date() };
  cache.users.set(id, updated);

  syncQueue.enqueue({
    name: 'user.updateStatus',
    meta: { entity: 'User', entityId: id, userId: actor.id },
    run: async () => {
      const saved = await prisma.user.update({
        where: { id },
        data: { isActive, updatedAt: updated.updatedAt },
      });
      // Bloklanganda barcha refresh tokenlarini bekor qilamiz
      if (isActive === false) {
        await prisma.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return saved;
    },
    onSuccess: (saved) => cache.users.set(saved.id, saved),
    onFailure: () => cache.users.set(id, snapshot),
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entity: 'User',
    entityId: id,
    meta: { isActive, reason: reason || null, ...meta },
  });

  return enrich(updated);
}

/**
 * Foydalanuvchini o'chirish — FAQAT ADMIN.
 * Agar foydalanuvchida mahsulot yoki buyurtma bo'lsa — o'chirmaymiz,
 * balki bloklaymiz (soft delete). Bu ma'lumot yaxlitligini saqlaydi.
 */
async function remove(id, actor, meta = {}) {
  const existing = await findUser(id);
  if (!existing) throw ApiError.notFound(`Foydalanuvchi topilmadi (id: ${id})`);

  if (actor.id === id) throw ApiError.badRequest("O'zingizni o'chira olmaysiz");

  if (existing.role === 'ADMIN') {
    const adminCount = cache.users.getAll((u) => u.role === 'ADMIN' && u.isActive !== false).length;
    if (adminCount <= 1) throw ApiError.unprocessable("Tizimda kamida bitta faol ADMIN qolishi kerak");
  }

  const hasProducts = cache.products.getAll((p) => p.sellerId === id).length > 0;
  const hasOrders = cache.orders.getAll((o) => o.buyerId === id).length > 0;

  if (hasProducts || hasOrders) {
    // SOFT DELETE — bog'liq ma'lumotlar yo'qolmasligi uchun
    const snapshot = { ...existing };
    const updated = { ...existing, isActive: false, updatedAt: new Date() };
    cache.users.set(id, updated);

    syncQueue.enqueue({
      name: 'user.softDelete',
      meta: { entity: 'User', entityId: id, userId: actor.id },
      run: () => prisma.user.update({ where: { id }, data: { isActive: false, updatedAt: updated.updatedAt } }),
      onSuccess: (saved) => cache.users.set(saved.id, saved),
      onFailure: () => cache.users.set(id, snapshot),
    });

    logAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.DELETE,
      entity: 'User',
      entityId: id,
      meta: { softDelete: true, hasProducts, hasOrders, ...meta },
    });

    return {
      deleted: false,
      deactivated: true,
      id,
      message:
        "Foydalanuvchida mahsulot yoki buyurtma bor, shuning uchun u o'chirilmadi — bloklandi (isActive: false)",
    };
  }

  cache.users.delete(id);

  syncQueue.enqueue({
    name: 'user.delete',
    meta: { entity: 'User', entityId: id, userId: actor.id },
    run: () => prisma.user.delete({ where: { id } }),
    onFailure: () => cache.users.set(id, existing),
  });

  logAudit({ userId: actor.id, action: AUDIT_ACTIONS.DELETE, entity: 'User', entityId: id, meta });

  return { deleted: true, id };
}

/* -------------------------------------------------------------
 * Ichki yordamchi
 * ----------------------------------------------------------- */
async function findUser(id) {
  let user = cache.users.get(id);
  if (!user) {
    user = await prisma.user.findUnique({ where: { id } });
    if (user) cache.users.set(user.id, user);
  }
  return user;
}

module.exports = { list, getById, update, updateRole, updateStatus, remove, enrich };
