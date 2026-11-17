const multer = require('multer');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../config');
const { fileTypeAllowed } = require('../utils/validation');

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, _file, callback) => {
    const ext = path.extname(_file.originalname || '').toLowerCase();
    callback(null, `${crypto.randomBytes(18).toString('hex')}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20, parts: 24, fieldNameSize: 100 },
  fileFilter: (_req, file, callback) => {
    if (!fileTypeAllowed(file)) {
      const error = new Error('Unsupported file type. Allowed: PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG, JPEG.');
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  }
});

function removeUploadedFile(req) {
  if (req.file && req.file.path) {
    try { fs.unlinkSync(req.file.path); } catch (_error) { /* File may already have been removed. */ }
  }
}

module.exports = { upload, removeUploadedFile };
