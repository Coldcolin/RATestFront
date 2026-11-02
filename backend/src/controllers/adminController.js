const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const audit = require('../services/auditService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');

async function listUsers(req, res) {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ items: users.map((u) => ({ ...u.toSafeJSON(), deleted: Boolean(u.deletedAt) })) });
}

async function loadOtherUser(req) {
  // Stops an admin from demoting or deactivating themselves and locking everyone out.
  if (req.params.id === req.user.id) throw new AppError(400, 'SELF_CHANGE', 'You cannot change your own role or status');
  const user = await User.findById(req.params.id);
  if (!user || user.deletedAt) throw new AppError(404, 'NOT_FOUND', 'User not found');
  return user;
}

async function changeRole(req, res) {
  const { role } = parse(schemas.roleChange, req.body);
  const user = await loadOtherUser(req);
  const from = user.role;
  user.role = role;
  await user.save();
  await audit.record({ actor: req.user, action: 'user.role_changed', targetType: 'User', targetId: user.id, metadata: { from, to: role } });
  res.json({ user: user.toSafeJSON() });
}

async function changeActive(req, res) {
  const { isActive } = parse(schemas.activeChange, req.body);
  const user = await loadOtherUser(req);
  user.isActive = isActive;
  await user.save();
  await audit.record({ actor: req.user, action: isActive ? 'user.activated' : 'user.deactivated', targetType: 'User', targetId: user.id });
  res.json({ user: user.toSafeJSON() });
}

async function listAudit(req, res) {
  const { page, limit, action } = parse(schemas.auditQuery, req.query);
  const filter = action ? { action } : {};
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ seq: -1 }).skip((page - 1) * limit).limit(limit).select('-_id -__v').lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
}

async function verifyAudit(req, res) {
  const result = await audit.verify();
  await audit.record({ actor: req.user, action: 'audit.verified', metadata: { intact: result.intact, checked: result.checked } });
  res.json(result);
}

module.exports = { listUsers, changeRole, changeActive, listAudit, verifyAudit };
