/**
 * =============================================================
 * src/modules/categories/categories.controller.js
 * -------------------------------------------------------------
 * MAS'ULIYATI: Kategoriya endpointlarining HTTP qatlami.
 * =============================================================
 */

'use strict';

const service = require('./categories.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess, sendCreated, sendPaginated } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');

/** GET /api/v1/categories — ro'yxat (ochiq) */
const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.validatedQuery || req.query);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/categories/:id — bitta kategoriya (ochiq) */
const getById = asyncHandler(async (req, res) => {
  const category = await service.getById(req.params.id);
  return sendSuccess(res, category);
});

/** POST /api/v1/categories — yaratish (faqat ADMIN) */
const create = asyncHandler(async (req, res) => {
  const category = await service.create(req.body, req.user, requestMeta(req));
  return sendCreated(res, category, 'Kategoriya yaratildi');
});

/** PATCH /api/v1/categories/:id — yangilash (faqat ADMIN) */
const update = asyncHandler(async (req, res) => {
  const category = await service.update(req.params.id, req.body, req.user, requestMeta(req));
  return sendSuccess(res, category, { message: 'Kategoriya yangilandi' });
});

/** DELETE /api/v1/categories/:id — o'chirish (faqat ADMIN) */
const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user, requestMeta(req));
  return sendSuccess(res, result, { message: "Kategoriya o'chirildi" });
});

module.exports = { list, getById, create, update, remove };
