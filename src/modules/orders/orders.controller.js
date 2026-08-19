/**
 * =============================================================
 * src/modules/orders/orders.controller.js
 * =============================================================
 */

'use strict';

const service = require('./orders.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');

/** GET /api/v1/orders */
const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.validatedQuery || req.query, req.user);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/orders/stats */
const stats = asyncHandler(async (req, res) => {
  const data = await service.getStats(req.user);
  return sendSuccess(res, data);
});

/** GET /api/v1/orders/my — joriy foydalanuvchining buyurtmalari */
const myOrders = asyncHandler(async (req, res) => {
  const query = { ...(req.validatedQuery || req.query), buyerId: req.user.id };
  const { data, pagination } = await service.list(query, req.user);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/orders/:id */
const getById = asyncHandler(async (req, res) => {
  const order = await service.getById(req.params.id, req.user);
  return sendSuccess(res, order);
});

/** POST /api/v1/orders */
const create = asyncHandler(async (req, res) => {
  const order = await service.create(req.body, req.user, requestMeta(req));
  return sendCreated(res, order, 'Buyurtma qabul qilindi');
});

/** PATCH /api/v1/orders/:id/status */
const updateStatus = asyncHandler(async (req, res) => {
  const order = await service.updateStatus(req.params.id, req.body, req.user, requestMeta(req));
  return sendSuccess(res, order, { message: `Buyurtma holati "${order.status}" ga o'zgartirildi` });
});

/** DELETE /api/v1/orders/:id */
const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user, requestMeta(req));
  return sendSuccess(res, result, { message: "Buyurtma o'chirildi" });
});

module.exports = { list, stats, myOrders, getById, create, updateStatus, remove };
