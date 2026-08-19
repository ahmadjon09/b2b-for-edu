/**
 * =============================================================
 * src/utils/pagination.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Sahifalash (pagination), filtrlash va saralash
 * bilan bog'liq umumiy yordamchi funksiyalar.
 *
 * Loyihadagi HAMMA list endpoint (`GET /products`, `/orders` ...)
 * shu funksiyalardan foydalanadi — shuning uchun ular bir xil
 * ishlaydi va bir xil javob qaytaradi.
 * =============================================================
 */

'use strict';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * So'rovdagi `page` va `limit` ni xavfsiz songa aylantiradi.
 * Noto'g'ri qiymat kelsa — standart qiymat ishlatiladi.
 *
 * @param {object} query req.query
 * @returns {{page:number, limit:number, skip:number}}
 */
function getPaginationParams(query = {}) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isInteger(page) || page < 1) page = DEFAULT_PAGE;
  if (!Number.isInteger(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT; // himoya: 1 000 000 ta so'ralmasin

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Pagination blokini yasaydi (javobdagi "pagination" qismi).
 *
 * @param {number} totalItems umumiy yozuvlar soni
 * @param {number} page joriy sahifa
 * @param {number} limit sahifadagi elementlar soni
 */
function buildPagination(totalItems, page, limit) {
  const totalPages = limit > 0 ? Math.ceil(totalItems / limit) : 0;
  return {
    currentPage: page,
    totalPages,
    totalItems,
    limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1 && totalItems > 0,
  };
}

/**
 * Massivni (in-memory cache'dagi ro'yxatni) sahifalarga bo'ladi.
 * Cache'dan o'qiyotganda DB'ning LIMIT/OFFSET o'rniga shu ishlatiladi.
 *
 * @param {Array} items to'liq ro'yxat (allaqachon filtrlangan va saralangan)
 * @param {number} page
 * @param {number} limit
 */
function paginateArray(items, page, limit) {
  const totalItems = items.length;
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return { data, pagination: buildPagination(totalItems, page, limit) };
}

/**
 * Massivni berilgan maydon bo'yicha saralaydi.
 * `allowedFields` — ruxsat etilgan maydonlar ro'yxati (xavfsizlik uchun:
 * foydalanuvchi ixtiyoriy maydon nomini yubora olmasin).
 *
 * @param {Array} items
 * @param {string} sortBy maydon nomi
 * @param {'asc'|'desc'} order
 * @param {string[]} allowedFields
 * @param {string} defaultField
 */
function sortArray(items, sortBy, order = 'desc', allowedFields = [], defaultField = 'createdAt') {
  const field = allowedFields.includes(sortBy) ? sortBy : defaultField;
  const dir = String(order).toLowerCase() === 'asc' ? 1 : -1;

  return [...items].sort((a, b) => {
    const av = a?.[field];
    const bv = b?.[field];

    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;  // bo'shlar oxirida
    if (bv === null || bv === undefined) return -1;

    // Sana bo'lsa — vaqt bo'yicha
    if (av instanceof Date || bv instanceof Date) {
      return (new Date(av).getTime() - new Date(bv).getTime()) * dir;
    }
    // Son bo'lsa — sonli taqqoslash
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * dir;
    }
    // Qolgan hollarda — matnli taqqoslash
    return String(av).localeCompare(String(bv), 'uz') * dir;
  });
}

/**
 * Prisma uchun `orderBy` obyektini yasaydi (DB'dan o'qiyotgan holat uchun).
 */
function buildPrismaOrderBy(sortBy, order, allowedFields = [], defaultField = 'createdAt') {
  const field = allowedFields.includes(sortBy) ? sortBy : defaultField;
  const dir = String(order).toLowerCase() === 'asc' ? 'asc' : 'desc';
  return { [field]: dir };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  getPaginationParams,
  buildPagination,
  paginateArray,
  sortArray,
  buildPrismaOrderBy,
};
