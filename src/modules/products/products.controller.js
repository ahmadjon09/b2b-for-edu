/**
 * =============================================================
 * src/modules/products/products.controller.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Mahsulot endpointlarining HTTP qatlami.
 * =============================================================
 */

'use strict';

const service = require('./products.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');

/** GET /api/v1/products — ro'yxat (ochiq, filtrlar bilan) */
const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.validatedQuery || req.query, req.user);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/products/:id — bitta mahsulot (ochiq) */
const getById = asyncHandler(async (req, res) => {
  const product = await service.getById(req.params.id);
  return sendSuccess(res, product);
});

/** GET /api/v1/products/my/list — sotuvchining o'z mahsulotlari */
const myProducts = asyncHandler(async (req, res) => {
  const query = { ...(req.validatedQuery || req.query), sellerId: req.user.id };
  const { data, pagination } = await service.list(query, req.user);
  return sendPaginated(res, data, pagination);
});

/** POST /api/v1/products — yaratish (SELLER yoki ADMIN) */
const create = asyncHandler(async (req, res) => {
  const product = await service.create(req.body, req.user, requestMeta(req));
  return sendCreated(res, product, 'Mahsulot yaratildi');
});

/** PATCH /api/v1/products/:id — yangilash (egasi yoki ADMIN) */
const update = asyncHandler(async (req, res) => {
  const product = await service.update(req.params.id, req.body, req.user, requestMeta(req));
  return sendSuccess(res, product, { message: 'Mahsulot yangilandi' });
});

/** DELETE /api/v1/products/:id — o'chirish (egasi yoki ADMIN) */
const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user, requestMeta(req));
  return sendSuccess(res, result, { message: result.message || "Mahsulot o'chirildi" });
});

module.exports = { list, getById, myProducts, create, update, remove };
