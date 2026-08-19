/**
 * =============================================================
 * src/cache/syncQueue.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Cache'ga yozilgan o'zgarishlarni FONDA (background)
 * ma'lumotlar bazasiga yozib boruvchi oddiy navbat (queue).
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │ QANDAY ISHLAYDI? (write-behind / write-back pattern)     │
 * │                                                          │
 * │  Client:  POST /products                                 │
 * │     │                                                    │
 * │     ├─1─> validatsiya                                    │
 * │     ├─2─> cache'ga YOZILDI (RAM — mikrosoniyalar)        │
 * │     ├─3─> clientga 201 JAVOB QAYTDI  ← foydalanuvchi     │
 * │     │                                  "juda tez!" deydi │
 * │     └─4─> navbatga (queue) vazifa qo'yildi               │
 * │                                                          │
 * │  Fon (client kutmaydi):                                  │
 * │     queue -> prisma.product.create() -> DB               │
 * │     xato bo'lsa -> 3 marta qayta urinish (backoff)       │
 * │     baribir xato -> AuditLog'ga yoziladi + cache rollback│
 * └──────────────────────────────────────────────────────────┘
 *
 * NEGA NAVBAT KERAK? Agar har bir so'rovda to'g'ridan-to'g'ri
 * `setImmediate(() => prisma...)` yozsak, bir vaqtning o'zida
 * yuzlab DB so'rovi ketib, ulanishlar pool'i tugab qoladi.
 * Navbat esa vazifalarni KETMA-KET bajaradi va DB'ni ortiqcha
 * yuklamaydi.
 *
 * PRODUCTIONDA: BullMQ + Redis, RabbitMQ yoki Kafka ishlatiladi —
 * ular server o'chsa ham vazifalarni yo'qotmaydi (persistent).
 * Bizniki esa RAM'da, ya'ni server o'chsa navbat yo'qoladi.
 * Shuning uchun shutdown paytida navbatni bo'shatib olamiz (drain).
 * =============================================================
 */

'use strict';

const env = require('../config/env');
const logger = require('../utils/logger');
const { sleep, uuid } = require('../utils/helpers');

class SyncQueue {
  constructor() {
    /** @type {Array<object>} kutayotgan vazifalar */
    this.tasks = [];
    this.isProcessing = false;
    this.stats = {
      enqueued: 0,   // navbatga qo'yilgan
      completed: 0,  // muvaffaqiyatli bajarilgan
      failed: 0,     // 3 urinishdan keyin ham bajarilmagan
      retried: 0,    // qayta urinishlar soni
    };
    /** @type {Array<object>} oxirgi 20 ta xato (debug uchun) */
    this.recentFailures = [];
  }

  /**
   * Navbatga yangi vazifa qo'shadi.
   *
   * @param {object} task
   * @param {string} task.name  vazifa nomi (log uchun): 'product.create'
   * @param {Function} task.run async funksiya — asosiy DB amali
   * @param {Function} [task.onSuccess] muvaffaqiyatli tugaganda (DB natijasi bilan)
   * @param {Function} [task.onFailure] 3 urinishdan keyin ham xato bo'lsa (rollback)
   * @param {object} [task.meta] audit uchun qo'shimcha ma'lumot
   */
  enqueue(task) {
    const item = {
      id: uuid(),
      name: task.name || 'unnamed',
      run: task.run,
      onSuccess: task.onSuccess,
      onFailure: task.onFailure,
      meta: task.meta || {},
      attempts: 0,
      enqueuedAt: Date.now(),
    };

    this.tasks.push(item);
    this.stats.enqueued++;

    // Navbatni ishga tushiramiz, lekin KUTMAYMIZ (await yo'q) —
    // shuning uchun client javobi kechikmaydi.
    // setImmediate: joriy so'rov to'liq tugagach ishga tushadi.
    setImmediate(() => this.process());

    return item.id;
  }

  /**
   * Navbatdagi vazifalarni ketma-ket bajaradi.
   * Bir vaqtda faqat bitta `process` sikli ishlaydi (isProcessing bayrog'i).
   */
  async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.tasks.length > 0) {
      const task = this.tasks.shift();
      await this.executeWithRetry(task);
    }

    this.isProcessing = false;
  }

  /**
   * Bitta vazifani bajaradi, xato bo'lsa "retry with backoff" qiladi.
   *
   * BACKOFF nima? Har qayta urinishdan oldin kutish vaqtini
   * ikki barobar oshirish: 500ms -> 1000ms -> 2000ms.
   * Bu DB vaqtincha band bo'lsa, unga "nafas olish" imkonini beradi.
   */
  async executeWithRetry(task) {
    const maxRetries = env.SYNC_MAX_RETRIES;
    const baseDelay = env.SYNC_RETRY_BASE_DELAY_MS;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      task.attempts = attempt;
      try {
        const result = await task.run();

        if (typeof task.onSuccess === 'function') {
          await task.onSuccess(result);
        }

        this.stats.completed++;
        const waited = Date.now() - task.enqueuedAt;
        logger.cache(`✔ DB sinxronizatsiya: "${task.name}" (urinish ${attempt}, ${waited}ms kutdi)`);
        return result;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;

        if (!isLastAttempt) {
          this.stats.retried++;
          const delay = baseDelay * Math.pow(2, attempt - 1); // 500, 1000, 2000...
          logger.warn(
            `⟳ "${task.name}" DB yozuvi xato berdi (urinish ${attempt}/${maxRetries}): ${error.message}. ` +
              `${delay}ms dan keyin qayta uriniladi`
          );
          await sleep(delay);
          continue;
        }

        // --- Barcha urinishlar tugadi ---
        this.stats.failed++;
        logger.error(`✘ "${task.name}" DB'ga yozilmadi (${maxRetries} marta urinildi)`, error);

        this.recentFailures.unshift({
          task: task.name,
          error: error.message,
          meta: task.meta,
          at: new Date().toISOString(),
        });
        this.recentFailures = this.recentFailures.slice(0, 20);

        // 1) Audit logga yozamiz — admin buni ko'radi
        try {
          const { logAudit } = require('../audit/audit.service');
          logAudit({
            userId: task.meta?.userId || null,
            action: 'DB_SYNC_FAILED',
            entity: task.meta?.entity || 'Unknown',
            entityId: task.meta?.entityId || null,
            meta: { task: task.name, error: error.message?.slice(0, 500), attempts: maxRetries },
          });
        } catch (_) {
          /* audit ham ishlamasa — hech bo'lmasa log qoldi */
        }

        // 2) Cache'ni orqaga qaytaramiz (rollback) — chunki cache'da
        //    bor, DB'da yo'q ma'lumot "arvoh yozuv" bo'lib qoladi.
        if (typeof task.onFailure === 'function') {
          try {
            await task.onFailure(error);
            logger.warn(`↩ "${task.name}" uchun cache orqaga qaytarildi (rollback)`);
          } catch (rollbackError) {
            logger.error('Rollback ham xato berdi', rollbackError);
          }
        }
        return null;
      }
    }
  }

  /**
   * Navbat bo'shashini kutadi (graceful shutdown paytida ishlatiladi).
   * @param {number} timeoutMs maksimal kutish vaqti
   */
  async drain(timeoutMs = 10_000) {
    const startedAt = Date.now();
    if (this.tasks.length === 0 && !this.isProcessing) return true;

    logger.info(`Navbatda ${this.tasks.length} ta vazifa bor — DB'ga yozib bo'lish kutilmoqda...`);

    while ((this.tasks.length > 0 || this.isProcessing) && Date.now() - startedAt < timeoutMs) {
      await sleep(50);
    }

    if (this.tasks.length > 0) {
      logger.error(`Navbatda ${this.tasks.length} ta vazifa bajarilmay qoldi (timeout)`);
      return false;
    }
    logger.success("Navbatdagi barcha vazifalar DB'ga yozildi");
    return true;
  }

  /** Monitoring uchun holat */
  getStats() {
    return {
      pending: this.tasks.length,
      isProcessing: this.isProcessing,
      ...this.stats,
      recentFailures: this.recentFailures.slice(0, 5),
    };
  }
}

// Butun loyiha uchun bitta (singleton) navbat
const syncQueue = new SyncQueue();

module.exports = syncQueue;
module.exports.SyncQueue = SyncQueue;
