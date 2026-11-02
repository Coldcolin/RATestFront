const { Schema, model } = require('mongoose');
const { DOCUMENT_TYPES } = require('../utils/taxonomy');

const documentSchema = new Schema({
  profileId: { type: Schema.Types.ObjectId, ref: 'ExecutiveProfile', required: true, index: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: DOCUMENT_TYPES, required: true },
  cloudinaryPublicId: { type: String, required: true },
  resourceType: { type: String, enum: ['raw', 'image'], required: true },
  format: String,
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  sha256: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

documentSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this.id,
    type: this.type,
    originalName: this.originalName,
    mimeType: this.mimeType,
    size: this.size,
    sha256: this.sha256,
    uploadedAt: this.uploadedAt,
  };
};

module.exports = model('Document', documentSchema);
