/**
 * =============================================================
 * src/modules/uploads/uploads.controller.js
 * =============================================================
 */

'use strict';

const service = require('./uploads.service');
const asyncHandler = require('../../utils/asyncHandler');
const { sendCreated, sendSuccess } = require('../../utils/response');
const { requestMeta } = require('../../audit/audit.service');
const env = require('../../config/env');
const { ALLOWED_MIME_TYPES } = require('../../config/imgbb');

/** POST /api/v1/uploads/image — bitta rasm */
const single = asyncHandler(async (req, res) => {
  const data = await service.uploadSingle(req.file, req.user, requestMeta(req));
  return sendCreated(res, data, 'Rasm yuklandi');
});

/** POST /api/v1/uploads/images — bir nechta rasm */
const multiple = asyncHandler(async (req, res) => {
  const data = await service.uploadMultiple(req.files, req.user, requestMeta(req));
  return sendCreated(res, data, data.summary);
});

/**
 * GET /api/v1/uploads/info — yuklash qoidalari.
 * Frontend dasturchi cheklovlarni "qattiq kodlab" yozmasligi uchun.
 */
const info = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    enabled: env.imgbbEnabled,
    maxSizeBytes: env.MAX_UPLOAD_SIZE_BYTES,
    maxSizeMb: Number((env.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024).toFixed(2)),
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    singleFieldName: 'image',
    multipleFieldName: 'images',
    maxFiles: 5,
    note: env.imgbbEnabled
      ? "Rasm imgbb.com'ga yuklanadi va doimiy URL qaytariladi"
      : ".env faylida IMGBB_API_KEY yo'q — yuklash o'chirilgan",
  });
});

module.exports = { single, multiple, info };
