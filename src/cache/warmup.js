/**
 * =============================================================
 * src/cache/warmup.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Server ishga tushganda DB'dagi mavjud ma'lumotlarni
 * bir marta o'qib, in-memory cache'ga yuklash ("isitish" — warm-up).
 *
 * NEGA KERAK? Cache RAM'da yashaydi. Server qayta ishga tushsa
 * RAM tozalanadi va cache bo'sh qoladi. Agar warm-up qilmasak,
 * birinchi GET so'rov bo'sh ro'yxat qaytaradi — go'yo ma'lumot
 * yo'qolgandek. Warm-up esa DB'ni "haqiqat manbai" (source of
 * truth) sifatida ishlatib, cache'ni to'ldiradi.
 *
 * MUHIM: CACHE_WARMUP_LIMIT orqali yuklanadigan yozuvlar soni
 * cheklanadi — millionlab yozuvni RAM'ga yuklab, serverni
 * o'ldirib qo'ymaslik uchun.
 * =============================================================
 */

'use strict';

const { prisma } = require('../config/db');
const env = require('../config/env');
const logger = require('../utils/logger');
const cache = require('./cacheManager');
const { toNumber } = require('../utils/helpers');

/**
 * Prisma'dan kelgan Product yozuvini cache uchun "normallashtiradi":
 * Decimal -> number (JSON'da chiroyli chiqishi uchun).
 */
function normalizeProduct(p) {
  return { ...p, price: toNumber(p.price) };
}

function normalizeOrder(o) {
  return {
    ...o,
    totalPrice: toNumber(o.totalPrice),
    items: (o.items || []).map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })),
  };
}

/**
 * Barcha cache omborlarini DB'dan to'ldiradi.
 * @returns {Promise<{ok:boolean, counts?:object, error?:string}>}
 */
async function warmUpCache() {
  const startedAt = Date.now();
  logger.cache('Cache DB\'dan to\'ldirilmoqda (warm-up)...');

  try {
    const take = env.CACHE_WARMUP_LIMIT;

    // Hammasini parallel o'qiymiz — tezroq bo'ladi
    const [users, categories, products, orders] = await Promise.all([
      prisma.user.findMany({ take, orderBy: { createdAt: 'desc' } }),
      prisma.category.findMany({ take, orderBy: { createdAt: 'desc' } }),
      prisma.product.findMany({ take, orderBy: { createdAt: 'desc' } }),
      prisma.order.findMany({ take, orderBy: { createdAt: 'desc' }, include: { items: true } }),
    ]);

    cache.users.warmUp(users);
    cache.categories.warmUp(categories);
    cache.products.warmUp(products.map(normalizeProduct));
    cache.orders.warmUp(orders.map(normalizeOrder));

    // OrderItem'larni ham alohida omborga solamiz (tez qidirish uchun)
    const allItems = orders.flatMap((o) => o.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) })));
    cache.orderItems.warmUp(allItems);

    const counts = {
      users: users.length,
      categories: categories.length,
      products: products.length,
      orders: orders.length,
      orderItems: allItems.length,
    };

    logger.success(
      `Cache tayyor (${Date.now() - startedAt}ms): ` +
        Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')
    );

    return { ok: true, counts };
  } catch (error) {
    logger.error("Cache warm-up amalga oshmadi — API DB'dan o'qishga o'tadi", error);
    return { ok: false, error: error.message };
  }
}

/**
 * Bitta omborni qayta yuklash (masalan admin "cache'ni yangila"
 * tugmasini bosganda).
 * @param {'users'|'categories'|'products'|'orders'} resource
 */
async function reloadResource(resource) {
  const take = env.CACHE_WARMUP_LIMIT;

  switch (resource) {
    case 'users': {
      const rows = await prisma.user.findMany({ take, orderBy: { createdAt: 'desc' } });
      cache.users.warmUp(rows);
      return rows.length;
    }
    case 'categories': {
      const rows = await prisma.category.findMany({ take, orderBy: { createdAt: 'desc' } });
      cache.categories.warmUp(rows);
      return rows.length;
    }
    case 'products': {
      const rows = await prisma.product.findMany({ take, orderBy: { createdAt: 'desc' } });
      cache.products.warmUp(rows.map(normalizeProduct));
      return rows.length;
    }
    case 'orders': {
      const rows = await prisma.order.findMany({ take, orderBy: { createdAt: 'desc' }, include: { items: true } });
      cache.orders.warmUp(rows.map(normalizeOrder));
      cache.orderItems.warmUp(rows.flatMap((o) => o.items.map((i) => ({ ...i, priceAtOrder: toNumber(i.priceAtOrder) }))));
      return rows.length;
    }
    default:
      throw new Error(`Noma'lum resurs: ${resource}`);
  }
}

module.exports = { warmUpCache, reloadResource, normalizeProduct, normalizeOrder };
