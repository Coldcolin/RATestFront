const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const audit = require('../services/auditService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');
const { hashPassword, verifyPassword, sha256, BCRYPT_COST } = require('../utils/hashing');
const { setSessionCookie, clearSessionCookie, readToken } = require('../middleware/auth');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomUUID(), BCRYPT_COST);

async function register(req, res) {
  const { email, password } = parse(schemas.register, req.body);
  if (await User.exists({ email })) throw new AppError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  // Self-registration can only ever create executives; other roles are assigned by an administrator.
  const user = await User.create({ email, passwordHash: await hashPassword(password), role: 'executive' });
  await audit.record({ actor: user, action: 'auth.register', targetType: 'User', targetId: user.id });
  setSessionCookie(res, user);
  res.status(201).json({ user: user.toSafeJSON() });
}

async function login(req, res) {
  const { email, password } = parse(schemas.login, req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await verifyPassword(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || !user.isActive) {
    await audit.record({
      actor: user ? { id: user.id, role: user.role } : null,
      action: 'auth.login_failed',
      targetType: 'User',
      targetId: user?.id,
      metadata: { emailHash: sha256(email), reason: !user ? 'unknown_email' : !ok ? 'bad_password' : 'inactive' },
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  await audit.record({ actor: user, action: 'auth.login', targetType: 'User', targetId: user.id });
  setSessionCookie(res, user);
  res.json({ user: user.toSafeJSON() });
}

async function logout(req, res) {
  const payload = readToken(req);
  if (payload) await audit.record({ actor: { id: payload.sub, role: payload.role }, action: 'auth.logout', targetType: 'User', targetId: payload.sub });
  clearSessionCookie(res);
  res.status(204).end();
}

async function me(req, res) {
  const user = await User.findById(req.user.id);
  res.json({ user: user.toSafeJSON() });
}

module.exports = { register, login, logout, me };
