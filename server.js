const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const config = require('./src/config');
const { initializeDatabase, getDatabase } = require('./src/database');
const SQLiteSessionStore = require('./src/session-store');
const { attachUser, requireAuth } = require('./src/middleware/auth');
const apiRoutes = require('./src/routes/api.routes');

async function createApp() {
  const db = await initializeDatabase();
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        upgradeInsecureRequests: config.isProduction ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(session({
    name: 'docuvault.sid',
    secret: config.sessionSecret,
    store: new SQLiteSessionStore(db, { ttl: config.sessionMaxAgeMs }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionMaxAgeMs,
      path: '/'
    }
  }));
  app.use(attachUser);

  app.use('/css', express.static(path.join(config.rootDir, 'public', 'css'), { maxAge: config.isProduction ? '1d' : 0 }));
  app.use('/js', express.static(path.join(config.rootDir, 'public', 'js'), { maxAge: config.isProduction ? '1d' : 0 }));
  app.use('/assets', express.static(path.join(config.rootDir, 'public', 'assets'), { maxAge: config.isProduction ? '7d' : 0 }));

  app.get('/', (req, res) => {
    if (req.user) return res.redirect('/app');
    return res.sendFile(path.join(config.rootDir, 'public', 'index.html'));
  });
  app.get('/login', (req, res) => req.user ? res.redirect('/app') : res.sendFile(path.join(config.rootDir, 'public', 'index.html')));
  app.get('/app', requireAuth, (_req, res) => res.sendFile(path.join(config.rootDir, 'src', 'views', 'app.html')));
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'DocuVault' }));

  app.use('/api', apiRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((_req, res) => res.status(404).sendFile(path.join(config.rootDir, 'public', '404.html')));

  app.use((error, req, res, _next) => {
    const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(`[DocuVault] ${error.stack || error.message}`);
    if (res.headersSent) return;
    const message = status === 413
      ? `File is too large. Maximum upload size is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
      : (status < 500 ? error.message : 'Something went wrong. Please try again.');
    if (req.path.startsWith('/api/')) return res.status(status).json({ error: message });
    return res.status(status).send(message);
  });

  return app;
}

async function start() {
  if (!process.env.SESSION_SECRET) {
    console.warn('[DocuVault] Using the local development session secret. Set SESSION_SECRET in .env before deployment.');
  }
  const app = await createApp();
  const server = app.listen(config.port, () => {
    console.log(`\n  DocuVault is ready: http://localhost:${config.port}`);
    console.log('  Demo admin:   admin@docuvault.local / Admin@12345');
    console.log('  Demo staff:   staff@docuvault.local / Staff@12345');
    console.log('  Demo student: student@docuvault.local / Student@12345\n');
  });

  const shutdown = () => {
    server.close(() => {
      try { getDatabase().close(); } catch (_error) { /* Already closed. */ }
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('[DocuVault] Startup failed:', error);
  process.exit(1);
});
