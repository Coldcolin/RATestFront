const multer = require('multer');
const env = require('../config/env');
const { AppError } = require('../utils/errors');

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

function notFound(req, res) {
  send(res, 404, 'NOT_FOUND', 'Route not found');
}

// Clients get a stable code + generic message; detail stays in server logs.
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) return send(res, err.status, err.code, err.message, err.details);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return send(res, 413, 'FILE_TOO_LARGE', 'File exceeds the 5 MB limit');
    return send(res, 400, 'UPLOAD_ERROR', 'Invalid upload');
  }
  if (err.name === 'CastError') return send(res, 400, 'INVALID_ID', 'Invalid identifier');
  if (err.type === 'entity.parse.failed') return send(res, 400, 'INVALID_JSON', 'Malformed JSON body');
  if (err.type === 'entity.too.large') return send(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err.name === 'ValidationError') return send(res, 400, 'VALIDATION_ERROR', 'Some fields are invalid');

  console.error('[error]', req.method, req.path, env.isProd ? err.message : err);
  return send(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}

module.exports = { notFound, errorHandler };
