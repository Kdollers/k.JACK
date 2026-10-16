'use strict';
/**
 * JENESIS Windows desktop shell (Electron main process).
 *
 * Responsibilities:
 *   - enforce a single running instance,
 *   - prepare the per-user database location (never overwriting data),
 *   - start the local Express backend on a loopback port and wait for it,
 *   - open mode-specific JENESIS windows with a locked-down renderer,
 *   - stop the backend cleanly when the application exits.
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { BackendProcess, findFreePort, LOOPBACK } = require('./backend-manager.cjs');
const {
  prepareDataDirectory, chooseDataDirectory, shouldOfferInstallationChoice,
  alternativeInstallation, saveInstallationChoice, markInstallationInitialized
} = require('./data-location.cjs');
const { modeFromArgs, modeUrl } = require('./entry-points.cjs');
const { messages, VALID_LANGUAGES, languageFor } = require('./desktop-i18n.cjs');

const APP_TITLE = 'JENESIS';
// Select the old directory when an existing GENESIS ledger is present. Session
// files must follow that directory, so do this before Electron is ready.
let dataDirectoryError = null;
try { app.setPath('userData', chooseDataDirectory(app.getPath('appData'))); }
catch (err) { dataDirectoryError = err; }
const WINDOW_MIN_WIDTH = 1024;
const WINDOW_MIN_HEIGHT = 640;
const MAX_START_ATTEMPTS = 3;

const windows = new Set();
const launchQueue = [modeFromArgs(process.argv)];
let backend = null;
let backendUrl = null;
let logStream = null;
let quitting = false;
let shutdownPromise = null;
let desktopLanguage = 'en';

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

function languagePreferencePath() {
  return path.join(app.getPath('userData'), 'ui-language.json');
}

function readDesktopLanguage() {
  try {
    const saved = JSON.parse(fs.readFileSync(languagePreferencePath(), 'utf8'));
    if (VALID_LANGUAGES.includes(saved.lang)) return saved.lang;
  } catch (_) { /* no saved preference on first start */ }
  return languageFor(app.getLocale());
}

function updateNativeMenu() {
  const text = messages[desktopLanguage];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: text.file, submenu: [{ label: text.quit, role: 'quit' }] },
    { label: text.edit, submenu: [
      { label: text.undo, role: 'undo' }, { label: text.redo, role: 'redo' }, { type: 'separator' },
      { label: text.cut, role: 'cut' }, { label: text.copy, role: 'copy' },
      { label: text.paste, role: 'paste' }, { label: text.selectAll, role: 'selectAll' }
    ] },
    { label: text.view, submenu: [
      { label: text.reload, role: 'reload' }, { label: text.fullscreen, role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ label: text.devTools, role: 'toggleDevTools' }])
    ] },
    { label: text.window, submenu: [
      { label: text.minimize, role: 'minimize' }, { label: text.close, role: 'close' }
    ] }
  ]));
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
    seedPath: seedDatabasePath(),
    // The backend snapshots its opened DB with SQLite VACUUM INTO before any
    // schema changes. Do not perform a racing raw copy of a WAL-mode database.
    backupExisting: false
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
      // Must be a real directory: inside a packaged app, appRoot() is app.asar (a file),
      // and spawning with a file as cwd fails before the backend starts.
      cwd: userData,
      env: {
        GENESIS_DB_PATH: prepared.dbPath,
        GENESIS_DIST_DIR: distDir()
      },
      onLog: writeLog,
      childLogPath: path.join(userData, 'logs', 'backend-child.log'),
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
          const text = messages[desktopLanguage];
          dialog.showErrorBox(APP_TITLE, `${text.backendStopped}\n\n${text.logFile} ${logFilePath()}`);
        }
      });
      return;
    } catch (err) {
      lastError = err;
      writeLog(`Backend start attempt ${attempt} failed: ${err.message}`);
      await proc.stop(1000).catch(() => {});
    }
  }
  throw lastError || new Error('The JENESIS backend could not be started.');
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
function createWindow(mode = 'administrator') {
  const win = new BrowserWindow({
    title: `${APP_TITLE} — ${mode === 'seller' ? 'Seller' : mode === 'network' ? 'Network & Maintenance' : 'Administrator'}`,
    width: 1366,
    height: 860,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icons', `j-${mode}.ico`)
      : path.join(appRoot(), 'assets', `j-${mode}.ico`),
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

  windows.add(win);
  win.once('ready-to-show', () => win.show());

  // Only the JENESIS backend origin may be displayed inside the window.
  const allowedOrigin = new URL(backendUrl).origin;
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { windows.delete(win); });
  return win.loadURL(modeUrl(backendUrl, mode));
}

function showStartupError(err) {
  writeLog(`Startup failed: ${err && err.stack ? err.stack : err}`);
  const text = messages[desktopLanguage];
  // The detailed Node exception is in the local log, not the UI: it may contain
  // paths/English/technical diagnostics, and a partial startup may have migrated
  // the DB. Never promise that no write was made if startup failed.
  dialog.showErrorBox(APP_TITLE, `${text.startupFailed}\n\n${text.logFile} ${logFilePath()}`);
}

function confirmInstallationChange(newDatabase) {
  const text = messages[desktopLanguage];
  return dialog.showMessageBoxSync({
    type: 'warning', title: newDatabase ? text.confirmTitle : text.switchTitle,
    message: newDatabase ? text.confirmMessage : text.switchMessage,
    detail: newDatabase ? text.confirmDetail : text.switchDetail,
    buttons: [text.cancel, newDatabase ? text.confirmNew : text.switchButton],
    defaultId: 0, cancelId: 0, noLink: true
  }) === 1;
}

/** An old database must not be mistaken for a fresh JENESIS installation.
 * Ask once, before opening any database or session. Re-launch if choosing a
 * different userData directory so the single-instance lock follows that path. */
function chooseInstallationOnFirstLaunch() {
  const root = app.getPath('appData');
  if (!shouldOfferInstallationChoice(root)) return true;
  const text = messages[desktopLanguage];
  const response = dialog.showMessageBoxSync({
    type: 'question', title: text.existingTitle,
    message: text.existingMessage, detail: text.existingDetail,
    buttons: [text.useExisting, text.startSeparate, text.cancel],
    defaultId: 0, cancelId: 2, noLink: true
  });
  if (response === 2) return false;
  if (response === 1 && !confirmInstallationChange(true)) return false;
  saveInstallationChoice(root, response === 1 ? 'current' : 'legacy');
  if (response === 1) {
    app.relaunch();
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    try {
      const mode = modeFromArgs(commandLine);
      if (backendUrl) createWindow(mode).catch(showStartupError);
      else launchQueue.push(mode);
    } catch (err) { showStartupError(err); }
  });

  // Only a JENESIS renderer may read desktop metadata or request a native
  // installation switch. The bridge offers no filesystem or arbitrary IPC.
  const fromOwnWindow = (event) => [...windows].some((win) => event.sender === win.webContents) &&
    !!backendUrl && event.senderFrame?.url?.startsWith(backendUrl);
  ipcMain.handle('genesis:get-app-info', (event) => {
    if (!fromOwnWindow(event)) throw new Error('Unauthorized desktop request');
    return {
      name: APP_TITLE, version: app.getVersion(), platform: process.platform,
      dataDirectory: app.getPath('userData'), packaged: app.isPackaged,
      alternativeInstallation: alternativeInstallation(app.getPath('appData'), app.getPath('userData'))
    };
  });
  ipcMain.handle('genesis:choose-installation', async (event, target) => {
    if (!fromOwnWindow(event) || windows.size !== 1 || quitting) {
      throw new Error('Close other JENESIS windows before changing installations.');
    }
    const root = app.getPath('appData');
    const available = alternativeInstallation(root, app.getPath('userData'));
    if (!available || target !== available.target) throw new Error('Installation choice is unavailable.');
    if (!confirmInstallationChange(available.newDatabase)) return false;
    // Do not silently open a different database if a file appeared or was removed
    // while the native confirmation was displayed.
    const stillAvailable = alternativeInstallation(root, app.getPath('userData'));
    if (!stillAvailable || stillAvailable.target !== target ||
        stillAvailable.newDatabase !== available.newDatabase) {
      throw new Error('Installation changed while confirming. No database was modified.');
    }
    saveInstallationChoice(root, target);
    quitting = true;
    await stopBackend();
    app.relaunch();
    app.quit();
    return true;
  });
  ipcMain.handle('genesis:set-language', (event, lang) => {
    if (!fromOwnWindow(event) || !VALID_LANGUAGES.includes(lang)) {
      throw new Error('Invalid desktop language request');
    }
    desktopLanguage = lang;
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(languagePreferencePath(), JSON.stringify({ lang }), { mode: 0o600 });
    updateNativeMenu();
    return true;
  });

  app.whenReady().then(async () => {
    // Use the last selected language even if the backend fails before React loads.
    // Offer the legacy-versus-fresh choice BEFORE opening a SQLite database.
    desktopLanguage = readDesktopLanguage();
    try {
      if (dataDirectoryError) throw dataDirectoryError;
      if (!chooseInstallationOnFirstLaunch()) { app.quit(); return; }
      // Deny every browser permission request (camera, geolocation, notifications, ...).
      session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      updateNativeMenu();
      await startBackend();
      markInstallationInitialized(app.getPath('appData'), app.getPath('userData'));
      for (const mode of launchQueue.splice(0)) await createWindow(mode);
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
    if (windows.size === 0 && backendUrl) createWindow('administrator');
  });
}
