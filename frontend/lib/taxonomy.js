// Keep in sync with backend/src/utils/taxonomy.js (the backend is authoritative and validates).
export const SECTORS = [
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

export const REVIEW_STATUSES = ['Submitted', 'Under Review', 'More Information Required', 'Verified', 'Rejected'];
export const NOTE_REQUIRED = ['More Information Required', 'Rejected'];
export const DOCUMENT_TYPES = { cv: 'CV', id: 'Identification', certification: 'Certification' };
