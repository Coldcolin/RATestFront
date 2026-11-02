const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { AppError } = require('../utils/errors');

const COOKIE_NAME = 'ep_session';
const ISSUER = 'executive-portal';

// Cross-site in production (Vercel -> Render) needs SameSite=None, which browsers only accept with Secure.
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  domain: env.cookieDomain,
  path: '/',
});

function setSessionCookie(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, {
    expiresIn: `${env.jwtTtlMinutes}m`,
    algorithm: 'HS256',
    issuer: ISSUER,
  });
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: env.jwtTtlMinutes * 60 * 1000 });
}

const clearSessionCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());

function readToken(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER });
  } catch {
    return null;
  }
}

/** Verifies the cookie and re-loads the user so deactivation and role changes take effect immediately. */
async function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in');
  req.user = { id: user.id, role: user.role, email: user.email };
  next();
}

module.exports = { requireAuth, readToken, setSessionCookie, clearSessionCookie, COOKIE_NAME };
