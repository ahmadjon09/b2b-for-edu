/**
 * =============================================================
 * src/utils/logger.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Konsolga chiroyli, bir xil formatdagi loglar
 * chiqarish (vaqt + daraja + xabar).
 *
 * NEGA `console.log` emas? Chunki:
 *   - har bir logda vaqt turishi kerak
 *   - darajalar (info/warn/error) rangli ajratilsa o'qish oson
 *   - keyinchalik winston/pino ga o'tmoqchi bo'lsangiz, faqat
 *     shu faylni almashtirasiz, qolgan kod tegilmaydi.
 * =============================================================
 */

'use strict';

// ANSI rang kodlari (terminalda rangli matn uchun)
const C = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/** Hozirgi vaqtni "2026-08-19 21:03:11" ko'rinishida qaytaradi */
function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function format(color, label, message) {
  return `${C.gray}[${timestamp()}]${C.reset} ${color}${label.padEnd(7)}${C.reset} ${message}`;
}

const logger = {
  /** Oddiy ma'lumot */
  info(message) {
    console.log(format(C.cyan, 'INFO', message));
  },

  /** Muvaffaqiyatli amal */
  success(message) {
    console.log(format(C.green, 'OK', message));
  },

  /** Ogohlantirish — xato emas, lekin e'tibor berish kerak */
  warn(message) {
    console.warn(format(C.yellow, 'WARN', message));
  },

  /**
   * Xato. Ikkinchi argument sifatida Error obyektini bersangiz,
   * uning xabari va stack'i ham chiqadi.
   */
  error(message, error) {
    console.error(format(C.red, 'ERROR', message));
    if (error) {
      const detail = error instanceof Error ? `${error.message}\n${error.stack}` : JSON.stringify(error);
      console.error(`${C.red}   └─ ${detail}${C.reset}`);
    }
  },

  /** Debug — faqat development rejimida ko'rinadi */
  debug(message) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(format(C.magenta, 'DEBUG', message));
    }
  },

  /** Cache/sync bilan bog'liq loglar (alohida ajratib ko'rsatish uchun) */
  cache(message) {
    console.log(format(C.blue, 'CACHE', message));
  },

  /** HTTP so'rov loglari — morgan shu yerga yozadi */
  http(message) {
    console.log(format(C.cyan, 'HTTP ', message));
  },
};

module.exports = logger;
