const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const handler = (req, res) =>
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } });

const base = { standardHeaders: 'draft-7', legacyHeaders: false, handler, skip: () => env.isTest };

// Per-IP. Blunts brute force and credential stuffing on login/register.
const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 20 });
const apiLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 600 });

module.exports = { authLimiter, apiLimiter };
