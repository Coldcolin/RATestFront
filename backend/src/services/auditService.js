const AuditLog = require('../models/AuditLog');
const { sha256, canonicalJSON } = require('../utils/hashing');

const GENESIS_HASH = '0'.repeat(64);

function computeHash(e) {
  const body = {
    seq: e.seq,
    actorId: e.actorId,
    actorRole: e.actorRole,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata,
    timestamp: new Date(e.timestamp).toISOString(),
  };
  return sha256(e.prevHash + canonicalJSON(body));
}

async function append({ actor, action, targetType, targetId, metadata }) {
  // The unique seq index turns a concurrent append (another instance) into a duplicate-key error; we retry on the new head.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const head = await AuditLog.findOne().sort({ seq: -1 }).select('seq hash').lean();
    const entry = {
      seq: head ? head.seq + 1 : 1,
      actorId: actor?.id ? String(actor.id) : null,
      actorRole: actor?.role || 'anonymous',
      action,
      targetType: targetType || null,
      targetId: targetId ? String(targetId) : null,
      metadata: JSON.parse(JSON.stringify(metadata || {})), // normalise (ObjectIds, Dates) so it hashes identically after a round trip
      timestamp: new Date(),
      prevHash: head ? head.hash : GENESIS_HASH,
    };
    entry.hash = computeHash(entry);
    try {
      return await AuditLog.create(entry);
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new Error('Could not append audit entry after retries');
}

// Serialise appends within this process so entries never race for the same seq.
let queue = Promise.resolve();

/** The only way to write to the audit log. Callers must await it; a failed audit write fails the request. */
function record(entry) {
  const result = queue.then(() => append(entry));
  queue = result.catch(() => {});
  return result;
}

/** Walks the whole chain and reports the first entry whose link or content no longer matches. */
async function verify() {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  let checked = 0;
  for await (const e of AuditLog.find().sort({ seq: 1 }).lean().cursor()) {
    let reason = null;
    if (e.seq !== expectedSeq) reason = `Missing entry before seq ${e.seq}`;
    else if (e.prevHash !== prevHash) reason = 'prevHash does not match previous entry';
    else if (computeHash(e) !== e.hash) reason = 'Entry content does not match its hash';
    if (reason) return { intact: false, checked, firstBrokenSeq: e.seq, reason };
    prevHash = e.hash;
    expectedSeq += 1;
    checked += 1;
  }
  return { intact: true, checked, headHash: prevHash, verifiedAt: new Date().toISOString() };
}

module.exports = { record, verify, computeHash, GENESIS_HASH };
