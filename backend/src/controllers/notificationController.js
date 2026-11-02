const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const audit = require('../services/auditService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');

async function list(req, res) {
  const items = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(50).select('-__v -userId');
  res.json({ items, unread: items.filter((n) => !n.read).length });
}

async function markRead(req, res) {
  // Scoped by userId so one user cannot touch another's notifications.
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { read: true }, { returnDocument: 'after' });
  if (!n) throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  res.json({ ok: true });
}

async function subscribe(req, res) {
  const subscription = parse(schemas.pushSubscription, req.body);
  // Upsert by endpoint: a shared browser re-subscribing moves the subscription to the signed-in user.
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { userId: req.user.id, endpoint: subscription.endpoint, subscription },
    { upsert: true },
  );
  await audit.record({ actor: req.user, action: 'push.subscribed', targetType: 'User', targetId: req.user.id });
  res.status(201).json({ ok: true });
}

module.exports = { list, markRead, subscribe };
