// The only module that knows about Cloudinary. Swapping to S3/GCS means reimplementing these three functions.
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const env = require('../config/env');
const { AppError } = require('../utils/errors');

const { cloudName, apiKey, apiSecret } = env.cloudinary;
const configured = Boolean(cloudName && apiKey && apiSecret);
if (configured) cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

const SIGNED_URL_TTL_SECONDS = 300;

function ensureConfigured() {
  if (!configured) throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Document storage is not configured');
}

/** Uploads as type "authenticated": Cloudinary refuses unsigned delivery, so there is no public URL. */
function upload(buffer, { resourceType, extension }) {
  ensureConfigured();
  // Random, unguessable id. Raw files keep the extension in the id so downloads open in the right app.
  const id = crypto.randomUUID();
  const publicId = resourceType === 'raw' ? `${id}.${extension}` : id;
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { resource_type: resourceType, type: 'authenticated', public_id: publicId, folder: 'executive-portal', overwrite: false },
        (err, result) => {
          if (err) return reject(new AppError(502, 'STORAGE_ERROR', 'Could not store the document'));
          resolve({ publicId: result.public_id, resourceType: result.resource_type, format: result.format });
        },
      )
      .end(buffer);
  });
}

/** Short-lived signed download URL. Only called after the route has re-checked role/ownership. */
function signedUrl({ publicId, resourceType, format }) {
  ensureConfigured();
  const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(publicId, resourceType === 'raw' ? '' : format, {
    resource_type: resourceType,
    type: 'authenticated',
    expires_at: expiresAt,
    attachment: true,
  });
  return { url, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

async function remove({ publicId, resourceType }) {
  ensureConfigured();
  const res = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
  if (res.result !== 'ok' && res.result !== 'not found') throw new Error(`Cloudinary destroy failed: ${res.result}`);
}

module.exports = { upload, signedUrl, remove, SIGNED_URL_TTL_SECONDS };
