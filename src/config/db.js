/**
 * =============================================================
 * src/config/db.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: PrismaClient'ning YAGONA (singleton) nusxasini
 * yaratish va butun loyihaga eksport qilish.
 *
 * NEGA SINGLETON? Har bir faylda `new PrismaClient()` yozsangiz,
 * har biri DB'ga alohida ulanish pool ochadi va tez orada
 * "too many connections" xatosiga uchraysiz. Shuning uchun
 * bitta nusxa yaratamiz va hamma joyda shuni ishlatamiz.
 * =============================================================
 */

'use strict';

const { PrismaClient } = require('@prisma/client');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Prisma klienti.
 * development rejimida sekin so'rovlarni (>500ms) log qilamiz —
 * junior dasturchi qaysi so'rov sekin ishlayotganini ko'rishi uchun.
 */
const prisma = new PrismaClient({
  log: env.isDev
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : [{ emit: 'stdout', level: 'error' }],
});

if (env.isDev) {
  prisma.$on('query', (e) => {
    if (e.duration >= 500) {
      logger.warn(`Sekin SQL so'rov (${e.duration}ms): ${e.query}`);
    }
  });
}

/**
 * DB'ga ulanишni tekshirish. Server start bo'lishidan oldin chaqiriladi.
 * @returns {Promise<boolean>} ulanish muvaffaqiyatli bo'lsa true
 */
async function connectDatabase() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.success("PostgreSQL bazasiga ulanish muvaffaqiyatli o'rnatildi");
    return true;
  } catch (error) {
    logger.error("PostgreSQL bazasiga ulanib bo'lmadi", error);
    return false;
  }
}

/**
 * DB ulanishini yopish (graceful shutdown paytida chaqiriladi).
 */
async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    logger.info('PostgreSQL ulanishi yopildi');
  } catch (error) {
    logger.error('DB ulanishini yopishda xato', error);
  }
}

module.exports = { prisma, connectDatabase, disconnectDatabase };
