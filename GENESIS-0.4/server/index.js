const trace = (msg) => {
  if (!process.env.GENESIS_CHILD_LOG) return;
  try { require('fs').appendFileSync(process.env.GENESIS_CHILD_LOG, `${new Date().toISOString()} [trace] ${msg}\n`); } catch (_) { /* ignore */ }
};
trace('loading express');
const express = require('express');
trace('loading cors');
const cors = require('cors');
const path = require('path');
trace('loading routes');
const apiRoutes = require('./routes/api');
trace('loading db module (better-sqlite3)');
const { getDb, closeDb, DB_PATH, APP_DATA_ROOT } = require('./db');
trace('modules loaded');

const { securityHeaders } = require('./security');
const { errorPayload } = require('./error-codes');
const { createLimiter, clientIp, MINUTE } = require('./rateLimit');
const { lanHost, isLoopback, isPrivateLan } = require('./lan-host');
const apiLimiter = createLimiter({ name: 'api', windowMs: MINUTE, max: 1200, keyFn: (req) => clientIp(req) });

const APP_NAME = 'JENESIS Business Management & Accounting Software';
const APP_VERSION = require('../package.json').version;

/**
 * Creates the Express application.
 * @param {{ distPath?: string }} options  Directory containing the built React app.
 */
function createApp(options = {}) {
  const distPath = options.distPath || process.env.GENESIS_DIST_DIR || path.join(__dirname, '..', 'dist');
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Plain HTTP is strictly local. Remote clients use the opt-in HTTPS listener
  // and an RFC1918 address; a public/WAN peer must not reach a business API.
  app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    if (req.socket.encrypted) {
      if (!isLoopback(ip) && !isPrivateLan(ip)) return res.status(403).json({ code: 'LAN_PRIVATE_ONLY' });
      // The browser needs GET /api/setup/status to render its login screen.
      // Initial administrator registration is done on the host only.
      if (req.path === '/api/setup/initialize') return res.status(403).json({ code: 'LAN_SETUP_LOCAL_ONLY' });
    } else if (!isLoopback(ip)) {
      return res.status(403).json({ code: 'LAN_TLS_REQUIRED' });
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    const sendJson = res.json.bind(res);
    res.json = (body) => sendJson(errorPayload(body, res.statusCode));
    next();
  });
  // Global per-client limit for the API as a backstop against runaway or hostile clients.
  app.use('/api', apiLimiter.middleware);

  // The app is served from the same origin as the API (desktop window or Vite proxy),
  // so cross-origin access is not needed. Keep CORS for the existing dev workflow only.
  app.use(cors({ origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ }));
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Health check: identifies this specific application so the desktop shell
  // can refuse to attach to an unrelated server listening on the same port.
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      application: APP_NAME,
      appId: 'jenesis-accounting',
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api', apiRoutes);

  // Malformed JSON and request-size errors otherwise become Express's English
  // HTML error page (or a stack trace in development). Keep API failures coded.
  app.use('/api', (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    const code = err.type === 'entity.parse.failed' ? 'INVALID_JSON'
      : err.type === 'entity.too.large' ? 'REQUEST_TOO_LARGE' : 'GENERIC';
    res.status(status).json({ code });
  });

  app.use(express.static(distPath));

  app.use('/api', (req, res) => res.status(404).json({ code: 'NOT_FOUND' }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) {
        res.status(503).type('html').send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>JENESIS</title></head>' +
          '<body style="font-family:sans-serif;padding:40px">' +
          '<h2>JENESIS interface not built</h2>' +
          '<p>Run <code>npm run build</code> to create the frontend bundle.</p></body></html>'
        );
      }
    });
  });

  return app;
}

/** Starts the local desktop listener and, only if explicitly enabled, the
 * separate TLS-only LAN listener. Both serve the SAME Express app and database. */
async function startServer(options = {}) {
  const host = options.host || process.env.GENESIS_HOST || '127.0.0.1';
  const port = options.port !== undefined ? Number(options.port) : Number(process.env.GENESIS_PORT || process.env.PORT || 3000);

  // Ensure the database is opened, backed up and migrated before any request.
  trace('opening database');
  try {
    getDb();
    // Source-run installations also record that a JENESIS DB was initialized;
    // losing it later must not silently reopen setup. Electron passes an
    // explicit DB path and records this choice before displaying its window.
    // Isolated tests/recovery use explicit paths and never write this marker.
    if (!process.env.GENESIS_DB_PATH) {
      require('../electron/data-location.cjs').markInstallationInitialized(APP_DATA_ROOT, path.dirname(DB_PATH));
    }
  } catch (err) {
    closeDb();
    throw err;
  }
  trace('database ready');
  const app = createApp(options);
  lanHost.attach(app, DB_PATH, { lanPort: options.lanPort });
  await lanHost.resume();
  try {
    return await new Promise((resolve, reject) => {
      const server = app.listen(port, host, () => {
        server.off('error', reject);
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        resolve({
          server, host, port: actualPort,
          close: async () => {
            // Stop the remote listener FIRST. No remote socket can race against
            // DB closure. Don't change the saved opt-in for the next start.
            await lanHost.detach();
            await new Promise((res) => {
              server.close(res);
              if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
            });
            closeDb();
          }
        });
      });
      server.once('error', reject);
    });
  } catch (err) {
    await lanHost.detach();
    closeDb();
    throw err;
  }
}

module.exports = { createApp, startServer, APP_NAME, APP_VERSION, DB_PATH };

if (require.main === module) {
  // Optional startup trace for the desktop shell (GENESIS_CHILD_LOG). Helps diagnose
  // why a packaged backend exits; it records progress and the exit code only.
  const childLog = (msg) => {
    if (!process.env.GENESIS_CHILD_LOG) return;
    try { require('fs').appendFileSync(process.env.GENESIS_CHILD_LOG, `${new Date().toISOString()} ${msg}\n`); } catch (_) { /* ignore */ }
  };
  childLog(`backend process started (node ${process.version}, pid ${process.pid}, port ${process.env.GENESIS_PORT || '?'})`);
  process.on('exit', (code) => childLog(`backend process exiting with code ${code}`));
  process.on('uncaughtException', (err) => { childLog(`uncaught exception: ${err && err.stack ? err.stack : err}`); process.exit(1); });
  startServer()
    .then(({ host, port, close }) => {
      childLog(`listening on http://${host}:${port}`);
      console.log(`JENESIS server running at http://${host}:${port}`);
      const shutdown = () => {
        close().then(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
      // Electron parent asks us to stop by closing stdin / sending a message.
      if (process.send) process.on('message', (m) => { if (m === 'shutdown') shutdown(); });
    })
    .catch((err) => {
      childLog(`startup failed: ${err && err.stack ? err.stack : err}`);
      console.error('JENESIS server failed to start:', err.message);
      process.exit(1);
    });
}
