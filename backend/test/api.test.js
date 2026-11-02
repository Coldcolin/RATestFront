const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongo, app, request, mongoose, User, AuditLog, storageService, hashPassword;
const stored = []; // what the fake storage received

const H = { 'X-Requested-With': 'XMLHttpRequest' };
const PDF = Buffer.from('%PDF-1.4\n% synthetic test file\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const STRONG = 'Correct-Horse-Battery-9';

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
  request = require('supertest');
  mongoose = require('mongoose');
  app = require('../src/server');
  User = require('../src/models/User');
  AuditLog = require('../src/models/AuditLog');
  ({ hashPassword } = require('../src/utils/hashing'));
  // Replace Cloudinary with an in-memory fake; the controllers call through the module object.
  storageService = require('../src/services/storageService');
  storageService.upload = async (buf, { resourceType, extension }) => {
    stored.push(buf);
    return { publicId: `fake/${stored.length}.${extension}`, resourceType, format: extension };
  };
  storageService.signedUrl = () => ({ url: 'https://example.invalid/signed', expiresAt: new Date().toISOString() });
  storageService.remove = async () => {};
  await require('../src/config/db').connectDb(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function agentFor(email, role) {
  if (role) await User.create({ email, role, passwordHash: await hashPassword(STRONG) });
  else await request(app).post('/api/auth/register').set(H).send({ email, password: STRONG }).expect(201);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').set(H).send({ email, password: STRONG }).expect(200);
  return agent;
}

const steps = {
  1: { fullName: 'Test Executive', contactEmail: 'te@example.com', phone: '+234 800 000 0000', currentTitle: 'CEO', currentCompany: 'Example Ltd', yearsExperience: 20, summary: 'Synthetic summary of at least twenty characters.' },
  2: { experience: [{ organisation: 'Example Ltd', title: 'CEO', startDate: '2019-01', endDate: null, isBoard: false }] },
  3: { sectors: ['Energy'], specialisms: '' },
  4: { qualifications: [{ kind: 'degree', institution: 'Example University', title: 'BSc', year: 2000 }] },
  5: {
    referees: [
      { name: 'Ref One', relationship: 'Chair', organisation: 'Example', email: 'r1@example.com', phone: '+234 800 000 0001' },
      { name: 'Ref Two', relationship: 'Peer', organisation: 'Example', email: 'r2@example.com', phone: '+234 800 000 0002' },
    ],
  },
};

async function completeOnboarding(agent) {
  for (const [step, data] of Object.entries(steps)) await agent.put(`/api/profile/me/step/${step}`).set(H).send({ data }).expect(200);
  for (const type of ['cv', 'id']) {
    await agent.post('/api/documents').set(H).field('type', type).attach('file', PDF, { filename: `${type}.pdf`, contentType: 'application/pdf' }).expect(201);
  }
  await agent.put('/api/profile/me/step/6').set(H).send({ data: {} }).expect(200);
  await agent.put('/api/profile/me/step/7').set(H).send({ data: { consents: { vetting: true, sharing: false } } }).expect(200);
  return (await agent.post('/api/profile/me/submit').set(H).expect(200)).body.profile;
}

describe('auth', () => {
  test('rejects weak and common passwords, never returns the hash', async () => {
    await request(app).post('/api/auth/register').set(H).send({ email: 'weak@example.com', password: 'short' }).expect(400);
    await request(app).post('/api/auth/register').set(H).send({ email: 'weak@example.com', password: 'password1234' }).expect(400);
    const res = await request(app).post('/api/auth/register').set(H).send({ email: 'ok@example.com', password: STRONG }).expect(201);
    assert.equal(res.body.user.role, 'executive');
    assert.ok(!JSON.stringify(res.body).includes('passwordHash'));
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
  });

  test('login failure is generic and audited', async () => {
    const res = await request(app).post('/api/auth/login').set(H).send({ email: 'ok@example.com', password: 'wrong-password-123' }).expect(401);
    assert.equal(res.body.error.message, 'Invalid email or password');
    assert.ok(await AuditLog.exists({ action: 'auth.login_failed' }));
  });

  test('state-changing requests without the anti-CSRF header are refused', async () => {
    await request(app).post('/api/auth/login').send({ email: 'ok@example.com', password: STRONG }).expect(403);
  });
});

describe('RBAC', () => {
  test('roles are enforced server-side', async () => {
    const exec = await agentFor('rbac-exec@example.com');
    const consultant = await agentFor('rbac-consultant@example.com', 'consultant');
    await request(app).get('/api/review/queue').expect(401);
    await exec.get('/api/review/queue').expect(403);
    await exec.get('/api/audit').expect(403);
    await consultant.get('/api/admin/users').expect(403);
    await consultant.get('/api/audit/verify').expect(403);
    await consultant.get('/api/profile/me').expect(403);
    await consultant.get('/api/review/queue').expect(200);
  });

  test('an executive cannot download another executive\'s document (403, no existence leak)', async () => {
    const a = await agentFor('owner-a@example.com');
    const b = await agentFor('owner-b@example.com');
    const up = await a.post('/api/documents').set(H).field('type', 'cv').attach('file', PDF, { filename: 'cv.pdf', contentType: 'application/pdf' }).expect(201);
    await a.get(`/api/documents/${up.body.document.id}/file`).expect(200);
    await b.get(`/api/documents/${up.body.document.id}/file`).expect(403);
    await b.get(`/api/documents/${new mongoose.Types.ObjectId()}/file`).expect(403);
  });

  test('self-registration cannot pick a role', async () => {
    await request(app).post('/api/auth/register').set(H).send({ email: 'sneaky@example.com', password: STRONG, role: 'admin' }).expect(400);
  });
});

describe('uploads', () => {
  test('rejects disallowed types, spoofed content and oversized files without storing them', async () => {
    const exec = await agentFor('upload@example.com');
    const before = stored.length;
    await exec.post('/api/documents').set(H).field('type', 'cv').attach('file', Buffer.from('MZ'), { filename: 'evil.exe', contentType: 'application/octet-stream' }).expect(415);
    await exec.post('/api/documents').set(H).field('type', 'cv').attach('file', PNG, { filename: 'fake.pdf', contentType: 'application/pdf' }).expect(415);
    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    await exec.post('/api/documents').set(H).field('type', 'cv').attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' }).expect(413);
    assert.equal(stored.length, before);
  });
});

describe('onboarding + vetting workflow', () => {
  test('save & resume, idempotent replay, submit, transitions, notifications', async () => {
    const exec = await agentFor('flow@example.com');
    const consultant = await agentFor('flow-consultant@example.com', 'consultant');

    // Idempotent replay of the same queued save is a no-op.
    const put = () => exec.put('/api/profile/me/step/1').set({ ...H, 'Idempotency-Key': 'k-1' }).send({ data: steps[1] });
    await put().expect(200);
    assert.equal((await put().expect(200)).body.replayed, true);
    // An older offline save never overwrites newer server data.
    const stale = await exec.put('/api/profile/me/step/1').set({ ...H, 'Idempotency-Key': 'k-0' })
      .send({ data: { ...steps[1], fullName: 'Old Name' }, clientSavedAt: '2000-01-01T00:00:00.000Z' }).expect(200);
    assert.equal(stale.body.stale, true);
    assert.equal(stale.body.profile.professional.fullName, 'Test Executive');
    assert.equal((await exec.get('/api/profile/me')).body.profile.currentStep, 2);

    // Submitting without consent fails.
    await exec.put('/api/profile/me/step/7').set(H).send({ data: { consents: { vetting: false, sharing: false } } }).expect(200);
    await exec.post('/api/profile/me/submit').set(H).expect(400);

    const profile = await completeOnboarding(exec);
    assert.equal(profile.status, 'Submitted');
    await exec.put('/api/profile/me/step/1').set(H).send({ data: steps[1] }).expect(409); // locked once submitted

    const status = (s, note) => consultant.post(`/api/review/${profile.id}/status`).set(H).send({ status: s, note });
    await status('Verified').expect(409); // illegal jump
    await status('Under Review').expect(200);
    await status('More Information Required').expect(400); // note mandatory
    await status('More Information Required', 'Please upload a certified ID').expect(200);

    const notes = (await exec.get('/api/notifications')).body.items;
    assert.ok(notes.some((n) => n.message.includes('certified ID')));

    // MIR re-opens editing; resubmission goes back to Submitted.
    await exec.put('/api/profile/me/step/1').set(H).send({ data: steps[1] }).expect(200);
    await exec.post('/api/profile/me/submit').set(H).expect(200);
    await status('Under Review').expect(200);
    await status('Verified', 'All checks passed').expect(200);

    const list = (await consultant.get('/api/review/queue?status=Verified')).body.items;
    const row = list.find((r) => r.id === profile.id);
    assert.equal(row.name, 'T*** E****'); // masked in list view
    const detail = (await consultant.get(`/api/review/${profile.id}`)).body.profile;
    assert.equal(detail.professional.fullName, 'Test Executive');
    assert.equal(detail.vettingNotes.length, 4);
  });

  test('export and erasure (NDPA)', async () => {
    const exec = await agentFor('erase@example.com');
    await completeOnboarding(exec);
    const exp = await exec.get('/api/profile/me/export').expect(200);
    assert.equal(exp.body.account.email, 'erase@example.com');
    assert.equal(exp.body.documents.length, 2);

    await exec.post('/api/profile/me/delete-request').set(H).send({ password: 'wrong' }).expect(401);
    const res = await exec.post('/api/profile/me/delete-request').set(H).send({ password: STRONG }).expect(200);
    assert.equal(res.body.documentsPurged, 2);
    assert.equal(await User.exists({ email: 'erase@example.com' }), null);
    await request(app).post('/api/auth/login').set(H).send({ email: 'erase@example.com', password: STRONG }).expect(401);
  });
});

describe('audit chain', () => {
  test('verifies intact, is append-only via the API layer, and detects tampering', async () => {
    const admin = await agentFor('audit-admin@example.com', 'admin');
    const ok = (await admin.get('/api/audit/verify').expect(200)).body;
    assert.equal(ok.intact, true);
    assert.ok(ok.checked > 10);

    await assert.rejects(AuditLog.updateOne({ seq: 3 }, { action: 'edited' }), /append-only/);
    await assert.rejects(AuditLog.deleteOne({ seq: 3 }), /append-only/);

    // Simulate someone with direct DB access editing an entry.
    await AuditLog.collection.updateOne({ seq: 3 }, { $set: { action: 'tampered' } });
    const broken = (await admin.get('/api/audit/verify').expect(200)).body;
    assert.equal(broken.intact, false);
    assert.equal(broken.firstBrokenSeq, 3);
  });
});
