const crypto = require('crypto');
const env = require('../config/env');
const ExecutiveProfile = require('../models/ExecutiveProfile');
const Document = require('../models/Document');
const User = require('../models/User');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const AuditLog = require('../models/AuditLog');
const audit = require('../services/auditService');
const storageService = require('../services/storageService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');
const { hashIp, hashPassword, verifyPassword } = require('../utils/hashing');
const { EDITABLE_STATUSES } = require('../utils/taxonomy');
const { clearSessionCookie } = require('../middleware/auth');

async function getOrCreateProfile(userId) {
  const existing = await ExecutiveProfile.findOne({ userId });
  if (existing) return existing;
  try {
    return await ExecutiveProfile.create({ userId });
  } catch (err) {
    if (err.code === 11000) return ExecutiveProfile.findOne({ userId }); // created by a concurrent request
    throw err;
  }
}

// What the executive sees about themselves. Internal reviewer notes are limited to the outcomes they need to act on.
function toExecutiveView(profile, documents) {
  const p = profile.toObject();
  return {
    id: profile.id,
    status: p.status,
    currentStep: p.currentStep,
    editable: EDITABLE_STATUSES.includes(p.status),
    professional: p.professional || null,
    experience: p.experience,
    sectors: p.sectors,
    specialisms: p.specialisms || '',
    qualifications: p.qualifications,
    referees: p.referees,
    consents: { vetting: profile.latestConsent('vetting') || null, sharing: profile.latestConsent('sharing') || null },
    feedback: p.vettingNotes
      .filter((n) => ['More Information Required', 'Rejected', 'Verified'].includes(n.toStatus))
      .map(({ toStatus, note, createdAt }) => ({ status: toStatus, note, createdAt })),
    submittedAt: p.submittedAt,
    updatedAt: p.updatedAt,
    documents: documents.map((d) => d.toPublicJSON()),
  };
}

const assertEditable = (profile) => {
  if (!EDITABLE_STATUSES.includes(profile.status)) throw new AppError(409, 'PROFILE_LOCKED', `Profile cannot be edited while ${profile.status}`);
};

async function hasRequiredDocuments(profileId) {
  const types = await Document.distinct('type', { profileId });
  return types.includes('cv') && types.includes('id');
}

async function getMine(req, res) {
  const profile = await getOrCreateProfile(req.user.id);
  const documents = await Document.find({ profileId: profile.id }).sort({ uploadedAt: 1 });
  res.json({ profile: toExecutiveView(profile, documents) });
}

function applyStep(profile, step, data, req) {
  switch (step) {
    case 1: profile.professional = data; break;
    case 2: profile.experience = data.experience; break;
    case 3: profile.sectors = data.sectors; profile.specialisms = data.specialisms || ''; break;
    case 4: profile.qualifications = data.qualifications; break;
    case 5: profile.referees = data.referees; break;
    case 7: {
      const timestamp = new Date();
      const ipHash = hashIp(req.ip);
      for (const purpose of ['vetting', 'sharing']) {
        profile.consents.push({ purpose, granted: data.consents[purpose], version: env.consentVersion, timestamp, ipHash });
      }
      break;
    }
    default: break; // step 6 (documents) has no body; saving it just marks the step complete
  }
}

/** PUT /profile/me/step/:step — idempotent draft save. Safe to replay from the offline queue. */
async function saveStep(req, res) {
  const step = Number(req.params.step);
  if (!Number.isInteger(step) || step < 1 || step > 7) throw new AppError(400, 'INVALID_STEP', 'Step must be 1-7');
  const { data, clientSavedAt } = parse(schemas.stepEnvelope, req.body);

  const profile = await getOrCreateProfile(req.user.id);
  assertEditable(profile);

  const idempotencyKey = req.get('Idempotency-Key')?.slice(0, 100);
  const meta = profile.stepMeta.get(String(step));
  const documents = () => Document.find({ profileId: profile.id }).sort({ uploadedAt: 1 });
  if (idempotencyKey && meta?.idempotencyKey === idempotencyKey) {
    return res.json({ profile: toExecutiveView(profile, await documents()), replayed: true });
  }
  // Clamp to server time so a client clock in the future cannot lock out later saves.
  const savedAt = clientSavedAt ? new Date(Math.min(Date.parse(clientSavedAt), Date.now())) : new Date();
  if (meta?.clientSavedAt && savedAt < meta.clientSavedAt) {
    return res.json({ profile: toExecutiveView(profile, await documents()), stale: true });
  }

  const valid = parse(schemas.steps[step], data);
  if (step === 6 && !(await hasRequiredDocuments(profile.id))) {
    throw new AppError(400, 'DOCUMENTS_REQUIRED', 'Upload at least a CV and an identification document');
  }
  applyStep(profile, step, valid, req);
  profile.stepMeta.set(String(step), { idempotencyKey: idempotencyKey || crypto.randomUUID(), clientSavedAt: savedAt });
  profile.currentStep = Math.max(profile.currentStep, Math.min(step + 1, 7));
  await profile.save();

  await audit.record({ actor: req.user, action: 'profile.step_saved', targetType: 'ExecutiveProfile', targetId: profile.id, metadata: { step } });
  if (step === 7) {
    await audit.record({
      actor: req.user,
      action: 'consent.recorded',
      targetType: 'ExecutiveProfile',
      targetId: profile.id,
      metadata: { vetting: valid.consents.vetting, sharing: valid.consents.sharing, version: env.consentVersion },
    });
  }
  res.json({ profile: toExecutiveView(profile, await documents()) });
}

async function submit(req, res) {
  const profile = await getOrCreateProfile(req.user.id);
  assertEditable(profile);

  // Re-validate everything server-side: the stored draft is the source of truth, not the wizard.
  const p = profile.toObject();
  const stepData = {
    1: p.professional,
    2: { experience: p.experience },
    3: { sectors: p.sectors, specialisms: p.specialisms || '' },
    4: { qualifications: p.qualifications },
    5: { referees: p.referees },
  };
  const incomplete = Object.entries(stepData)
    .filter(([step, data]) => !schemas.steps[step].safeParse(data ?? {}).success)
    .map(([step]) => Number(step));
  if (!(await hasRequiredDocuments(profile.id))) incomplete.push(6);
  if (incomplete.length) throw new AppError(400, 'INCOMPLETE_PROFILE', `Please complete step(s) ${incomplete.join(', ')}`, { steps: incomplete });
  if (!profile.latestConsent('vetting')?.granted) {
    throw new AppError(400, 'CONSENT_REQUIRED', 'Consent to process your data for vetting is required to submit');
  }

  const from = profile.status;
  profile.status = 'Submitted';
  profile.submittedAt = new Date();
  await profile.save();
  await audit.record({ actor: req.user, action: 'profile.submitted', targetType: 'ExecutiveProfile', targetId: profile.id, metadata: { from } });

  const documents = await Document.find({ profileId: profile.id }).sort({ uploadedAt: 1 });
  res.json({ profile: toExecutiveView(profile, documents) });
}

/** NDPA right of access: everything we hold about the data subject, as JSON. */
async function exportMine(req, res) {
  const [user, profile] = await Promise.all([User.findById(req.user.id), ExecutiveProfile.findOne({ userId: req.user.id })]);
  const [documents, notifications, auditTrail] = await Promise.all([
    profile ? Document.find({ profileId: profile.id }) : [],
    Notification.find({ userId: req.user.id }).select('-__v -userId').lean(),
    AuditLog.find({ $or: [{ actorId: req.user.id }, { targetId: req.user.id }, ...(profile ? [{ targetId: profile.id }] : [])] })
      .select('seq action actorRole targetType timestamp metadata -_id')
      .sort({ seq: 1 })
      .lean(),
  ]);
  let profileData = null;
  if (profile) {
    const { stepMeta, __v, ...rest } = profile.toObject(); // eslint-disable-line no-unused-vars
    profileData = rest;
  }

  await audit.record({ actor: req.user, action: 'data.exported', targetType: 'User', targetId: req.user.id });
  res.set('Content-Disposition', 'attachment; filename="my-data-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    notice: 'Export of personal data held by RiskTech & Advisory under the Nigeria Data Protection Act 2023 (right of access).',
    account: user.toSafeJSON(),
    profile: profileData,
    documents: documents.map((d) => d.toPublicJSON()),
    notifications,
    auditTrail,
  });
}

/**
 * NDPA right to erasure. Purges stored files, anonymises the profile and account, and keeps only
 * non-identifying records needed for accountability (audit chain, consent evidence, status history).
 */
async function requestDeletion(req, res) {
  const { password } = parse(schemas.deleteRequest, req.body);
  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!(await verifyPassword(password, user.passwordHash))) throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');

  const profile = await ExecutiveProfile.findOne({ userId: user.id });
  let documentsPurged = 0;
  if (profile) {
    const docs = await Document.find({ profileId: profile.id });
    let failures = 0;
    for (const doc of docs) {
      try {
        await storageService.remove({ publicId: doc.cloudinaryPublicId, resourceType: doc.resourceType });
        await doc.deleteOne();
        documentsPurged += 1;
      } catch (err) {
        failures += 1;
        console.error('[erasure] purge failed', doc.id, err.message);
      }
    }
    if (failures) {
      await audit.record({ actor: req.user, action: 'data.erasure_failed', targetType: 'User', targetId: user.id, metadata: { documentsPurged, failures } });
      throw new AppError(502, 'ERASURE_INCOMPLETE', 'Some documents could not be deleted yet. Please try again.');
    }

    profile.set({
      professional: undefined,
      experience: [],
      sectors: [],
      specialisms: undefined,
      qualifications: [],
      referees: [],
      stepMeta: {},
      // Keep the status history skeleton for accountability, but drop free-text notes that may describe the person.
      vettingNotes: profile.vettingNotes.map((n) => ({ ...n.toObject(), note: '[erased]' })),
      isDeleted: true,
      deletedAt: new Date(),
    });
    await profile.save();
  }

  await Promise.all([Notification.deleteMany({ userId: user.id }), PushSubscription.deleteMany({ userId: user.id })]);
  user.email = `erased-${user.id}@erased.invalid`;
  user.passwordHash = await hashPassword(crypto.randomUUID());
  user.isActive = false;
  user.deletedAt = new Date();
  await user.save();

  await audit.record({ actor: req.user, action: 'data.erased', targetType: 'User', targetId: user.id, metadata: { documentsPurged } });
  clearSessionCookie(res);
  res.json({ erased: true, documentsPurged });
}

module.exports = { getMine, saveStep, submit, exportMine, requestDeletion, getOrCreateProfile, assertEditable };
