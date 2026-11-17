const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { ACTIONS, ROLES } = require('./utils/validation');
const { permissionDefaults } = require('./utils/permissions');

let db;

const DEFAULT_CATEGORIES = [
  ['Academic Records', 'Academic calendars, schedules, and institutional academic records.'],
  ['Department Notices', 'Department announcements, circulars, and event notices.'],
  ['University Policies', 'Approved university rules, policies, and procedures.'],
  ['Examination Documents', 'Examination schedules, instructions, and related documents.'],
  ['Administrative Records', 'Administrative documents and internal office records.'],
  ['Student Forms', 'Forms and templates intended for student use.']
];

function isoDateOffset(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createSchema(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
      department TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category_id INTEGER NOT NULL REFERENCES categories(id),
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'restricted')),
      issue_date TEXT,
      expiry_date TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE IF NOT EXISTS document_tags (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (document_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'student')),
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0, 1)),
      UNIQUE (role, category_id, action)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT 'success',
      details TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);
    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
  `);
}

function seedPermissions(database) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO permissions (role, category_id, action, allowed)
    VALUES (?, ?, ?, ?)
  `);
  const categories = database.prepare('SELECT id FROM categories').all();
  const transaction = database.transaction(() => {
    for (const category of categories) {
      for (const role of ROLES) {
        for (const action of ACTIONS) {
          insert.run(role, category.id, action, permissionDefaults(role, action) ? 1 : 0);
        }
      }
    }
  });
  transaction();
}

function insertTags(database, documentId, names) {
  const insertTag = database.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
  const findTag = database.prepare('SELECT id FROM tags WHERE name = ?');
  const linkTag = database.prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)');
  for (const name of names) {
    insertTag.run(name);
    const tag = findTag.get(name);
    linkTag.run(documentId, tag.id);
  }
}

async function seedDemoData(database) {
  const demoUsers = [
    { name: 'Olivia Admin', email: 'admin@docuvault.local', password: 'Admin@12345', role: 'admin', department: 'IT Administration' },
    { name: 'Daniel Staff', email: 'staff@docuvault.local', password: 'Staff@12345', role: 'staff', department: 'Computer Science' },
    { name: 'Sara Student', email: 'student@docuvault.local', password: 'Student@12345', role: 'student', department: 'Computer Science' }
  ];

  const findUser = database.prepare('SELECT id FROM users WHERE email = ?');
  const addUser = database.prepare(`
    INSERT OR IGNORE INTO users (name, email, password_hash, role, department)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const demoUser of demoUsers) {
    const passwordHash = await bcrypt.hash(demoUser.password, 12);
    addUser.run(demoUser.name, demoUser.email, passwordHash, demoUser.role, demoUser.department);
  }

  const countDocuments = database.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
  if (countDocuments > 0) return;

  const seedDir = path.join(config.rootDir, 'database', 'seed-files');
  fs.mkdirSync(seedDir, { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const samples = [
    {
      file: 'academic-calendar.txt',
      title: 'Academic Calendar — Fall 2026',
      description: 'A sample calendar record with semester dates and key academic milestones.',
      category: 'Academic Records', visibility: 'public', issue: -14, expiry: 55,
      tags: ['calendar', 'semester', 'academic']
    },
    {
      file: 'department-seminar.txt',
      title: 'Department Research Seminar Notice',
      description: 'A sample public notice for a departmental research seminar.',
      category: 'Department Notices', visibility: 'public', issue: -3, expiry: 9,
      tags: ['seminar', 'notice', 'research']
    },
    {
      file: 'exam-guidelines.txt',
      title: 'Internal Examination Moderation Guidelines',
      description: 'A restricted sample document for department staff and administrators.',
      category: 'Examination Documents', visibility: 'restricted', issue: -21, expiry: 40,
      tags: ['examination', 'guidelines', 'internal']
    },
    {
      file: 'exam-schedule.txt',
      title: 'Midterm Examination Schedule — Review Required',
      description: 'A sample examination schedule whose expiry date has passed and should be reviewed.',
      category: 'Examination Documents', visibility: 'public', issue: -24, expiry: -4,
      tags: ['midterm', 'schedule', 'review']
    },
    {
      file: 'student-form.txt',
      title: 'Student Leave Application Form',
      description: 'A sample form description. Replace this demo file with your institution’s approved form.',
      category: 'Student Forms', visibility: 'public', issue: -30, expiry: null,
      tags: ['student', 'form', 'leave']
    },
    {
      file: 'retention-schedule.txt',
      title: 'Records Retention Schedule — Archived',
      description: 'A sample archived record retained for demonstration of the document lifecycle.',
      category: 'Administrative Records', visibility: 'restricted', issue: -150, expiry: -7,
      tags: ['retention', 'archive', 'administration'], status: 'archived'
    }
  ];

  const categories = new Map(database.prepare('SELECT id, name FROM categories').all().map((row) => [row.name, row.id]));
  const staffId = findUser.get('staff@docuvault.local').id;
  const insertDocument = database.prepare(`
    INSERT INTO documents
      (title, description, category_id, file_name, original_name, mime_type, size_bytes,
       uploaded_by, visibility, issue_date, expiry_date, status, archived_at)
    VALUES (?, ?, ?, ?, ?, 'text/plain', ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sample of samples) {
    const seedPath = path.join(seedDir, sample.file);
    if (!fs.existsSync(seedPath)) {
      fs.writeFileSync(seedPath,
        `${sample.title}\n\nThis is demonstration content for the DocuVault student project.\n` +
        'It is safe to replace this file with an institution-approved document during testing.\n',
        'utf8'
      );
    }
    const storedName = `demo-${sample.file}`;
    const storedPath = path.join(config.uploadDir, storedName);
    if (!fs.existsSync(storedPath)) fs.copyFileSync(seedPath, storedPath);
    const stats = fs.statSync(storedPath);
    const status = sample.status || 'active';
    const result = insertDocument.run(
      sample.title, sample.description, categories.get(sample.category), storedName,
      sample.file, stats.size, staffId, sample.visibility,
      isoDateOffset(sample.issue), sample.expiry === null ? null : isoDateOffset(sample.expiry),
      status, status === 'archived' ? new Date().toISOString() : null
    );
    insertTags(database, Number(result.lastInsertRowid), sample.tags);
  }

  const addLog = database.prepare(`
    INSERT INTO activity_logs (user_id, document_id, action, result, details)
    VALUES (?, ?, ?, 'success', ?)
  `);
  addLog.run(findUser.get('admin@docuvault.local').id, null, 'demo_seeded', 'Demo workspace was initialized.');
}

async function initializeDatabase() {
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  db = new Database(config.databasePath);
  createSchema(db);

  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
  const categoryTransaction = db.transaction(() => {
    for (const [name, description] of DEFAULT_CATEGORIES) insertCategory.run(name, description);
  });
  categoryTransaction();
  seedPermissions(db);
  await seedDemoData(db);
  return db;
}

function getDatabase() {
  if (!db) throw new Error('Database has not been initialized.');
  return db;
}

module.exports = { initializeDatabase, getDatabase, DEFAULT_CATEGORIES };
