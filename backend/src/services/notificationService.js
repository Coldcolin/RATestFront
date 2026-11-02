const webpush = require('web-push');
const env = require('../config/env');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');

const pushEnabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);
if (pushEnabled) webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);

/**
 * Always writes an in-app notification (the fallback that works without push permission), then
 * best-effort Web Push. Push payloads are generic on purpose: they transit third-party push
 * services, so no PII or reviewer notes go in them.
 */
async function notify(userId, { type, message, pushTitle, pushBody, url = '/' }) {
  try {
    await Notification.create({ userId, type, message });
    if (!pushEnabled) return;
    const subs = await PushSubscription.find({ userId });
    const payload = JSON.stringify({ title: pushTitle, body: pushBody, url });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(s.subscription, payload, { TTL: 3600 });
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) await s.deleteOne(); // subscription expired
          else console.error('[push] send failed', err.statusCode || err.message);
        }
      }),
    );
  } catch (err) {
    // A notification failure must not undo or fail the status change that triggered it.
    console.error('[notify] failed', err.message);
  }
}

module.exports = { notify, pushEnabled };
