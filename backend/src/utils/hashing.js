const crypto = require('crypto');
const bcrypt = require('bcrypt');
const env = require('../config/env');

const BCRYPT_COST = 12;

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

// Deterministic JSON: object keys sorted recursively, so the same entry always hashes the same.
function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
}

// IPs are personal data under NDPA; we only keep a salted hash as consent evidence.
const hashIp = (ip) => sha256(`${env.ipHashSalt}:${ip || 'unknown'}`);

const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);
const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);

module.exports = { sha256, canonicalJSON, hashIp, hashPassword, verifyPassword, BCRYPT_COST };
