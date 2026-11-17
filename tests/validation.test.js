const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanText, normalizeEmail, isValidEmail, isValidDateOrEmpty, parseTags,
  safeOriginalName, fileTypeAllowed, isStrongPassword
} = require('../src/utils/validation');

test('cleanText removes control characters and enforces a maximum length', () => {
  assert.equal(cleanText('  hello\u0000 world  ', 20), 'hello world');
  assert.equal(cleanText('abcdefgh', 4), 'abcd');
});

test('email helpers normalize and validate email addresses', () => {
  assert.equal(normalizeEmail('  PERSON@Example.COM '), 'person@example.com');
  assert.equal(isValidEmail('person@example.com'), true);
  assert.equal(isValidEmail('not-an-email'), false);
});

test('date validation accepts valid ISO dates and rejects impossible dates', () => {
  assert.equal(isValidDateOrEmpty('2026-11-18'), true);
  assert.equal(isValidDateOrEmpty('2026-02-30'), false);
  assert.equal(isValidDateOrEmpty(''), true);
});

test('tags are normalized, unique, and limited', () => {
  assert.deepEqual(parseTags(' Notice, notice, EXAM, , Form '), ['notice', 'exam', 'form']);
  assert.equal(parseTags(Array.from({ length: 20 }, (_, i) => `tag-${i}`)).length, 12);
});

test('original filenames are reduced to a safe basename', () => {
  assert.equal(safeOriginalName('../../secret\nfile.pdf'), 'secret_file.pdf');
});

test('upload allow-list rejects executable and mismatched types', () => {
  assert.equal(fileTypeAllowed({ originalname: 'schedule.pdf', mimetype: 'application/pdf' }), true);
  assert.equal(fileTypeAllowed({ originalname: 'payload.html', mimetype: 'text/html' }), false);
  assert.equal(fileTypeAllowed({ originalname: 'schedule.pdf', mimetype: 'text/plain' }), false);
});

test('password policy requires a long password', () => {
  assert.equal(isStrongPassword('correct-horse-battery'), true);
  assert.equal(isStrongPassword('short'), false);
  assert.equal(isStrongPassword('a'.repeat(73)), false);
});
