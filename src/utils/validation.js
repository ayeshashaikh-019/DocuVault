const path = require('node:path');

const ROLES = Object.freeze(['admin', 'staff', 'student']);
const ACTIONS = Object.freeze(['view', 'view_restricted', 'upload', 'edit', 'archive', 'delete', 'view_activity']);
const ALLOWED_FILES = Object.freeze({
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg']
});

function cleanText(value, maxLength = 5000) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isValidRole(role) {
  return ROLES.includes(role);
}

function isValidDateOrEmpty(value) {
  if (value === '' || value === null || value === undefined) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseTags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map((tag) => cleanText(String(tag), 40).toLowerCase()).filter(Boolean))].slice(0, 12);
}

function safeOriginalName(name) {
  const base = path.basename(String(name || 'document')).replace(/[\r\n"\\]/g, '_');
  return cleanText(base, 180) || 'document';
}

function fileTypeAllowed(file) {
  if (!file) return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedMimes = ALLOWED_FILES[ext];
  return Boolean(allowedMimes && allowedMimes.includes(file.mimetype));
}

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 10 && password.length <= 72 && Buffer.byteLength(password, 'utf8') <= 72;
}

module.exports = {
  ROLES,
  ACTIONS,
  ALLOWED_FILES,
  cleanText,
  normalizeEmail,
  isValidEmail,
  isValidRole,
  isValidDateOrEmpty,
  parseTags,
  safeOriginalName,
  fileTypeAllowed,
  isStrongPassword
};
