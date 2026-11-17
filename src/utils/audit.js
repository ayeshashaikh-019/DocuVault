function recordActivity(db, { userId = null, documentId = null, action, result = 'success', details = '', ip = '' }) {
  db.prepare(`
    INSERT INTO activity_logs (user_id, document_id, action, result, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, documentId, action, result, String(details).slice(0, 1000), String(ip).slice(0, 64));
}

module.exports = { recordActivity };
