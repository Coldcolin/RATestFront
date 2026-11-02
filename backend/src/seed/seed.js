/* Synthetic demo data only. Every person, email and organisation here is fictitious. */
const mongoose = require('mongoose');
const env = require('../config/env');
const { connectDb } = require('../config/db');
const User = require('../models/User');
const ExecutiveProfile = require('../models/ExecutiveProfile');
const Document = require('../models/Document');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const audit = require('../services/auditService');
const { hashPassword, hashIp } = require('../utils/hashing');

const DEMO_PASSWORD = 'Demo!Passw0rd-2024';

const accounts = [
  { email: 'admin@example.com', role: 'admin' },
  { email: 'consultant@example.com', role: 'consultant' },
  { email: 'executive@example.com', role: 'executive' }, // empty draft: use this one to demo onboarding
  { email: 'executive2@example.com', role: 'executive' },
  { email: 'executive3@example.com', role: 'executive' },
  { email: 'executive4@example.com', role: 'executive' },
];

function sampleProfile(n, name, sectors) {
  return {
    currentStep: 7,
    professional: {
      fullName: name,
      contactEmail: `executive${n}@example.com`,
      phone: `+234 800 000 000${n}`,
      currentTitle: 'Chief Executive Officer',
      currentCompany: `Example Holdings ${n} Ltd`,
      yearsExperience: 15 + n,
      summary: 'Synthetic demo executive with a long record of leading fictional organisations through growth and regulatory change.',
    },
    experience: [
      { organisation: `Example Holdings ${n} Ltd`, title: 'Chief Executive Officer', startDate: '2018-01', endDate: null, isBoard: false, description: 'Fictional role for demo purposes.' },
      { organisation: 'Sample Bank Plc', title: 'Non-Executive Director', startDate: '2015-06', endDate: '2021-12', isBoard: true, description: 'Audit & risk committee member (fictional).' },
    ],
    sectors,
    specialisms: 'Risk governance, digital transformation',
    qualifications: [
      { kind: 'degree', institution: 'Example University', title: 'MBA', year: 2005 },
      { kind: 'certification', institution: 'Example Institute of Directors', title: 'Certified Director', year: 2016 },
    ],
    referees: [
      { name: 'Ref One Example', relationship: 'Former Chair', organisation: 'Sample Bank Plc', email: 'referee1@example.com', phone: '+234 800 111 0001' },
      { name: 'Ref Two Example', relationship: 'Board colleague', organisation: 'Example Holdings Ltd', email: 'referee2@example.com', phone: '+234 800 111 0002' },
    ],
    consents: ['vetting', 'sharing'].map((purpose) => ({ purpose, granted: true, version: env.consentVersion, timestamp: new Date(), ipHash: hashIp('127.0.0.1') })),
    submittedAt: new Date(Date.now() - n * 86400000),
  };
}

async function main() {
  if (env.isProd && process.env.SEED_FORCE !== 'true') {
    throw new Error('Refusing to wipe and seed a production database. Set SEED_FORCE=true if you really mean it.');
  }
  await connectDb();
  // The audit log is append-only through Mongoose; a fresh seed resets the chain via the raw driver on purpose.
  await Promise.all([User, ExecutiveProfile, Document, Notification, PushSubscription].map((m) => m.deleteMany({})));
  await AuditLog.collection.deleteMany({});

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const users = {};
  for (const a of accounts) {
    users[a.email] = await User.create({ ...a, passwordHash });
    await audit.record({ actor: { id: null, role: 'system' }, action: 'seed.user_created', targetType: 'User', targetId: users[a.email].id, metadata: { role: a.role } });
  }
  const consultant = users['consultant@example.com'];

  const samples = [
    { email: 'executive2@example.com', n: 2, name: 'Jane Executive', sectors: ['Financial Services', 'Technology'], path: [] },
    { email: 'executive3@example.com', n: 3, name: 'John Sample', sectors: ['Energy'], path: ['Under Review'] },
    { email: 'executive4@example.com', n: 4, name: 'Ada Placeholder', sectors: ['Healthcare', 'Public Sector'], path: ['Under Review', 'Verified'] },
  ];
  for (const s of samples) {
    const profile = await ExecutiveProfile.create({ userId: users[s.email].id, status: 'Submitted', ...sampleProfile(s.n, s.name, s.sectors) });
    await audit.record({ actor: { id: users[s.email].id, role: 'executive' }, action: 'profile.submitted', targetType: 'ExecutiveProfile', targetId: profile.id, metadata: { from: 'draft', seeded: true } });
    let from = 'Submitted';
    for (const to of s.path) {
      profile.vettingNotes.push({ authorId: consultant.id, authorRole: 'consultant', fromStatus: from, toStatus: to, note: `Seeded transition to ${to}.` });
      profile.status = to;
      await audit.record({ actor: consultant, action: 'vetting.status_changed', targetType: 'ExecutiveProfile', targetId: profile.id, metadata: { from, to, seeded: true } });
      await Notification.create({ userId: users[s.email].id, type: 'status_changed', message: `Your vetting status is now: ${to}` });
      from = to;
    }
    if (s.path.length) profile.assignedReviewerId = consultant.id;
    await profile.save();
  }

  console.log('\nSeeded synthetic demo data. All accounts use the password:', DEMO_PASSWORD);
  for (const a of accounts) console.log(`  ${a.role.padEnd(10)} ${a.email}`);
  console.log('\nNote: seeded submissions have no documents (they need Cloudinary); upload via the executive account.\n');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
