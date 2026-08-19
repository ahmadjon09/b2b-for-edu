/**
 * =============================================================
 * src/audit/audit.validation.js
 * =============================================================
 */

'use strict';

const { z } = require('zod');
const { buildListQuerySchema } = require('../utils/commonValidation');
const { AUDIT_ACTIONS } = require('./audit.service');

const ACTION_VALUES = Object.values(AUDIT_ACTIONS);

const listAuditSchema = buildListQuerySchema(['createdAt', 'action', 'entity'], {
  userId: z.string().uuid("userId noto'g'ri formatda").optional(),
  action: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => ACTION_VALUES.includes(v), {
      message: `action quyidagilardan biri bo'lsin: ${ACTION_VALUES.join(', ')}`,
    })
    .optional(),
  entity: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  dateFrom: z.coerce.date({ errorMap: () => ({ message: "dateFrom sana formatida bo'lsin (2026-01-01)" }) }).optional(),
  dateTo: z.coerce.date({ errorMap: () => ({ message: "dateTo sana formatida bo'lsin (2026-12-31)" }) }).optional(),
});

module.exports = { listAuditSchema, ACTION_VALUES };
