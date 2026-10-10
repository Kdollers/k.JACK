'use strict';
/**
 * GENESIS Windows desktop shell (Electron main process).
 *
 * Responsibilities:
 *   - enforce a single running instance,
 *   - prepare the per-user database location (never overwriting data),
 *   - start the local Express backend on a loopback port and wait for it,
 *   - open the GENESIS window with a locked-down renderer,
 *   - stop the backend cleanly when the application exits.
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { BackendProcess, findFreePort, LOOPBACK } = require('./backend-manager.cjs');
const { prepareDataDirectory } = require('./data-location.cjs');

const APP_TITLE = 'GENESIS';
const WINDOW_MIN_WIDTH = 1024;
const WINDOW_MIN_HEIGHT = 640;
const MAX_START_ATTEMPTS = 3;

let mainWindow = null;
let backend = null;
let backendUrl = null;
let logStream = null;
let quitting = false;
let shutdownPromise = null;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
function appRoot() {
  // In a packaged build this is .../resources/app.asar; in development the project folder.
  return app.getAppPath();
}

function serverEntry() {
  return path.join(appRoot(), 'server', 'index.js');
}

function distDir() {
  return path.join(appRoot(), 'dist');
}

function seedDatabasePath() {
  // No starter database is bundled. A new installation creates an empty database and
  // the first administrator is created by the setup wizard. Demo accounts with known
  // passwords are never shipped in the installer.
  return null;
}

function logFilePath() {
  return path.join(app.getPath('userData'), 'logs', 'desktop.log');
}

function writeLog(line) {
  try {
    if (!logStream) {
      fs.mkdirSync(path.dirname(logFilePath()), { recursive: true });
      logStream = fs.createWriteStream(logFilePath(), { flags: 'a' });
    }
    logStream.write(`${new Date().toISOString()} ${line}\n`);
  } catch (_) { /* logging must never crash the app */ }
}

// ---------------------------------------------------------------------------
// Backend startup / shutdown
// ---------------------------------------------------------------------------
async function startBackend() {
  const userData = app.getPath('userData');
  const prepared = prepareDataDirectory({
    dataDir: userData,
    seedPath: seedDatabasePath()
  });
  writeLog(`Data directory: ${userData}`);
  if (prepared.seeded) writeLog('Created the database from the bundled starter copy.');
  if (prepared.backupPath) writeLog(`Backed up the existing database to ${prepared.backupPath}`);

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const port = await findFreePort(LOOPBACK);
    const proc = new BackendProcess({
      nodeExecutable: process.execPath,
      serverEntry: serverEntry(),
      cwd: appRoot(),
      env: {
        GENESIS_DB_PATH: prepared.dbPath,
        GENESIS_DIST_DIR: distDir()
      },
      onLog: writeLog,
      startupTimeoutMs: 25000
    });
    try {
      await proc.start(port);
      backend = proc;
      backendUrl = `http://${LOOPBACK}:${port}/`;
      writeLog(`Backend ready at ${backendUrl} (attempt ${attempt})`);
      // If the backend dies while the app is open, tell the user instead of showing a dead window.
      proc.exitPromise.then((info) => {
        if (!quitting && !proc.stopping) {
          writeLog(`Backend exited unexpectedly: ${JSON.stringify(info)}`);
          dialog.showErrorBox(
            APP_TITLE,
            'The GENESIS backend stopped unexpectedly. Please close and restart GENESIS.\n\n' +
            `Log file: ${logFilePath()}`
          );
        }
      });
      return;
    } catch (err) {
      lastError = err;
      writeLog(`Backend start attempt ${attempt} failed: ${err.message}`);
      await proc.stop(1000).catch(() => {});
    }
  }
  throw lastError || new Error('The GENESIS backend could not be started.');
}

function stopBackend() {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      if (backend) {
        writeLog('Stopping backend...');
        await backend.stop(5000);
        writeLog('Backend stopped.');
        backend = null;
      }
      if (logStream) {
        logStream.end();
        logStream = null;
      }
    })();
  }
  return shutdownPromise;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1366,
    height: 860,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    icon: path.join(appRoot(), 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Only the GENESIS backend origin may be displayed inside the window.
  const allowedOrigin = new URL(backendUrl).origin;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow.loadURL(backendUrl);
}

function showStartupError(err) {
  writeLog(`Startup failed: ${err && err.stack ? err.stack : err}`);
  dialog.showErrorBox(
    APP_TITLE,
    'GENESIS could not start its local accounting service.\n\n' +
    `${err && err.message ? err.message : 'Unknown error.'}\n\n` +
    `Details were written to:\n${logFilePath()}\n\n` +
    'Your business data has not been changed.'
  );
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Renderer may only ask for read-only application information.
  ipcMain.handle('genesis:get-app-info', () => ({
    name: APP_TITLE,
    version: app.getVersion(),
    platform: process.platform,
    dataDirectory: app.getPath('userData'),
    packaged: app.isPackaged
  }));

  app.whenReady().then(async () => {
    // Deny every browser permission request (camera, geolocation, notifications, ...).
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    // Minimal menu: keeps standard Windows editing and reload shortcuts only.
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'File', submenu: [{ role: 'quit' }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'close' }] }
    ]));

    try {
      await startBackend();
      await createWindow();
    } catch (err) {
      showStartupError(err);
      quitting = true;
      await stopBackend();
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (!shutdownPromise) {
      quitting = true;
      event.preventDefault();
      stopBackend().finally(() => app.quit());
    }
  });

  // Keep the process alive until quit so the backend is always stopped first.
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('activate', () => {
    if (!mainWindow && backendUrl) createWindow();
  });
}
