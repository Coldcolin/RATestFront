const Document = require('../models/Document');
const audit = require('../services/auditService');
const storageService = require('../services/storageService');
const { AppError } = require('../utils/errors');
const { schemas, parse } = require('../utils/validators');
const { sha256 } = require('../utils/hashing');
const { getOrCreateProfile, assertEditable } = require('./profileController');

const MAX_DOCUMENTS_PER_PROFILE = 10;

async function upload(req, res) {
  const { type } = parse(schemas.documentUpload, req.body);
  const profile = await getOrCreateProfile(req.user.id);
  assertEditable(profile);
  if ((await Document.countDocuments({ profileId: profile.id })) >= MAX_DOCUMENTS_PER_PROFILE) {
    throw new AppError(409, 'TOO_MANY_DOCUMENTS', `A profile can hold at most ${MAX_DOCUMENTS_PER_PROFILE} documents`);
  }

  const hash = sha256(req.file.buffer);
  const stored = await storageService.upload(req.file.buffer, { resourceType: req.fileMeta.resourceType, extension: req.fileMeta.extension });
  const doc = await Document.create({
    profileId: profile.id,
    ownerId: req.user.id,
    type,
    cloudinaryPublicId: stored.publicId,
    resourceType: stored.resourceType,
    format: stored.format || req.fileMeta.extension,
    originalName: req.fileMeta.originalName,
    mimeType: req.file.mimetype,
    size: req.file.size,
    sha256: hash,
  });
  await audit.record({
    actor: req.user,
    action: 'document.uploaded',
    targetType: 'Document',
    targetId: doc.id,
    metadata: { type, sha256: hash, size: doc.size, mimeType: doc.mimeType },
  });
  res.status(201).json({ document: doc.toPublicJSON() });
}

/**
 * Executives may only reach their own documents. For them, "not found" and "not yours" both return
 * 403 so the response does not reveal whether another person's document id exists.
 */
async function loadAuthorised(req) {
  const doc = await Document.findById(req.params.id);
  if (req.user.role === 'executive') {
    if (!doc || String(doc.ownerId) !== req.user.id) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this document');
  } else if (!doc) {
    throw new AppError(404, 'NOT_FOUND', 'Document not found');
  }
  return doc;
}

async function download(req, res) {
  const doc = await loadAuthorised(req);
  const { url, expiresAt } = storageService.signedUrl({ publicId: doc.cloudinaryPublicId, resourceType: doc.resourceType, format: doc.format });
  await audit.record({ actor: req.user, action: 'document.downloaded', targetType: 'Document', targetId: doc.id, metadata: { type: doc.type } });
  res.json({ url, expiresAt, sha256: doc.sha256, originalName: doc.originalName });
}

async function remove(req, res) {
  if (req.user.role !== 'executive') throw new AppError(403, 'FORBIDDEN', 'Only the owner can delete a document');
  const doc = await loadAuthorised(req);
  const profile = await getOrCreateProfile(req.user.id);
  assertEditable(profile);
  await storageService.remove({ publicId: doc.cloudinaryPublicId, resourceType: doc.resourceType });
  await doc.deleteOne();
  await audit.record({ actor: req.user, action: 'document.deleted', targetType: 'Document', targetId: doc.id, metadata: { type: doc.type } });
  res.status(204).end();
}

module.exports = { upload, download, remove };
