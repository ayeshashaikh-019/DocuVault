const { ACTIONS } = require('./validation');

function permissionDefaults(role, action) {
  if (role === 'admin') return true;
  if (role === 'staff') {
    return ['view', 'view_restricted', 'upload', 'edit', 'view_activity'].includes(action);
  }
  if (role === 'student') return action === 'view';
  return false;
}

function hasPermission(db, user, categoryId, action) {
  if (!user || !ACTIONS.includes(action)) return false;
  if (user.role === 'admin') return true;
  const row = db.prepare(
    'SELECT allowed FROM permissions WHERE role = ? AND category_id = ? AND action = ?'
  ).get(user.role, Number(categoryId), action);
  return row ? row.allowed === 1 : permissionDefaults(user.role, action);
}

function canViewDocument(db, user, document) {
  if (!hasPermission(db, user, document.category_id, 'view')) return false;
  if (document.status === 'archived' && !hasPermission(db, user, document.category_id, 'archive')) return false;
  if (document.visibility === 'restricted') {
    return hasPermission(db, user, document.category_id, 'view_restricted');
  }
  return true;
}

function canPerformDocumentAction(db, user, document, action) {
  if (!user || !document || !['edit', 'archive', 'delete'].includes(action)) return false;
  if (!hasPermission(db, user, document.category_id, action)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'staff') return Number(document.uploaded_by) === Number(user.id);
  return false;
}

module.exports = { permissionDefaults, hasPermission, canViewDocument, canPerformDocumentAction };
