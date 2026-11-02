const { Schema, model } = require('mongoose');
const { ROLES } = require('../utils/taxonomy');

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // select:false keeps the hash out of every query unless explicitly asked for.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'executive', required: true },
    isActive: { type: Boolean, default: true },
    mfaSecret: { type: String, select: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this.id, email: this.email, role: this.role, isActive: this.isActive, createdAt: this.createdAt };
};

module.exports = model('User', userSchema);
