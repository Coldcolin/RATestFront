const { Schema, model } = require('mongoose');
const { PROFILE_STATUSES, SECTORS } = require('../utils/taxonomy');

const opts = { _id: false };

const professionalSchema = new Schema(
  {
    fullName: String,
    contactEmail: String,
    phone: String,
    currentTitle: String,
    currentCompany: String,
    yearsExperience: Number,
    summary: String,
  },
  opts,
);

const experienceSchema = new Schema(
  { organisation: String, title: String, startDate: String, endDate: String, isBoard: Boolean, description: String },
  opts,
);

const qualificationSchema = new Schema(
  { kind: { type: String, enum: ['degree', 'certification'] }, institution: String, title: String, year: Number },
  opts,
);

const refereeSchema = new Schema({ name: String, relationship: String, organisation: String, email: String, phone: String }, opts);

// Consents are appended, never edited: withdrawal is a new entry with granted=false.
const consentSchema = new Schema(
  {
    purpose: { type: String, enum: ['vetting', 'sharing'], required: true },
    granted: { type: Boolean, required: true },
    version: { type: String, required: true },
    timestamp: { type: Date, required: true },
    ipHash: { type: String, required: true },
  },
  opts,
);

const vettingNoteSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User' },
    authorRole: String,
    fromStatus: String,
    toStatus: String,
    note: String,
    createdAt: { type: Date, default: Date.now },
  },
  opts,
);

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: PROFILE_STATUSES, default: 'draft', index: true },
    currentStep: { type: Number, default: 1, min: 1, max: 7 },
    professional: professionalSchema,
    experience: [experienceSchema],
    sectors: [{ type: String, enum: SECTORS }],
    specialisms: String,
    qualifications: [qualificationSchema],
    referees: [refereeSchema],
    consents: [consentSchema],
    vettingNotes: [vettingNoteSchema],
    assignedReviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
    // step -> { idempotencyKey, clientSavedAt } so offline replays are de-duplicated and never overwrite newer data.
    stepMeta: { type: Map, of: new Schema({ idempotencyKey: String, clientSavedAt: Date }, opts), default: {} },
    submittedAt: Date,
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

profileSchema.methods.latestConsent = function latestConsent(purpose) {
  return this.consents.filter((c) => c.purpose === purpose).at(-1);
};

module.exports = model('ExecutiveProfile', profileSchema);
