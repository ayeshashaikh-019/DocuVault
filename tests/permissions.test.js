const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionDefaults, canViewDocument, canPerformDocumentAction } = require('../src/utils/permissions');

function fakeDb(allowed = {}) {
  return {
    prepare() {
      return { get(role, categoryId, action) {
        const key = `${role}:${categoryId}:${action}`;
        return Object.prototype.hasOwnProperty.call(allowed, key) ? { allowed: allowed[key] ? 1 : 0 } : null;
      } };
    }
  };
}

test('default permissions reflect the three project roles', () => {
  assert.equal(permissionDefaults('admin', 'delete'), true);
  assert.equal(permissionDefaults('staff', 'upload'), true);
  assert.equal(permissionDefaults('staff', 'delete'), false);
  assert.equal(permissionDefaults('student', 'view'), true);
  assert.equal(permissionDefaults('student', 'upload'), false);
});

test('students can view public documents but not restricted documents by default', () => {
  const db = fakeDb();
  const student = { id: 3, role: 'student' };
  assert.equal(canViewDocument(db, student, { category_id: 1, visibility: 'public' }), true);
  assert.equal(canViewDocument(db, student, { category_id: 1, visibility: 'restricted' }), false);
});

test('explicit category permissions control restricted document access', () => {
  const db = fakeDb({ 'student:2:view': true, 'student:2:view_restricted': true });
  assert.equal(canViewDocument(db, { id: 3, role: 'student' }, { category_id: 2, visibility: 'restricted' }), true);
});

test('staff can only edit their own documents when edit is permitted', () => {
  const db = fakeDb({ 'staff:1:edit': true });
  const staff = { id: 4, role: 'staff' };
  assert.equal(canPerformDocumentAction(db, staff, { id: 5, category_id: 1, uploaded_by: 4 }, 'edit'), true);
  assert.equal(canPerformDocumentAction(db, staff, { id: 5, category_id: 1, uploaded_by: 9 }, 'edit'), false);
});


test('archived records require archive permission even when public', () => {
  const studentDb = fakeDb();
  const student = { id: 3, role: 'student' };
  assert.equal(canViewDocument(studentDb, student, { category_id: 1, visibility: 'public', status: 'archived' }), false);
  const staffDb = fakeDb({ 'staff:1:view': true, 'staff:1:archive': true });
  const staff = { id: 4, role: 'staff' };
  assert.equal(canViewDocument(staffDb, staff, { category_id: 1, visibility: 'public', status: 'archived' }), true);
});
