const { Schema, model } = require('mongoose');

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    subscription: {
      endpoint: String,
      expirationTime: Number,
      keys: { p256dh: String, auth: String },
    },
  },
  { timestamps: true },
);

module.exports = model('PushSubscription', pushSubscriptionSchema);
