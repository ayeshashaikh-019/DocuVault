const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { getDatabase } = require('../database');
const { requireAuth, requireRole, requireCsrf, csrfToken } = require('../middleware/auth');
const { upload, removeUploadedFile } = require('../middleware/upload');
const {
  cleanText, normalizeEmail, isValidEmail, isValidRole, isValidDateOrEmpty,
  parseTags, safeOriginalName, isStrongPassword, ACTIONS
} = require('../utils/validation');
const { hasPermission, canViewDocument, canPerformDocumentAction } = require('../utils/permissions');
const { recordActivity } = require('../utils/audit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' }
});

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department || '',
    active: Boolean(user.active),
    created_at: user.created_at
  };
}

function getDocumentRow(db, id) {
  return db.prepare(`
    SELECT d.*, c.name AS category_name, u.name AS uploader_name,
      COALESCE((SELECT GROUP_CONCAT(t.name, ',') FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id), '') AS tag_list
    FROM documents d
    JOIN categories c ON c.id = d.category_id
    JOIN users u ON u.id = d.uploaded_by
    WHERE d.id = ? AND d.deleted_at IS NULL
  `).get(Number(id));
}

function formatDocument(document) {
  const today = new Date().toISOString().slice(0, 10);
  const status = document.status === 'archived'
    ? 'archived'
    : (document.expiry_date && document.expiry_date < today ? 'expired' : 'active');
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    category_id: document.category_id,
    category_name: document.category_name,
    original_name: document.original_name,
    mime_type: document.mime_type,
    size_bytes: document.size_bytes,
    uploaded_by: document.uploaded_by,
    uploader_name: document.uploader_name,
    visibility: document.visibility,
    issue_date: document.issue_date,
    expiry_date: document.expiry_date,
    status,
    created_at: document.created_at,
    updated_at: document.updated_at,
    archived_at: document.archived_at,
    tags: document.tag_list ? document.tag_list.split(',') : []
  };
}

function getTags(db, documentId) {
  return db.prepare(`
    SELECT t.name FROM tags t
    JOIN document_tags dt ON dt.tag_id = t.id
    WHERE dt.document_id = ? ORDER BY t.name
  `).all(documentId).map((row) => row.name);
}

function replaceTags(db, documentId, tags) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM document_tags WHERE document_id = ?').run(documentId);
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
    const link = db.prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)');
    for (const tag of tags) {
      insertTag.run(tag);
      const row = findTag.get(tag);
      link.run(documentId, row.id);
    }
  });
  tx();
}

function validDocumentFields(body) {
  const title = cleanText(body.title, 180);
  const description = cleanText(body.description, 3000);
  const categoryId = Number(body.category_id);
  const visibility = body.visibility || 'public';
  const issueDate = body.issue_date || null;
  const expiryDate = body.expiry_date || null;
  if (!title) return { error: 'A document title is required.' };
  if (!Number.isInteger(categoryId) || categoryId < 1) return { error: 'Select a valid category.' };
  if (!['public', 'restricted'].includes(visibility)) return { error: 'Choose public or restricted visibility.' };
  if (!isValidDateOrEmpty(issueDate) || !isValidDateOrEmpty(expiryDate)) return { error: 'Enter valid issue and expiry dates.' };
  if (issueDate && expiryDate && expiryDate < issueDate) return { error: 'Expiry date cannot be before the issue date.' };
  return { title, description, categoryId, visibility, issueDate, expiryDate, tags: parseTags(body.tags) };
}

function checkDocumentFileSignature(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(file.path, 'r');
  let bytesRead;
  try { bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0); }
  finally { fs.closeSync(fd); }
  const bytes = buffer.subarray(0, bytesRead);
  if (extension === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
  if (extension === '.png') return bytes.length >= 8 && bytes.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (['.docx', '.xlsx', '.pptx'].includes(extension)) return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (extension === '.txt') {
    const content = fs.readFileSync(file.path);
    return !content.includes(0);
  }
  return false;
}

function logDenied(req, document, action) {
  recordActivity(getDatabase(), {
    userId: req.user ? req.user.id : null,
    documentId: document ? document.id : null,
    action,
    result: 'denied',
    details: 'Permission check denied this document operation.',
    ip: req.ip
  });
}

router.get('/auth/csrf', (req, res) => {
  res.json({ csrfToken: csrfToken(req) });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const db = getDatabase();
  const categories = db.prepare('SELECT id FROM categories').all();
  const capabilities = Object.fromEntries(categories.map((category) => [
    String(category.id), Object.fromEntries(ACTIONS.map((action) => [action, hasPermission(db, req.user, category.id, action)]))
  ]));
  res.json({ user: publicUser(req.user), capabilities });
});

router.post('/auth/register', requireCsrf, loginLimiter, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100);
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (name.length < 2) return res.status(400).json({ error: 'Enter your full name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!isStrongPassword(password)) return res.status(400).json({ error: 'Use a password with at least 10 characters.' });
    const db = getDatabase();
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, department)
      VALUES (?, ?, ?, 'student', '')
    `).run(name, email, passwordHash);
    const userId = Number(result.lastInsertRowid);
    recordActivity(db, { userId, action: 'account_registered', details: 'New student account created.', ip: req.ip });
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = userId;
      req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
      const user = db.prepare('SELECT id, name, email, role, department, active, created_at FROM users WHERE id = ?').get(userId);
      return res.status(201).json({ user: publicUser(user), csrfToken: req.session.csrfToken });
    });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  }
});

router.post('/auth/login', requireCsrf, loginLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    if (!isValidEmail(email) || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    const passwordMatches = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !passwordMatches || user.active !== 1) {
      recordActivity(db, {
        userId: user ? user.id : null,
        action: 'login_failed',
        result: 'denied',
        details: 'Invalid credentials or inactive account.',
        ip: req.ip
      });
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.userId = user.id;
      req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
      recordActivity(db, { userId: user.id, action: 'login', details: 'User signed in.', ip: req.ip });
      return res.json({
        user: publicUser(user),
        csrfToken: req.session.csrfToken
      });
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/logout', requireAuth, requireCsrf, (req, res, next) => {
  recordActivity(getDatabase(), { userId: req.user.id, action: 'logout', details: 'User signed out.', ip: req.ip });
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('docuvault.sid');
    return res.json({ message: 'You have been signed out.' });
  });
});

router.get('/categories', requireAuth, (_req, res) => {
  const categories = getDatabase().prepare('SELECT id, name, description FROM categories ORDER BY name').all();
  res.json({ categories });
});

router.get('/dashboard/stats', requireAuth, (req, res) => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT d.*, c.name AS category_name, u.name AS uploader_name,
      COALESCE((SELECT GROUP_CONCAT(t.name, ',') FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id), '') AS tag_list
    FROM documents d
    JOIN categories c ON c.id = d.category_id
    JOIN users u ON u.id = d.uploaded_by
    WHERE d.deleted_at IS NULL
    ORDER BY d.created_at DESC
  `).all().filter((document) => canViewDocument(db, req.user, document));
  const docs = rows.map(formatDocument);
  const active = docs.filter((doc) => doc.status === 'active').length;
  const expired = docs.filter((doc) => doc.status === 'expired').length;
  const archived = docs.filter((doc) => doc.status === 'archived').length;
  const expiringSoon = docs.filter((doc) => doc.status === 'active' && doc.expiry_date && doc.expiry_date >= new Date().toISOString().slice(0, 10) && doc.expiry_date <= new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const categoryCounts = new Map();
  for (const doc of docs) categoryCounts.set(doc.category_name, (categoryCounts.get(doc.category_name) || 0) + 1);
  const recent = docs.filter((doc) => doc.status !== 'archived').slice(0, 5);
  res.json({
    stats: { total: docs.length, active, expired, archived, expiring: expiringSoon.length },
    recent,
    expiring: expiringSoon.slice(0, 5),
    categories: [...categoryCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5)
  });
});

router.get('/documents', requireAuth, (req, res) => {
  const db = getDatabase();
  const q = cleanText(req.query.q, 160).toLowerCase();
  const categoryId = req.query.category ? Number.parseInt(req.query.category, 10) : null;
  const statusFilter = ['active', 'expired', 'archived'].includes(req.query.status) ? req.query.status : '';
  const visibilityFilter = ['public', 'restricted'].includes(req.query.visibility) ? req.query.visibility : '';
  const rows = db.prepare(`
    SELECT d.*, c.name AS category_name, u.name AS uploader_name,
      COALESCE((SELECT GROUP_CONCAT(t.name, ',') FROM document_tags dt
        JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id = d.id), '') AS tag_list
    FROM documents d
    JOIN categories c ON c.id = d.category_id
    JOIN users u ON u.id = d.uploaded_by
    WHERE d.deleted_at IS NULL
    ORDER BY d.updated_at DESC, d.created_at DESC
  `).all();
  let documents = rows.filter((document) => canViewDocument(db, req.user, document)).map(formatDocument);
  if (q) documents = documents.filter((doc) => `${doc.title} ${doc.description} ${doc.category_name} ${doc.tags.join(' ')}`.toLowerCase().includes(q));
  if (Number.isInteger(categoryId) && categoryId > 0) documents = documents.filter((doc) => doc.category_id === categoryId);
  if (statusFilter) documents = documents.filter((doc) => doc.status === statusFilter);
  else documents = documents.filter((doc) => doc.status !== 'archived');
  if (visibilityFilter) documents = documents.filter((doc) => doc.visibility === visibilityFilter);
  res.json({ documents, total: documents.length });
});

router.post('/documents', requireAuth, requireCsrf, upload.single('file'), (req, res, next) => {
  const db = getDatabase();
  try {
    const fields = validDocumentFields(req.body);
    if (fields.error) {
      removeUploadedFile(req);
      return res.status(400).json({ error: fields.error });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });
    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(fields.categoryId);
    if (!category || !hasPermission(db, req.user, fields.categoryId, 'upload')) {
      removeUploadedFile(req);
      recordActivity(db, { userId: req.user.id, action: 'upload_denied', result: 'denied', details: 'User does not have upload permission for the selected category.', ip: req.ip });
      return res.status(403).json({ error: 'You do not have upload permission for this category.' });
    }
    if (!checkDocumentFileSignature(req.file)) {
      removeUploadedFile(req);
      return res.status(400).json({ error: 'The file content does not match its selected file type.' });
    }
    const originalName = safeOriginalName(req.file.originalname);
    const inserted = db.prepare(`
      INSERT INTO documents
        (title, description, category_id, file_name, original_name, mime_type, size_bytes,
         uploaded_by, visibility, issue_date, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fields.title, fields.description, fields.categoryId, path.basename(req.file.filename),
      originalName, req.file.mimetype, req.file.size, req.user.id,
      fields.visibility, fields.issueDate, fields.expiryDate
    );
    const documentId = Number(inserted.lastInsertRowid);
    replaceTags(db, documentId, fields.tags);
    recordActivity(db, { userId: req.user.id, documentId, action: 'document_uploaded', details: `Uploaded “${fields.title}”.`, ip: req.ip });
    return res.status(201).json({ document: formatDocument(getDocumentRow(db, documentId)) });
  } catch (error) {
    removeUploadedFile(req);
    return next(error);
  }
});

router.get('/documents/:id', requireAuth, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document || !canViewDocument(db, req.user, document)) {
    logDenied(req, document, 'document_view_denied');
    return res.status(document ? 403 : 404).json({ error: document ? 'You cannot view this restricted document.' : 'Document not found.' });
  }
  res.json({ document: { ...formatDocument(document), tags: getTags(db, document.id) } });
});

router.get('/documents/:id/file', requireAuth, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document || !canViewDocument(db, req.user, document)) {
    logDenied(req, document, 'document_file_access_denied');
    return res.status(document ? 403 : 404).json({ error: document ? 'You cannot access this restricted file.' : 'Document not found.' });
  }
  const filePath = path.join(config.uploadDir, path.basename(document.file_name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'The stored file could not be found.' });
  const safeName = safeOriginalName(document.original_name).replace(/[^a-zA-Z0-9._ -]/g, '_');
  const inlineAllowed = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg'].includes(document.mime_type);
  const asDownload = req.query.download === '1' || !inlineAllowed;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', document.mime_type);
  res.setHeader('Content-Disposition', `${asDownload ? 'attachment' : 'inline'}; filename="${safeName}"`);
  recordActivity(db, { userId: req.user.id, documentId: document.id, action: asDownload ? 'document_downloaded' : 'document_viewed', details: `Accessed “${document.title}”.`, ip: req.ip });
  return res.sendFile(filePath);
});

router.put('/documents/:id', requireAuth, requireCsrf, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  if (!canPerformDocumentAction(db, req.user, document, 'edit')) {
    logDenied(req, document, 'document_edit_denied');
    return res.status(403).json({ error: 'You do not have permission to edit this document.' });
  }
  const fields = validDocumentFields(req.body);
  if (fields.error) return res.status(400).json({ error: fields.error });
  if (!hasPermission(db, req.user, fields.categoryId, 'edit')) return res.status(403).json({ error: 'You do not have edit permission in the selected category.' });
  db.prepare(`
    UPDATE documents SET title = ?, description = ?, category_id = ?, visibility = ?,
      issue_date = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(fields.title, fields.description, fields.categoryId, fields.visibility, fields.issueDate, fields.expiryDate, document.id);
  replaceTags(db, document.id, fields.tags);
  recordActivity(db, { userId: req.user.id, documentId: document.id, action: 'document_updated', details: `Updated “${fields.title}”.`, ip: req.ip });
  return res.json({ document: formatDocument(getDocumentRow(db, document.id)) });
});

router.post('/documents/:id/archive', requireAuth, requireCsrf, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  if (!canPerformDocumentAction(db, req.user, document, 'archive')) {
    logDenied(req, document, 'document_archive_denied');
    return res.status(403).json({ error: 'You do not have permission to archive this document.' });
  }
  db.prepare("UPDATE documents SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(document.id);
  recordActivity(db, { userId: req.user.id, documentId: document.id, action: 'document_archived', details: `Archived “${document.title}”.`, ip: req.ip });
  return res.json({ message: 'Document moved to the archive.' });
});

router.post('/documents/:id/restore', requireAuth, requireCsrf, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  if (!canPerformDocumentAction(db, req.user, document, 'archive')) {
    logDenied(req, document, 'document_restore_denied');
    return res.status(403).json({ error: 'You do not have permission to restore this document.' });
  }
  db.prepare("UPDATE documents SET status = 'active', archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(document.id);
  recordActivity(db, { userId: req.user.id, documentId: document.id, action: 'document_restored', details: `Restored “${document.title}”.`, ip: req.ip });
  return res.json({ message: 'Document restored.' });
});

router.delete('/documents/:id', requireAuth, requireCsrf, (req, res) => {
  const db = getDatabase();
  const document = getDocumentRow(db, req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  if (!canPerformDocumentAction(db, req.user, document, 'delete')) {
    logDenied(req, document, 'document_delete_denied');
    return res.status(403).json({ error: 'You do not have permission to delete this document.' });
  }
  db.prepare('UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(document.id);
  recordActivity(db, { userId: req.user.id, documentId: document.id, action: 'document_deleted', details: `Soft-deleted “${document.title}”.`, ip: req.ip });
  return res.json({ message: 'Document removed from the active library.' });
});

router.get('/activity', requireAuth, (req, res) => {
  if (req.user.role === 'student') return res.status(403).json({ error: 'Activity history is not available for the student role.' });
  const db = getDatabase();
  if (req.user.role === 'staff') {
    const allowedCategories = db.prepare('SELECT id FROM categories').all()
      .filter((category) => hasPermission(db, req.user, category.id, 'view_activity'));
    if (!allowedCategories.length) return res.status(403).json({ error: 'Your role does not have permission to view activity history.' });
  }
  let rows = req.user.role === 'admin'
    ? db.prepare(`
        SELECT a.*, u.name AS user_name, u.email AS user_email, d.title AS document_title, d.category_id AS document_category_id
        FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN documents d ON d.id = a.document_id
        ORDER BY a.created_at DESC LIMIT 250
      `).all()
    : db.prepare(`
        SELECT a.*, u.name AS user_name, u.email AS user_email, d.title AS document_title, d.category_id AS document_category_id
        FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN documents d ON d.id = a.document_id
        WHERE a.user_id = ? OR d.uploaded_by = ?
        ORDER BY a.created_at DESC LIMIT 150
      `).all(req.user.id, req.user.id);
  if (req.user.role === 'staff') rows = rows.filter((row) => row.document_category_id === null || hasPermission(db, req.user, row.document_category_id, 'view_activity'));
  res.json({ activity: rows });
});

router.get('/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
  const users = getDatabase().prepare(`
    SELECT id, name, email, role, department, active, created_at
    FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, name
  `).all().map(publicUser);
  res.json({ users });
});

router.post('/admin/users', requireAuth, requireRole('admin'), requireCsrf, async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 100);
    const email = normalizeEmail(req.body.email);
    const role = req.body.role;
    const department = cleanText(req.body.department, 100);
    const password = req.body.password;
    if (name.length < 2) return res.status(400).json({ error: 'Enter the user’s name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!isValidRole(role)) return res.status(400).json({ error: 'Choose a valid user role.' });
    if (!isStrongPassword(password)) return res.status(400).json({ error: 'Use a temporary password with at least 10 characters.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, department)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email, passwordHash, role, department);
    const user = db.prepare('SELECT id, name, email, role, department, active, created_at FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
    recordActivity(db, { userId: req.user.id, action: 'user_created', details: `Created ${role} account for ${email}.`, ip: req.ip });
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE')) return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  }
});

router.patch('/admin/users/:id', requireAuth, requireRole('admin'), requireCsrf, async (req, res, next) => {
  try {
    const db = getDatabase();
    const userId = Number.parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const role = req.body.role === undefined ? target.role : req.body.role;
    if (req.body.active !== undefined && ![true, false, 0, 1].includes(req.body.active)) return res.status(400).json({ error: 'Invalid account status.' });
    const active = req.body.active === undefined ? target.active : (req.body.active ? 1 : 0);
    const name = req.body.name === undefined ? target.name : cleanText(req.body.name, 100);
    const department = req.body.department === undefined ? target.department : cleanText(req.body.department, 100);
    if (req.body.password && !isStrongPassword(req.body.password)) return res.status(400).json({ error: 'Password must contain at least 10 characters.' });
    if (!isValidRole(role)) return res.status(400).json({ error: 'Choose a valid role.' });
    if (name.length < 2) return res.status(400).json({ error: 'Name must contain at least 2 characters.' });
    if (Number(target.id) === Number(req.user.id) && (role !== 'admin' || active !== 1)) {
      return res.status(400).json({ error: 'You cannot deactivate or remove your own administrator access.' });
    }
    if (target.role === 'admin' && (role !== 'admin' || active !== 1)) {
      const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").get().count;
      if (admins <= 1) return res.status(400).json({ error: 'The system must keep at least one active administrator.' });
    }
    db.prepare('UPDATE users SET name = ?, role = ?, department = ?, active = ? WHERE id = ?').run(name, role, department, active, userId);
    if (req.body.password) {
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
    }
    const updated = db.prepare('SELECT id, name, email, role, department, active, created_at FROM users WHERE id = ?').get(userId);
    recordActivity(db, { userId: req.user.id, action: 'user_updated', details: `Updated account ${target.email}.`, ip: req.ip });
    return res.json({ user: publicUser(updated) });
  } catch (error) {
    return next(error);
  }
});

router.get('/admin/permissions', requireAuth, requireRole('admin'), (_req, res) => {
  const db = getDatabase();
  const categories = db.prepare('SELECT id, name FROM categories ORDER BY name').all();
  const permissions = db.prepare('SELECT role, category_id, action, allowed FROM permissions ORDER BY role, category_id, action').all();
  res.json({ categories, actions: ACTIONS, permissions });
});

router.put('/admin/permissions', requireAuth, requireRole('admin'), requireCsrf, (req, res) => {
  const db = getDatabase();
  const entries = req.body.permissions;
  if (!Array.isArray(entries) || entries.length > 300) return res.status(400).json({ error: 'Invalid permission update.' });
  const update = db.prepare(`
    INSERT INTO permissions (role, category_id, action, allowed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(role, category_id, action) DO UPDATE SET allowed = excluded.allowed
  `);
  const tx = db.transaction(() => {
    for (const item of entries) {
      if (!['staff', 'student'].includes(item.role) || !ACTIONS.includes(item.action)) throw new Error('Invalid role or permission action.');
      const categoryId = Number(item.category_id);
      if (![true, false, 0, 1].includes(item.allowed)) throw new Error('Invalid permission value.');
      if (!Number.isInteger(categoryId) || !db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)) throw new Error('Invalid category in permission update.');
      update.run(item.role, categoryId, item.action, item.allowed ? 1 : 0);
    }
  });
  try { tx(); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  recordActivity(db, { userId: req.user.id, action: 'permissions_updated', details: 'Updated role/category permission settings.', ip: req.ip });
  return res.json({ message: 'Permissions saved.' });
});

router.post('/admin/categories', requireAuth, requireRole('admin'), requireCsrf, (req, res) => {
  const name = cleanText(req.body.name, 80);
  const description = cleanText(req.body.description, 240);
  if (name.length < 2) return res.status(400).json({ error: 'Category name must contain at least 2 characters.' });
  const db = getDatabase();
  try {
    const result = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)').run(name, description);
    const categoryId = Number(result.lastInsertRowid);
    const insert = db.prepare('INSERT INTO permissions (role, category_id, action, allowed) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const role of ['admin', 'staff', 'student']) {
        for (const action of ACTIONS) insert.run(role, categoryId, action, role === 'admin' || (role === 'staff' && ['view', 'view_restricted', 'upload', 'edit', 'view_activity'].includes(action)) || (role === 'student' && action === 'view') ? 1 : 0);
      }
    });
    tx();
    recordActivity(db, { userId: req.user.id, action: 'category_created', details: `Created category “${name}”.`, ip: req.ip });
    return res.status(201).json({ category: { id: categoryId, name, description } });
  } catch (error) {
    if (String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE')) return res.status(409).json({ error: 'A category with this name already exists.' });
    return res.status(500).json({ error: 'Could not create the category.' });
  }
});

module.exports = router;
