const path = require('node:path');
require('dotenv').config();

const rootDir = path.resolve(__dirname, '..');
const isProduction = (process.env.NODE_ENV || 'development') === 'production';
const environmentSecret = process.env.SESSION_SECRET;
if (isProduction && (!environmentSecret || environmentSecret.length < 32)) {
  throw new Error('Set a unique SESSION_SECRET of at least 32 characters in production.');
}
const resolveFromRoot = (value, fallback) => path.resolve(rootDir, value || fallback);

const config = {
  rootDir,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: environmentSecret || 'docuvault-local-development-secret-change-me-please',
  sessionMaxAgeMs: Math.max(1, Number.parseInt(process.env.SESSION_MAX_AGE_HOURS || '8', 10)) * 60 * 60 * 1000,
  databasePath: resolveFromRoot(process.env.DB_PATH, './database/docuvault.sqlite'),
  uploadDir: resolveFromRoot(process.env.UPLOAD_DIR, './storage/private'),
  maxUploadBytes: Math.max(1, Number.parseInt(process.env.MAX_UPLOAD_MB || '10', 10)) * 1024 * 1024,
  isProduction
};


module.exports = config;
