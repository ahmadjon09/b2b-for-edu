/**
 * =============================================================
 * src/modules/orders/orders.validation.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Buyurtma endpointlari uchun validatsiya.
 * =============================================================
 */

'use strict';

const { z } = require('zod');
const { buildListQuerySchema, quantitySchema } = require('../../utils/commonValidation');

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/** Buyurtmadagi bitta qator */
const orderItemSchema = z.object({
  productId: z
    .string({ required_error: 'productId majburiy' })
    .uuid("productId noto'g'ri formatda — UUID bo'lishi kerak"),
  quantity: quantitySchema,
});

/** POST /orders */
const createOrderSchema = z.object({
  items: z
    .array(orderItemSchema, { required_error: 'items majburiy' })
    .min(1, "Buyurtmada kamida 1 ta mahsulot bo'lishi kerak")
    .max(50, "Bitta buyurtmada 50 tadan ko'p mahsulot bo'lmasin"),
  note: z.string().trim().max(500, "Izoh 500 ta belgidan oshmasin").optional().nullable(),
});

/** PATCH /orders/:id/status */
const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES, {
    errorMap: () => ({ message: `status quyidagilardan biri bo'lsin: ${ORDER_STATUSES.join(', ')}` }),
  }),
  note: z.string().trim().max(500).optional().nullable(),
});

/** GET /orders */
const listOrdersSchema = buildListQuerySchema(['createdAt', 'updatedAt', 'totalPrice', 'status'], {
  status: z.enum(ORDER_STATUSES).optional(),
  buyerId: z.string().uuid("buyerId noto'g'ri formatda").optional(),
  sellerId: z.string().uuid("sellerId noto'g'ri formatda").optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  dateFrom: z.coerce.date({ errorMap: () => ({ message: "dateFrom sana formatida bo'lsin, masalan 2026-01-01" }) }).optional(),
  dateTo: z.coerce.date({ errorMap: () => ({ message: "dateTo sana formatida bo'lsin, masalan 2026-12-31" }) }).optional(),
});

module.exports = { createOrderSchema, updateOrderStatusSchema, listOrdersSchema, ORDER_STATUSES };
