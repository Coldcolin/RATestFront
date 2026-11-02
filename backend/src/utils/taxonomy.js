// Keep in sync with frontend/lib/taxonomy.js.
const SECTORS = [
  'Financial Services',
  'Energy',
  'Healthcare',
  'Technology',
  'Public Sector',
  'Telecommunications',
  'Manufacturing',
  'Consumer & Retail',
  'Agriculture',
  'Real Estate & Infrastructure',
  'Mining & Natural Resources',
  'Non-Profit',
];

const PROFILE_STATUSES = ['draft', 'Submitted', 'Under Review', 'More Information Required', 'Verified', 'Rejected'];

// Reviewer-driven transitions. Executives move MIR -> Submitted only via resubmission.
const REVIEW_TRANSITIONS = {
  Submitted: ['Under Review'],
  'Under Review': ['Verified', 'Rejected', 'More Information Required'],
};
const NOTE_REQUIRED = ['More Information Required', 'Rejected'];
const EDITABLE_STATUSES = ['draft', 'More Information Required'];

const DOCUMENT_TYPES = ['cv', 'id', 'certification'];
const ROLES = ['executive', 'consultant', 'admin'];

module.exports = { SECTORS, PROFILE_STATUSES, REVIEW_TRANSITIONS, NOTE_REQUIRED, EDITABLE_STATUSES, DOCUMENT_TYPES, ROLES };
