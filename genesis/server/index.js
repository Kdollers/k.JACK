const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const { getDb, closeDb, DB_PATH } = require('./db');

const APP_NAME = 'GENESIS Business Management & Accounting Software';
const APP_VERSION = require('../package.json').version;

/**
 * Creates the Express application.
 * @param {{ distPath?: string }} options  Directory containing the built React app.
 */
function createApp(options = {}) {
  const distPath = options.distPath || process.env.GENESIS_DIST_DIR || path.join(__dirname, '..', 'dist');
  const app = express();

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
      appId: 'genesis-accounting',
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api', apiRoutes);

  app.use(express.static(distPath));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) {
        res.status(503).type('html').send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>GENESIS</title></head>' +
          '<body style="font-family:sans-serif;padding:40px">' +
          '<h2>GENESIS interface not built</h2>' +
          '<p>Run <code>npm run build</code> to create the frontend bundle.</p></body></html>'
        );
      }
    });
  });

  return app;
}

/**
 * Starts the HTTP server. Binds to the loopback interface by default.
 * @returns {Promise<{ server: import('http').Server, port: number, host: string, close: () => Promise<void> }>}
 */
function startServer(options = {}) {
  const host = options.host || process.env.GENESIS_HOST || '127.0.0.1';
  const port = options.port !== undefined ? Number(options.port) : Number(process.env.GENESIS_PORT || process.env.PORT || 3000);

  // Ensure the database is opened and migrated before accepting requests.
  getDb();
  const app = createApp(options);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server,
        host,
        port: actualPort,
        close: () => new Promise((res) => {
          server.close(() => {
            closeDb();
            res();
          });
          // Drop idle keep-alive sockets so shutdown is not delayed.
          if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
        })
      });
    });
    server.on('error', (err) => {
      closeDb();
      reject(err);
    });
  });
}

module.exports = { createApp, startServer, APP_NAME, APP_VERSION, DB_PATH };

if (require.main === module) {
  startServer()
    .then(({ host, port, close }) => {
      console.log(`GENESIS server running at http://${host}:${port}`);
      const shutdown = () => {
        close().then(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
      // Electron parent asks us to stop by closing stdin / sending a message.
      if (process.send) process.on('message', (m) => { if (m === 'shutdown') shutdown(); });
    })
    .catch((err) => {
      console.error('GENESIS server failed to start:', err.message);
      process.exit(1);
    });
}
