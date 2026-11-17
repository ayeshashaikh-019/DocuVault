const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('every mutating API route is protected by a CSRF check', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'api.routes.js'), 'utf8');
  const mutatingRoutes = source.split('\n').filter((line) => /router\.(post|put|patch|delete)\(/i.test(line));
  assert.ok(mutatingRoutes.length >= 10, 'Expected the API to contain the project write routes.');
  for (const line of mutatingRoutes) {
    assert.match(line, /requireCsrf/, `Missing requireCsrf on route: ${line.trim()}`);
  }
});

test('uploaded file storage is not exposed through the static public folders', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /express\.static\(path\.join\(config\.rootDir, 'public'/);
  assert.doesNotMatch(server, /express\.static\(config\.uploadDir/);
});
