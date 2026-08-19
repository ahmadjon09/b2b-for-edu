/**
 * =============================================================
 * src/modules/orders/orders.service.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Buyurtmalar biznes-mantiqi. Bu loyihadagi eng
 * "boy" modul — bu yerda:
 *   1) Bir nechta mahsulotdan iborat buyurtma yaratish
 *   2) Ombor qoldig'ini (stock) tekshirish va kamaytirish
 *   3) Umumiy summani hisoblash
 *   4) Status mashinasi (qaysi holatdan qaysi holatga o'tish mumkin)
 *   5) Rol asosida ko'rish huquqi:
 *        USER   -> faqat o'z buyurtmalari
 *        SELLER -> tarkibida o'z mahsuloti bor buyurtmalar
 *        ADMIN  -> hammasi
 *
 * DIQQAT (muhim o'quv nuqtasi): buyurtma cache'ga darhol
 * yoziladi va DB'ga fonda ketadi. Lekin ombor qoldig'i (stock)
 * ham cache'da darhol kamayadi — shuning uchun ikkita mijoz
 * bir vaqtda oxirgi mahsulotni sotib ololmaydi.
 * =============================================================
 */

'use strict';

const { prisma } = require('../../config/db');
const cache = require('../../cache/cacheManager');
const syncQueue = require('../../cache/syncQueue');
const { ApiError } = require('../../utils/ApiError');
const { uuid, toNumber, round2, normalize } = require('../../utils/helpers');
const { getPaginationParams, paginateArray, sortArray } = require('../../utils/pagination');
const { logAudit, AUDIT_ACTIONS } = require('../../audit/audit.service');
const productsService = require('../products/products.service');

const SORTABLE = ['createdAt', 'updatedAt', 'totalPrice', 'status'];

/**
 * STATUS MASHINASI — qaysi holatdan qaysi holatga o'tish mumkin.
 * Masalan: DELIVERED bo'lgan buyurtmani bekor qilib bo'lmaydi.
 */
const STATUS_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],   // yakuniy holat
  CANCELLED: [],   // yakuniy holat
};

/* -------------------------------------------------------------
 * Yordamchi: buyurtmaga xaridor va mahsulot ma'lumotlarini qo'shadi
 * ----------------------------------------------------------- */
function enrich(order) {
  if (!order) return order;

  const buyer = cache.users.get(order.buyerId);
  const items = (order.items || []).map((item) => {
    const product = cache.products.get(item.productId);
    return {
      ...item,
      priceAtOrder: toNumber(item.priceAtOrder),
      subtotal: round2(toNumber(item.priceAtOrder) * item.quantity),
      product: product
        ? { id: product.id, title: product.title, imageUrl: product.imageUrl, currentPrice: toNumber(product.price) }
        : { id: item.productId, title: "(mahsulot o'chirilgan)", imageUrl: null, currentPrice: null },
    };
  });

  return {
    ...order,
    totalPrice: toNumber(order.totalPrice),
    itemCount: items.length,
    totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
    buyer: buyer ? { id: buyer.id, name: buyer.name, email: buyer.email } : null,
    items,
  };
}

/**
 * Buyurtmalar ro'yxati — ROL asosida filtrlanadi.
 *
 * @param {object} query
 * @param {object} actor req.user — MAJBURIY (buyurtmalar ochiq emas)
 */
async function list(query = {}, actor) {
  const { page, limit } = getPaginationParams(query);

  if (!cache.orders.isWarmedUp) {
    const rows = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, include: { items: true } });
    cache.orders.warmUp(
      rows.map((o) => ({
        ...o,
        totalPrice: toNumber(o.totalPrice),
        items: o.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })),
      }))
    );
  }

  let items = cache.orders.getAll();

  // --- 1) ROL BO'YICHA CHEKLOV (eng muhim qism) ---
  if (actor.role === 'USER') {
    // Xaridor faqat o'z buyurtmalarini ko'radi
    items = items.filter((o) => o.buyerId === actor.id);
  } else if (actor.role === 'SELLER') {
    // Sotuvchi tarkibida o'z mahsuloti bor buyurtmalarni ko'radi
    items = items.filter((o) => (o.items || []).some((i) => i.sellerId === actor.id));
    // Sotuvchiga faqat O'ZIGA tegishli qatorlarni ko'rsatamiz
    items = items.map((o) => ({ ...o, items: o.items.filter((i) => i.sellerId === actor.id) }));
  }
  // ADMIN — hech qanday cheklovsiz

  // --- 2) Qo'shimcha filtrlar ---
  if (query.status) items = items.filter((o) => o.status === query.status);

  if (query.buyerId) {
    if (actor.role === 'USER' && query.buyerId !== actor.id) {
      throw ApiError.forbidden("Boshqa foydalanuvchining buyurtmalarini ko'ra olmaysiz");
    }
    items = items.filter((o) => o.buyerId === query.buyerId);
  }

  if (query.sellerId) {
    if (actor.role === 'SELLER' && query.sellerId !== actor.id) {
      throw ApiError.forbidden("Boshqa sotuvchining buyurtmalarini ko'ra olmaysiz");
    }
    items = items.filter((o) => (o.items || []).some((i) => i.sellerId === query.sellerId));
  }

  if (query.minPrice !== undefined && query.minPrice !== '') {
    items = items.filter((o) => toNumber(o.totalPrice) >= Number(query.minPrice));
  }
  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    items = items.filter((o) => toNumber(o.totalPrice) <= Number(query.maxPrice));
  }

  if (query.dateFrom) {
    const from = new Date(query.dateFrom);
    items = items.filter((o) => new Date(o.createdAt) >= from);
  }
  if (query.dateTo) {
    const to = new Date(query.dateTo);
    items = items.filter((o) => new Date(o.createdAt) <= to);
  }

  // Qidiruv: buyurtma id yoki izoh bo'yicha
  if (query.search) {
    const q = normalize(query.search);
    items = items.filter((o) => normalize(o.id).includes(q) || normalize(o.note).includes(q));
  }

  // --- 3) Saralash va sahifalash ---
  items = sortArray(items, query.sortBy, query.order, SORTABLE, 'createdAt');
  const result = paginateArray(items, page, limit);
  result.data = result.data.map(enrich);
  return result;
}

/**
 * Bitta buyurtma — ko'rish huquqi tekshiriladi.
 */
async function getById(id, actor) {
  let order = cache.orders.get(id);

  if (!order) {
    const row = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (row) {
      order = {
        ...row,
        totalPrice: toNumber(row.totalPrice),
        items: row.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })),
      };
      cache.orders.set(order.id, order);
    }
  }

  if (!order) throw ApiError.notFound(`Buyurtma topilmadi (id: ${id})`);

  assertCanView(order, actor);
  return enrich(order);
}

/**
 * YANGI BUYURTMA — eng muhim funksiya.
 *
 * Bosqichlar:
 *   1) Har bir mahsulotni tekshirish (mavjudmi, faolmi, omborda bormi)
 *   2) Umumiy summani hisoblash
 *   3) Cache'ga buyurtmani yozish + stockni kamaytirish
 *   4) Clientga darhol javob
 *   5) Fonda DB'ga tranzaksiya bilan yozish
 */
async function create(payload, actor, meta = {}) {
  const { items: requestedItems, note = null } = payload;

  // --- 1) Bir xil mahsulot bir necha marta yuborilgan bo'lsa birlashtiramiz ---
  const merged = new Map();
  for (const item of requestedItems) {
    const current = merged.get(item.productId) || 0;
    merged.set(item.productId, current + item.quantity);
  }

  // --- 2) Har bir mahsulotni tekshiramiz ---
  const orderItems = [];
  const stockChanges = [];
  let totalPrice = 0;

  for (const [productId, quantity] of merged.entries()) {
    let product = cache.products.get(productId);
    if (!product) {
      const row = await prisma.product.findUnique({ where: { id: productId } });
      if (row) {
        product = { ...row, price: toNumber(row.price) };
        cache.products.set(product.id, product);
      }
    }

    if (!product) {
      throw ApiError.badRequest(`Mahsulot topilmadi (productId: ${productId})`, { productId });
    }
    if (product.isActive === false) {
      throw ApiError.unprocessable(`"${product.title}" mahsuloti hozir sotuvda emas`, { productId });
    }
    if ((product.stock ?? 0) < quantity) {
      throw ApiError.unprocessable(
        `"${product.title}" mahsulotidan omborda faqat ${product.stock ?? 0} dona qolgan, ` +
          `siz ${quantity} dona so'radingiz`,
        { productId, requested: quantity, available: product.stock ?? 0 }
      );
    }
    if (product.sellerId === actor.id) {
      throw ApiError.unprocessable(`O'zingizning "${product.title}" mahsulotingizni sotib ololmaysiz`, { productId });
    }

    const price = toNumber(product.price);
    totalPrice += price * quantity;

    orderItems.push({
      id: uuid(),
      productId,
      sellerId: product.sellerId,
      quantity,
      priceAtOrder: price, // narxni "muzlatib" qo'yamiz
    });
    stockChanges.push({ productId, delta: -quantity });
  }

  totalPrice = round2(totalPrice);

  // --- 3) Buyurtma obyekti ---
  const now = new Date();
  const orderId = uuid();
  const order = {
    id: orderId,
    buyerId: actor.id,
    status: 'PENDING',
    totalPrice,
    note,
    createdAt: now,
    updatedAt: now,
    items: orderItems.map((i) => ({ ...i, orderId })),
  };

  // --- 4) CACHE'GA DARHOL ---
  cache.orders.set(order.id, order);
  order.items.forEach((i) => cache.orderItems.set(i.id, i));
  // Ombor qoldig'ini kamaytiramiz (cache'da darhol, DB'ga fonda)
  stockChanges.forEach(({ productId, delta }) => productsService.adjustStock(productId, delta));

  // --- 5) DB'ga fonda, TRANZAKSIYA bilan ---
  // Tranzaksiya: order va uning items'lari birga yoziladi.
  // Biri xato bo'lsa — ikkalasi ham yozilmaydi (atomiklik).
  syncQueue.enqueue({
    name: 'order.create',
    meta: { entity: 'Order', entityId: order.id, userId: actor.id },
    run: () =>
      prisma.order.create({
        data: {
          id: order.id,
          buyerId: order.buyerId,
          status: order.status,
          totalPrice: order.totalPrice,
          note: order.note,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          items: {
            create: order.items.map((i) => ({
              id: i.id,
              productId: i.productId,
              sellerId: i.sellerId,
              quantity: i.quantity,
              priceAtOrder: i.priceAtOrder,
            })),
          },
        },
        include: { items: true },
      }),
    onSuccess: (saved) => {
      cache.orders.set(saved.id, {
        ...saved,
        totalPrice: toNumber(saved.totalPrice),
        items: saved.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })),
      });
    },
    onFailure: () => {
      // Rollback: buyurtmani cache'dan olib tashlaymiz va
      // ombor qoldiqlarini qaytaramiz
      cache.orders.delete(order.id);
      order.items.forEach((i) => cache.orderItems.delete(i.id));
      stockChanges.forEach(({ productId, delta }) => productsService.adjustStock(productId, -delta));
    },
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.CREATE,
    entity: 'Order',
    entityId: order.id,
    meta: { totalPrice, itemCount: order.items.length, ...meta },
  });

  return enrich(order);
}

/**
 * Buyurtma holatini o'zgartirish.
 *
 * KIM O'ZGARTIRA OLADI?
 *   ADMIN  — istalgan holatga (ruxsat etilgan o'tishlar doirasida)
 *   SELLER — o'z mahsuloti bor buyurtmani: CONFIRMED, SHIPPED, DELIVERED
 *   USER   — faqat o'z buyurtmasini BEKOR qilishi mumkin (CANCELLED)
 */
async function updateStatus(id, { status: newStatus, note }, actor, meta = {}) {
  const order = cache.orders.get(id) || (await loadOrderFromDb(id));
  if (!order) throw ApiError.notFound(`Buyurtma topilmadi (id: ${id})`);

  assertCanView(order, actor);

  const currentStatus = order.status;

  // 1) Bir xil holat
  if (currentStatus === newStatus) {
    throw ApiError.badRequest(`Buyurtma allaqachon "${newStatus}" holatida`);
  }

  // 2) Status mashinasi tekshiruvi
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw ApiError.unprocessable(
      `"${currentStatus}" holatidan "${newStatus}" holatiga o'tib bo'lmaydi. ` +
        (allowed.length
          ? `Ruxsat etilgan holatlar: ${allowed.join(', ')}`
          : `"${currentStatus}" — yakuniy holat, uni o'zgartirib bo'lmaydi`),
      { currentStatus, requestedStatus: newStatus, allowedTransitions: allowed }
    );
  }

  // 3) Rol tekshiruvi
  if (actor.role === 'USER') {
    if (newStatus !== 'CANCELLED') {
      throw ApiError.forbidden(
        "Xaridor faqat buyurtmani bekor qilishi (CANCELLED) mumkin. Boshqa holatlarni sotuvchi yoki admin belgilaydi"
      );
    }
    if (order.buyerId !== actor.id) {
      throw ApiError.forbidden("Bu buyurtma sizniki emas");
    }
  } else if (actor.role === 'SELLER') {
    const isMine = (order.items || []).some((i) => i.sellerId === actor.id);
    if (!isMine) throw ApiError.forbidden("Bu buyurtmada sizning mahsulotingiz yo'q");
  }

  const snapshot = { ...order };
  const updated = { ...order, status: newStatus, note: note ?? order.note, updatedAt: new Date() };

  cache.orders.set(id, updated);

  // 4) Bekor qilingan bo'lsa — ombor qoldig'ini qaytaramiz
  if (newStatus === 'CANCELLED') {
    (order.items || []).forEach((i) => productsService.adjustStock(i.productId, i.quantity));
  }

  syncQueue.enqueue({
    name: 'order.updateStatus',
    meta: { entity: 'Order', entityId: id, userId: actor.id },
    run: () =>
      prisma.order.update({
        where: { id },
        data: { status: newStatus, note: updated.note, updatedAt: updated.updatedAt },
      }),
    onFailure: () => {
      cache.orders.set(id, snapshot);
      if (newStatus === 'CANCELLED') {
        (order.items || []).forEach((i) => productsService.adjustStock(i.productId, -i.quantity));
      }
    },
  });

  logAudit({
    userId: actor.id,
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    entity: 'Order',
    entityId: id,
    meta: { from: currentStatus, to: newStatus, ...meta },
  });

  return enrich(updated);
}

/**
 * Buyurtmani o'chirish — faqat ADMIN va faqat CANCELLED holatda.
 */
async function remove(id, actor, meta = {}) {
  const order = cache.orders.get(id) || (await loadOrderFromDb(id));
  if (!order) throw ApiError.notFound(`Buyurtma topilmadi (id: ${id})`);

  if (actor.role !== 'ADMIN') {
    throw ApiError.forbidden("Buyurtmani faqat ADMIN o'chira oladi. Xaridor uni bekor qilishi (CANCELLED) mumkin");
  }
  if (order.status !== 'CANCELLED') {
    throw ApiError.unprocessable(
      `Faqat bekor qilingan (CANCELLED) buyurtmani o'chirish mumkin. Joriy holat: ${order.status}`
    );
  }

  cache.orders.delete(id);
  (order.items || []).forEach((i) => cache.orderItems.delete(i.id));

  syncQueue.enqueue({
    name: 'order.delete',
    meta: { entity: 'Order', entityId: id, userId: actor.id },
    run: () => prisma.order.delete({ where: { id } }),
    onFailure: () => {
      cache.orders.set(id, order);
      (order.items || []).forEach((i) => cache.orderItems.set(i.id, i));
    },
  });

  logAudit({ userId: actor.id, action: AUDIT_ACTIONS.DELETE, entity: 'Order', entityId: id, meta });

  return { deleted: true, id };
}

/**
 * Buyurtmalar statistikasi (ADMIN va SELLER uchun).
 */
async function getStats(actor) {
  let orders = cache.orders.getAll();

  if (actor.role === 'SELLER') {
    orders = orders.filter((o) => (o.items || []).some((i) => i.sellerId === actor.id));
  } else if (actor.role === 'USER') {
    orders = orders.filter((o) => o.buyerId === actor.id);
  }

  const byStatus = {};
  let revenue = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(o.status)) {
      revenue += toNumber(o.totalPrice);
    }
  }

  return {
    totalOrders: orders.length,
    byStatus,
    revenue: round2(revenue),
    averageOrderValue: orders.length ? round2(revenue / orders.length) : 0,
  };
}

/* -------------------------------------------------------------
 * Ichki yordamchilar
 * ----------------------------------------------------------- */

async function loadOrderFromDb(id) {
  const row = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!row) return null;
  const order = {
    ...row,
    totalPrice: toNumber(row.totalPrice),
    items: row.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })),
  };
  cache.orders.set(order.id, order);
  return order;
}

/**
 * Foydalanuvchi shu buyurtmani ko'ra oladimi?
 */
function assertCanView(order, actor) {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'USER' && order.buyerId === actor.id) return;
  if (actor.role === 'SELLER' && (order.items || []).some((i) => i.sellerId === actor.id)) return;

  throw ApiError.forbidden(
    "Bu buyurtmani ko'rishga ruxsatingiz yo'q. Xaridor faqat o'z buyurtmalarini, " +
      "sotuvchi esa o'z mahsuloti bor buyurtmalarni ko'ra oladi"
  );
}

module.exports = { list, getById, create, updateStatus, remove, getStats, STATUS_TRANSITIONS };
