const crypto = require('node:crypto');
const { getDatabase } = require('../database');
const { recordActivity } = require('../utils/audit');

function attachUser(req, res, next) {
  if (!req.session || !req.session.userId) return next();
  try {
    const db = getDatabase();
    const user = db.prepare(`
      SELECT id, name, email, role, department, active, created_at
      FROM users WHERE id = ?
    `).get(req.session.userId);
    if (!user || user.active !== 1) {
      req.session.destroy(() => {});
      return next();
    }
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' });
    if (!roles.includes(req.user.role)) {
      recordActivity(getDatabase(), {
        userId: req.user.id,
        action: 'authorization_denied',
        result: 'denied',
        details: `Role ${req.user.role} attempted to access a restricted administrative endpoint.`,
        ip: req.ip
      });
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  const supplied = req.get('x-csrf-token');
  const expected = req.session && req.session.csrfToken;
  if (!supplied || !expected || !/^[a-f0-9]{64}$/i.test(supplied) ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Your security token expired. Refresh the page and try again.', code: 'CSRF_INVALID' });
  }
  return next();
}

module.exports = { attachUser, requireAuth, requireRole, csrfToken, requireCsrf };
