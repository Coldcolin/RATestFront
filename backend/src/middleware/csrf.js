const env = require('../config/env');
const { AppError } = require('../utils/errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * SameSite=None cookies are sent on cross-site requests, so state-changing calls need CSRF defence:
 * the Origin must be allow-listed, and a custom header is required. Browsers only let a page send a
 * custom header cross-origin after a CORS preflight, which our CORS policy refuses for other origins.
 */
function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('Origin');
  if (origin && !env.corsOrigins.includes(origin)) throw new AppError(403, 'CSRF_REJECTED', 'Request origin not allowed');
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') throw new AppError(403, 'CSRF_REJECTED', 'Missing anti-CSRF header');
  next();
}

module.exports = { csrfGuard };
