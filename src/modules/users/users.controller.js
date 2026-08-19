/**
 * =============================================================
 * src/modules/users/users.controller.js
 * =============================================================
 */

'use strict';

const service = require('./users.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');

/** GET /api/v1/users — faqat ADMIN */
const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await service.list(req.validatedQuery || req.query);
  return sendPaginated(res, data, pagination);
});

/** GET /api/v1/users/:id — o'zi yoki ADMIN */
const getById = asyncHandler(async (req, res) => {
  const user = await service.getById(req.params.id, req.user);
  return sendSuccess(res, user);
});

/** PATCH /api/v1/users/:id — o'zi yoki ADMIN */
const update = asyncHandler(async (req, res) => {
  const user = await service.update(req.params.id, req.body, req.user, requestMeta(req));
  return sendSuccess(res, user, { message: 'Profil yangilandi' });
});

/** PATCH /api/v1/users/:id/role — faqat ADMIN */
const updateRole = asyncHandler(async (req, res) => {
  const user = await service.updateRole(req.params.id, req.body.role, req.user, requestMeta(req));
  return sendSuccess(res, user, { message: `Rol "${req.body.role}" ga o'zgartirildi` });
});

/** PATCH /api/v1/users/:id/status — faqat ADMIN */
const updateStatus = asyncHandler(async (req, res) => {
  const user = await service.updateStatus(req.params.id, req.body, req.user, requestMeta(req));
  return sendSuccess(res, user, {
    message: req.body.isActive ? 'Foydalanuvchi blokdan chiqarildi' : 'Foydalanuvchi bloklandi',
  });
});

/** DELETE /api/v1/users/:id — faqat ADMIN */
const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.params.id, req.user, requestMeta(req));
  return sendSuccess(res, result, { message: result.message || "Foydalanuvchi o'chirildi" });
});

module.exports = { list, getById, update, updateRole, updateStatus, remove };
