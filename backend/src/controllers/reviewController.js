const ExecutiveProfile = require('../models/ExecutiveProfile');
const Document = require('../models/Document');
const audit = require('../services/auditService');
const { notify } = require('../services/notificationService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');
const { maskName, maskEmail } = require('../utils/mask');
const { REVIEW_TRANSITIONS, NOTE_REQUIRED } = require('../utils/taxonomy');

async function queue(req, res) {
  const { status, sort } = parse(schemas.queueQuery, req.query);
  if (status === 'draft') throw new AppError(400, 'INVALID_FILTER', 'Drafts are not visible to reviewers');
  // Drafts are excluded: the executive has not yet consented to their data being reviewed.
  const filter = { isDeleted: false, status: status || { $ne: 'draft' } };
  const profiles = await ExecutiveProfile.find(filter)
    .sort({ submittedAt: sort === 'asc' ? 1 : -1 })
    .select('userId status professional.fullName professional.currentTitle professional.currentCompany sectors submittedAt updatedAt')
    .populate('userId', 'email')
    .lean();

  // Data minimisation: names and emails are masked in the list; full detail only on the single-record view.
  res.json({
    items: profiles.map((p) => ({
      id: String(p._id),
      name: maskName(p.professional?.fullName),
      email: maskEmail(p.userId?.email),
      currentTitle: p.professional?.currentTitle || null,
      currentCompany: p.professional?.currentCompany || null,
      sectors: p.sectors,
      status: p.status,
      submittedAt: p.submittedAt,
      updatedAt: p.updatedAt,
    })),
  });
}

async function findReviewable(id) {
  const profile = await ExecutiveProfile.findById(id);
  if (!profile || profile.isDeleted || profile.status === 'draft') throw new AppError(404, 'NOT_FOUND', 'Submission not found');
  return profile;
}

async function detail(req, res) {
  const profile = await findReviewable(req.params.profileId);
  await profile.populate([{ path: 'userId', select: 'email' }, { path: 'vettingNotes.authorId', select: 'email' }]);
  const documents = await Document.find({ profileId: profile.id }).sort({ uploadedAt: 1 });
  // Viewing PII is itself an auditable event (accountability principle).
  await audit.record({ actor: req.user, action: 'profile.viewed', targetType: 'ExecutiveProfile', targetId: profile.id });

  const p = profile.toObject();
  res.json({
    profile: {
      id: profile.id,
      accountEmail: p.userId?.email,
      status: p.status,
      professional: p.professional,
      experience: p.experience,
      sectors: p.sectors,
      specialisms: p.specialisms,
      qualifications: p.qualifications,
      referees: p.referees,
      consents: { vetting: profile.latestConsent('vetting'), sharing: profile.latestConsent('sharing') },
      vettingNotes: p.vettingNotes.map((n) => ({ ...n, authorEmail: n.authorId?.email, authorId: n.authorId?._id })),
      submittedAt: p.submittedAt,
      updatedAt: p.updatedAt,
      allowedTransitions: REVIEW_TRANSITIONS[p.status] || [],
      documents: documents.map((d) => d.toPublicJSON()),
    },
  });
}

const STATUS_MESSAGES = {
  'Under Review': 'Your profile is now under review by a RiskTech consultant.',
  Verified: 'Congratulations — your profile has been verified.',
  Rejected: 'Your profile was not verified.',
  'More Information Required': 'More information is required to complete your vetting.',
};

async function changeStatus(req, res) {
  const { status: to, note } = parse(schemas.statusChange, req.body);
  const profile = await findReviewable(req.params.profileId);
  const from = profile.status;
  if (!(REVIEW_TRANSITIONS[from] || []).includes(to)) {
    throw new AppError(409, 'ILLEGAL_TRANSITION', `Cannot move a profile from "${from}" to "${to}"`);
  }
  if (NOTE_REQUIRED.includes(to) && !note) throw new AppError(400, 'NOTE_REQUIRED', `A reviewer note is required for "${to}"`);

  // Conditional update on the current status: if another reviewer moved it first, we get null instead of a lost update.
  const updated = await ExecutiveProfile.findOneAndUpdate(
    { _id: profile.id, status: from },
    {
      $set: { status: to, ...(to === 'Under Review' ? { assignedReviewerId: req.user.id } : {}) },
      $push: { vettingNotes: { authorId: req.user.id, authorRole: req.user.role, fromStatus: from, toStatus: to, note: note || '', createdAt: new Date() } },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new AppError(409, 'CONFLICT', 'This submission was updated by someone else. Refresh and try again.');

  await audit.record({ actor: req.user, action: 'vetting.status_changed', targetType: 'ExecutiveProfile', targetId: profile.id, metadata: { from, to } });
  await notify(updated.userId, {
    type: 'status_changed',
    message: to === 'More Information Required' && note ? `${STATUS_MESSAGES[to]} Reviewer note: ${note}` : STATUS_MESSAGES[to],
    pushTitle: 'Vetting status updated',
    pushBody: `Your vetting status is now: ${to}`,
    url: '/onboarding',
  });

  res.json({ id: updated.id, status: updated.status, allowedTransitions: REVIEW_TRANSITIONS[to] || [] });
}

module.exports = { queue, detail, changeStatus };
