const { Schema, model } = require('mongoose');

const auditSchema = new Schema({
  seq: { type: Number, required: true, unique: true }, // unique index stops two writers forking the chain
  actorId: { type: String, default: null },
  actorRole: { type: String, required: true },
  action: { type: String, required: true, index: true },
  targetType: { type: String, default: null },
  targetId: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, required: true },
  prevHash: { type: String, required: true },
  hash: { type: String, required: true },
}, { minimize: false });

// Append-only at the application layer. The chain hash (auditService.verify) detects anything that bypasses this.
function block() {
  throw new Error('AuditLog is append-only');
}
const blocked = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'];
for (const op of blocked) auditSchema.pre(op, { document: true, query: true }, block);
auditSchema.pre('save', function onlyInsert() {
  if (!this.isNew) block();
});

module.exports = model('AuditLog', auditSchema);
