/**
 * =============================================================
 * src/cache/cacheManager.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Serverning RAM'idagi (in-memory) ma'lumot ombori.
 * Bu loyihada Redis O'RNIGA ishlatiladi.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ NEGA REDIS EMAS?                                         │
 * │ Bu o'quv/demo loyiha. Redis o'rnatish, sozlash va uni    │
 * │ ishga tushirish junior dasturchi uchun qo'shimcha to'siq. │
 * │ Shuning uchun cache'ni oddiy JS `Map` orqali yasadik —   │
 * │ mantiq bir xil, lekin hech qanday qo'shimcha xizmat      │
 * │ kerak emas.                                              │
 * │                                                          │
 * │ KAMCHILIGI (buni bilish MUHIM):                          │
 * │  1. Cache faqat SHU process ichida yashaydi. Agar 3 ta   │
 * │     server nusxasi (instance) ishlasa — har birida       │
 * │     o'zining cache'i bo'ladi va ular bir-biridan xabarsiz│
 * │     qoladi.                                              │
 * │  2. Server o'chsa — RAM tozalanadi. Bizda bu muammo emas,│
 * │     chunki ma'lumot baribir DB'ga yoziladi va server     │
 * │     qayta ishga tushganda cache DB'dan to'ldiriladi.     │
 * │  3. Ma'lumot ko'payib ketsa RAM yetmay qolishi mumkin.   │
 * │                                                          │
 * │ PRODUCTIONDA QANDAY BO'LARDI?                            │
 * │  - Redis (yoki Memcached) ishlatiladi: cache barcha      │
 * │    server nusxalari uchun UMUMIY bo'ladi.                │
 * │  - Yozish odatda avval DB'ga (write-through) yoki        │
 * │    ishonchli navbat (BullMQ/Kafka) orqali qilinadi.      │
 * │  - Bizdagi "avval cache, keyin DB" usuli (write-behind)  │
 * │    juda tez, lekin server to'satdan o'chsa navbatdagi    │
 * │    yozuvlar yo'qolishi mumkin. Shuning uchun pul/to'lov  │
 * │    kabi kritik ma'lumotlarda BUNDAY QILINMAYDI.          │
 * └──────────────────────────────────────────────────────────┘
 *
 * ICHKI TUZILISHI:
 *   Har bir resurs uchun bitta `CacheStore` — ichida `Map`
 *   (kalit = id, qiymat = obyekt). Map tanladik chunki:
 *     - id bo'yicha topish O(1)
 *     - kiritish tartibi saqlanadi
 *     - o'chirish oson
 * =============================================================
 */

'use strict';

const logger = require('../utils/logger');
const { deepClone } = require('../utils/helpers');

/**
 * Bitta resurs uchun cache ombori (masalan barcha mahsulotlar).
 */
class CacheStore {
  /**
   * @param {string} name resurs nomi (log uchun): 'products', 'orders' ...
   */
  constructor(name) {
    this.name = name;
    /** @type {Map<string, object>} id -> obyekt */
    this.items = new Map();
    this.isWarmedUp = false;   // DB'dan yuklab bo'lindimi?
    this.stats = { hits: 0, misses: 0, writes: 0, deletes: 0 };
  }

  /* --------------------- O'QISH --------------------- */

  /**
   * id bo'yicha bitta yozuvni oladi.
   * @param {string} id
   * @returns {object|null} nusxa (clone) yoki null
   */
  get(id) {
    const item = this.items.get(id);
    if (item) {
      this.stats.hits++;
      // Nusxa qaytaramiz: tashqarida kimdir obyektni o'zgartirsa
      // cache'dagi asl nusxa buzilmasin.
      return deepClone(item);
    }
    this.stats.misses++;
    return null;
  }

  /** id bo'yicha yozuv bor-yo'qligini tekshiradi */
  has(id) {
    return this.items.has(id);
  }

  /**
   * Barcha yozuvlarni massiv ko'rinishida qaytaradi.
   * @param {(item:object)=>boolean} [filterFn] ixtiyoriy filtr
   */
  getAll(filterFn) {
    const all = [];
    for (const item of this.items.values()) {
      if (!filterFn || filterFn(item)) all.push(deepClone(item));
    }
    this.stats.hits++;
    return all;
  }

  /** Berilgan shartga mos BIRINCHI yozuvni topadi */
  find(predicate) {
    for (const item of this.items.values()) {
      if (predicate(item)) return deepClone(item);
    }
    return null;
  }

  /** Yozuvlar soni */
  size() {
    return this.items.size;
  }

  /* --------------------- YOZISH --------------------- */

  /**
   * Yozuvni qo'shadi yoki to'liq almashtiradi.
   * @param {string} id
   * @param {object} value
   */
  set(id, value) {
    this.items.set(id, deepClone(value));
    this.stats.writes++;
    return value;
  }

  /**
   * Mavjud yozuvni QISMAN yangilaydi (faqat berilgan maydonlarni).
   * @returns {object|null} yangilangan obyekt yoki null (topilmasa)
   */
  update(id, patch) {
    const current = this.items.get(id);
    if (!current) return null;
    const updated = { ...current, ...deepClone(patch), updatedAt: patch.updatedAt || new Date() };
    this.items.set(id, updated);
    this.stats.writes++;
    return deepClone(updated);
  }

  /** Yozuvni o'chiradi */
  delete(id) {
    const existed = this.items.delete(id);
    if (existed) this.stats.deletes++;
    return existed;
  }

  /**
   * Vaqtinchalik (optimistik) id'ni DB'dan qaytgan haqiqiy id bilan almashtiradi.
   * Bizda UUID'ni server o'zi generatsiya qilgani uchun odatda kerak emas,
   * lekin auto-increment id ishlatilsa shu metod kerak bo'ladi.
   */
  replaceId(tempId, realItem) {
    if (this.items.has(tempId) && tempId !== realItem.id) {
      this.items.delete(tempId);
    }
    this.items.set(realItem.id, deepClone(realItem));
    return realItem;
  }

  /* --------------------- BOSHQARUV --------------------- */

  /**
   * Cache'ni DB'dan kelgan massiv bilan to'ldiradi (warm-up).
   * @param {object[]} rows
   */
  warmUp(rows = []) {
    this.items.clear();
    for (const row of rows) this.items.set(row.id, deepClone(row));
    this.isWarmedUp = true;
    logger.cache(`"${this.name}" cache to'ldirildi: ${rows.length} ta yozuv`);
  }

  /** Cache'ni tozalaydi */
  clear() {
    this.items.clear();
    this.isWarmedUp = false;
  }

  /** Monitoring uchun statistika */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      name: this.name,
      size: this.items.size,
      isWarmedUp: this.isWarmedUp,
      ...this.stats,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }
}

/* =============================================================
 * CACHE'LAR RO'YXATI
 * Loyihadagi har bir asosiy resurs uchun bittadan ombor.
 * ============================================================= */
const cache = {
  users: new CacheStore('users'),
  categories: new CacheStore('categories'),
  products: new CacheStore('products'),
  orders: new CacheStore('orders'),
  orderItems: new CacheStore('orderItems'),

  /** Barcha omborlar statistikasi (GET /api/v1/system/cache-stats uchun) */
  getAllStats() {
    return {
      users: this.users.getStats(),
      categories: this.categories.getStats(),
      products: this.products.getStats(),
      orders: this.orders.getStats(),
      orderItems: this.orderItems.getStats(),
    };
  },

  /** Hammasini tozalash (test uchun) */
  clearAll() {
    this.users.clear();
    this.categories.clear();
    this.products.clear();
    this.orders.clear();
    this.orderItems.clear();
  },

  /** Barcha omborlar to'lganmi? */
  isReady() {
    return this.users.isWarmedUp && this.categories.isWarmedUp && this.products.isWarmedUp && this.orders.isWarmedUp;
  },
};

module.exports = cache;
module.exports.CacheStore = CacheStore;
