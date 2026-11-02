const path = require('path');
const multer = require('multer');
const { AppError } = require('../utils/errors');

const MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (sig) => (buf) => buf.length >= sig.length && buf.subarray(0, sig.length).equals(Buffer.from(sig));

// Extension, declared MIME type and the file's magic bytes must all agree.
const ALLOWED = {
  pdf: { mimes: ['application/pdf'], magic: startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]), resourceType: 'raw' },
  png: { mimes: ['image/png'], magic: startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), resourceType: 'image' },
  jpg: { mimes: ['image/jpeg'], magic: startsWith([0xff, 0xd8, 0xff]), resourceType: 'image' },
  jpeg: { mimes: ['image/jpeg'], magic: startsWith([0xff, 0xd8, 0xff]), resourceType: 'image' },
  docx: {
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    magic: startsWith([0x50, 0x4b, 0x03, 0x04]),
    resourceType: 'raw',
  },
};

const extensionOf = (name) => path.extname(name || '').slice(1).toLowerCase();

const rejectType = () => new AppError(415, 'UNSUPPORTED_FILE', 'Only PDF, PNG, JPG or DOCX files are accepted');

// Memory storage: the file is validated in RAM and never touches local disk.
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 5 },
  fileFilter(req, file, cb) {
    const rule = ALLOWED[extensionOf(file.originalname)];
    if (!rule || !rule.mimes.includes(file.mimetype)) return cb(rejectType());
    cb(null, true);
  },
}).single('file');

/** Runs after multer: checks content (not just the client's claims) and sanitises the name. */
function validateUpload(req, res, next) {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Attach a file in the "file" field');
  const extension = extensionOf(req.file.originalname);
  const rule = ALLOWED[extension];
  if (!rule.magic(req.file.buffer)) throw rejectType();
  req.fileMeta = {
    extension: extension === 'jpeg' ? 'jpg' : extension,
    resourceType: rule.resourceType,
    originalName: path.basename(req.file.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 100),
  };
  next();
}

module.exports = { uploadSingle: [multerUpload, validateUpload], MAX_BYTES };
