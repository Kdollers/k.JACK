'use strict';
/**
 * JENESIS Windows desktop shell (Electron main process).
 *
 * Responsibilities:
 *   - enforce a single running instance,
 *   - prepare the per-user database location (never overwriting data),
 *   - start the local Express backend on a loopback port and wait for it,
 *   - open the JENESIS window with a locked-down renderer,
 *   - stop the backend cleanly when the application exits.
 */
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { BackendProcess, findFreePort, LOOPBACK } = require('./backend-manager.cjs');
const { prepareDataDirectory } = require('./data-location.cjs');
const { appIdFromArgv, appTitle, appUserModelId, iconFiles, windowUrl } = require('./app-mode.cjs');
const { resolveFrontendDir } = require('./dist-location.cjs');
const http = require('http');

const APP_TITLE = 'JENESIS';
const WINDOW_MIN_WIDTH = 1024;
const WINDOW_MIN_HEIGHT = 640;
const MAX_START_ATTEMPTS = 3;

let mainWindow = null;
// One window per application: opening JENESIS Seller while JENESIS Admin is
// running adds a second window instead of focusing the wrong application.
const appWindows = new Map();
// The application this process was started for (null = the launcher), and a
// request remembered while the first window is still being prepared.
let currentMode = appIdFromArgv(process.argv);
let pendingMode = null;
let backend = null;
let backendUrl = null;
let logStream = null;
let quitting = false;
let shutdownPromise = null;
let quitWatchdog = null;

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

/**
 * Where the built interface lives.
 *
 * The interface used to be read from inside app.asar only. When that copy
 * cannot be read by the backend process the window has nothing to draw and the
 * user sees an empty white screen, so the build now ships it twice: as a real
 * directory under resources/ (preferred, readable by any process) and inside
 * the archive (fallback). Both are logged, so a failed start says which one
 * was used and which one was missing.
 */
function frontendLocation() {
  return resolveFrontendDir({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: appRoot()
  });
}

let frontend = null;
let frontendOverrideDir = null;

function distDir() {
  if (frontendOverrideDir) return frontendOverrideDir;
  if (!frontend) {
    frontend = frontendLocation();
    const seen = frontend.candidates
      .map((candidate) => `${candidate.kind}=${candidate.dir}(${candidate.available ? 'present' : 'missing'})`)
      .join(', ');
    writeLog(`Interface candidates: ${seen}`);
    writeLog(`Interface directory: ${frontend.dir} [${frontend.kind}]`);
    if (frontend.kind === 'missing') {
      writeLog('WARNING: no built interface was found in the application package.');
    }
  }
  return frontend.dir || path.join(appRoot(), 'dist');
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
  const migration = prepared.migration;
  if (migration && migration.migrated) {
    // The previous brand (GENESIS) kept its database in a sibling folder. The
    // file was COPIED, not moved, so the original is still where it was.
    writeLog(`Adopted the existing database from ${migration.sourcePath} (${migration.bytes} bytes). ` +
      'The original file was left untouched.');
  } else if (migration && migration.reason === 'verification-failed') {
    writeLog(`WARNING: the database in ${migration.sourcePath} could not be verified after copying and was not adopted.`);
  }
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
          dialog.showErrorBox(
            APP_TITLE,
            'The JENESIS backend stopped unexpectedly. Please close and restart JENESIS.\n\n' +
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
  throw lastError || new Error('The JENESIS backend could not be started.');
}

// ---------------------------------------------------------------------------
// Interface verification
//
// A packaged application can start its backend perfectly and still show an
// empty window: if the built interface (index.html and its JavaScript and CSS
// files) cannot be read, there is nothing to draw. That is the failure this
// checks for, before the window is shown, and it is the difference between
// "the build succeeded" and "the application opens".
// ---------------------------------------------------------------------------
function httpGetText(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let size = 0;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (body.length < 400000) body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, size, body }));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, size: 0, body: '', error: 'timed out' });
    });
    req.on('error', (err) => resolve({ status: 0, size: 0, body: '', error: err.message }));
  });
}

/** Fetches the start page and every file it references; reports what is missing. */
async function verifyInterface() {
  const problems = [];
  const home = await httpGetText(backendUrl);
  if (home.status !== 200 || !home.body.includes('id="root"')) {
    problems.push(`the start page answered HTTP ${home.status || home.error || 'no response'}`);
    return { ok: false, problems, files: 0 };
  }
  const refs = new Set();
  const pattern = /(?:src|href)="(\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(home.body)) !== null) refs.add(match[1]);
  // boot.js is the start-up guard: without it a broken interface is silent.
  if (!refs.has('/boot.js')) problems.push('boot.js is not referenced by the start page');
  for (const ref of refs) {
    const file = await httpGetText(new URL(ref, backendUrl).toString());
    if (file.status !== 200 || file.size === 0) {
      problems.push(`${ref} answered HTTP ${file.status || file.error || 'no response'} (${file.size} bytes)`);
    }
  }
  return { ok: problems.length === 0, problems, files: refs.size };
}

/**
 * Verifies the interface, retrying with the other packaged copy if the first
 * one cannot be served. Never throws: the window still opens and reports the
 * problem instead of leaving the user with a blank screen.
 */
async function ensureInterface() {
  const first = await verifyInterface();
  writeLog(
    first.ok
      ? `Interface check: ${first.files} file(s) reachable from ${distDir()}.`
      : `Interface check FAILED: ${first.problems.join('; ')}`
  );
  if (first.ok) return first;

  const alternatives = (frontend ? frontend.candidates : []).filter(
    (candidate) => candidate.available && candidate.dir !== distDir()
  );
  for (const candidate of alternatives) {
    writeLog(`Interface check: trying the ${candidate.kind} copy at ${candidate.dir}.`);
    frontendOverrideDir = candidate.dir;
    try {
      await stopBackend();
      shutdownPromise = null;
      await startBackend();
      const retry = await verifyInterface();
      writeLog(
        retry.ok
          ? `Interface check: the ${candidate.kind} copy works (${retry.files} file(s) reachable).`
          : `Interface check: the ${candidate.kind} copy failed too: ${retry.problems.join('; ')}`
      );
      if (retry.ok) return retry;
    } catch (err) {
      writeLog(`Interface check: restarting with the ${candidate.kind} copy failed: ${err.message}`);
    }
  }
  return first;
}

function showInterfaceError(problems) {
  dialog.showErrorBox(
    APP_TITLE,
    'JENESIS started, but its interface files could not be loaded, so the window\n' +
      'would stay empty.\n\n' +
      `${problems.slice(0, 4).join('\n')}\n\n` +
      'Reinstalling JENESIS from the same installer repairs a damaged\n' +
      'installation; your business data is kept.\n\n' +
      `Details were written to:\n${logFilePath()}`
  );
}

function stopBackend() {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      if (backend) {
        writeLog('Stopping backend...');
        // stop() gives the backend 5 s to exit cleanly and then escalates. The
        // race adds a hard ceiling on top of it: a child that cannot be reaped
        // must never keep the desktop application open on shutdown.
        await Promise.race([
          backend.stop(5000).catch((err) => writeLog(`Backend stop error: ${err && err.message ? err.message : err}`)),
          new Promise((resolve) => setTimeout(resolve, 8000))
        ]);
        writeLog('Backend stopped.');
        backend = null;
        backendUrl = null;
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
// Appearance
// ---------------------------------------------------------------------------
// The window is painted before the interface loads, so its background has to
// match the theme the renderer is about to apply. The renderer tells us which
// theme is active through one narrow IPC channel that accepts exactly three
// strings - no Node.js, file system or shell access is involved.
const THEME_BACKGROUNDS = { light: '#f1f5f9', dark: '#020617' };
const ALLOWED_THEMES = ['light', 'dark', 'system'];

function darkWindowBackground() {
  return nativeTheme && nativeTheme.shouldUseDarkColors ? THEME_BACKGROUNDS.dark : THEME_BACKGROUNDS.light;
}

function applyShellTheme(theme) {
  if (!ALLOWED_THEMES.includes(theme)) return null;
  if (nativeTheme) nativeTheme.themeSource = theme;
  const background = nativeTheme && nativeTheme.shouldUseDarkColors
    ? THEME_BACKGROUNDS.dark
    : THEME_BACKGROUNDS.light;
  // Every application window follows the theme of the window that changed it:
  // the shell colour is a machine-wide appearance, not a per-application
  // setting (the application colour itself is untouched by the theme).
  for (const win of BrowserWindow.getAllWindows()) {
    if (win && !win.isDestroyed()) win.setBackgroundColor(background);
  }
  writeLog(`Appearance set to ${theme}.`);
  return theme;
}

ipcMain.handle('genesis:set-theme', (event, requested) => applyShellTheme(requested));

// Which windows have told us their interface is really up. A page can finish
// loading and still draw nothing; the report below is proof that React mounted.
const rendererReady = new Set();

// Start-up diagnostics from the interface (public/boot.js and
// src/components/AppCrashScreen.jsx). One stage and one short line, written to
// desktop.log. No business data, no files, and nothing is returned.
ipcMain.handle('genesis:startup-report', (event, payload) => {
  const stage = payload && payload.stage ? String(payload.stage).slice(0, 40) : 'unknown';
  const detail = payload && payload.detail ? String(payload.detail).slice(0, 400) : '';
  writeLog(`renderer: ${stage}${detail ? ` — ${detail}` : ''}`);
  if (stage === 'ready' && event && event.sender) rendererReady.add(event.sender.id);
  return true;
});

// The operating system can change its appearance while JENESIS is running;
// keep the window background in step when the user follows the system.
if (nativeTheme && typeof nativeTheme.on === 'function') {
  nativeTheme.on('updated', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setBackgroundColor(darkWindowBackground());
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow(mode) {
  const appId = mode || null;
  const identity = iconFiles(appId);
  mainWindow = new BrowserWindow({
    title: appId ? appTitle(appId) : APP_TITLE,
    width: 1366,
    height: 860,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    show: false,
    backgroundColor: darkWindowBackground(),
    autoHideMenuBar: true,
    icon: path.join(appRoot(), identity.ico),
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

  // Give the window its own taskbar identity, so pinning JENESIS Seller does
  // not pin JENESIS Admin (Windows groups windows by this id).
  try {
    if (process.platform === 'win32' && typeof mainWindow.setAppDetails === 'function') {
      mainWindow.setAppDetails({ appId: appUserModelId(appId) });
    }
  } catch (err) {
    writeLog(`Could not set the window identity: ${err && err.message ? err.message : err}`);
  }

  appWindows.set(appId || 'launcher', mainWindow);
  writeLog(`Opening ${appId ? appTitle(appId) : 'the JENESIS launcher'}.`);

  // Window lifecycle is logged: a window that never finishes loading is the one
  // failure mode that leaves the user with an empty frame, so it must be visible
  // in desktop.log.
  let pageLoaded = false;
  let loadRetried = false;
  const reloadOnce = (reason) => {
    if (loadRetried || pageLoaded) return;
    loadRetried = true;
    writeLog(`Window load ${reason}; reloading the interface once.`);
    try { mainWindow.loadURL(windowUrl(backendUrl, appId)); } catch (err) { writeLog(`Reload failed: ${err.message}`); }
  };
  mainWindow.webContents.on('did-finish-load', () => {
    pageLoaded = true;
    writeLog('Window finished loading.');
  });
  // A loaded page can still be blank: the interface tells us when it is really
  // up, and if that report never arrives the window is retried once and the
  // failure is recorded instead of leaving an empty frame on screen.
  const readyWatchdog = setTimeout(() => {
    if (!rendererReady.has(mainWindow.webContents.id)) {
      writeLog('The interface did not report that it started within 25s.');
      reloadOnce('did not report a working interface');
    }
  }, 25000);
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, url) => {
    writeLog(`Window failed to load: ${errorCode} ${errorDescription} (${url})`);
    reloadOnce('failed');
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    writeLog(`Renderer gone: ${JSON.stringify(details)}`);
    reloadOnce('lost its renderer');
  });
  // A stalled load (no error, no completion) leaves an invisible window; retry once.
  const loadWatchdog = setTimeout(() => reloadOnce('did not finish within 15s'), 15000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(loadWatchdog);
    writeLog('Window ready to show.');
    mainWindow.show();
  });
  // Safety net: never leave the user staring at nothing.
  const showWatchdog = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      writeLog('Window had not signalled ready-to-show after 20s; showing it anyway.');
      mainWindow.show();
    }
  }, 20000);
  mainWindow.once('closed', () => {
    clearTimeout(loadWatchdog);
    clearTimeout(readyWatchdog);
    clearTimeout(showWatchdog);
    if (mainWindow && mainWindow.webContents) rendererReady.delete(mainWindow.webContents.id);
  });

  // Only the JENESIS backend origin may be displayed inside the window.
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

  mainWindow.on('closed', () => {
    writeLog('Window closed.');
    appWindows.delete(appId || 'launcher');
    mainWindow = null;
  });
  return mainWindow.loadURL(windowUrl(backendUrl, appId));
}

/** Focuses the window of an application, or opens it when it is not running. */
function focusOrOpenApp(mode) {
  const key = mode || 'launcher';
  const existing = appWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    writeLog(`${mode ? appTitle(mode) : 'The launcher'} was already open; focusing it.`);
    return existing;
  }
  // A second window must not inherit the quit flow of the first: only when the
  // last window closes does the process (and the backend) stop.
  const win = createWindow(mode || null);
  return win;
}

/** The application a window was opened as (null for the launcher). */
function modeOfWindow(win) {
  for (const [mode, candidate] of appWindows.entries()) {
    if (candidate === win) return mode === 'launcher' ? null : mode;
  }
  return null;
}

function showStartupError(err) {
  writeLog(`Startup failed: ${err && err.stack ? err.stack : err}`);
  dialog.showErrorBox(
    APP_TITLE,
    'JENESIS could not start its local accounting service.\n\n' +
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
  // A second launch is not a duplicate: the shortcut says WHICH application the
  // user wants, so open (or focus) that application.
  app.on('second-instance', (event, argv) => {
    const mode = appIdFromArgv(argv) || null;
    writeLog(`Another launch requested ${mode ? appTitle(mode) : 'the launcher'}.`);
    if (!backendUrl) {
      // The first window is still starting; it will honour the same mode.
      pendingMode = mode;
      return;
    }
    focusOrOpenApp(mode);
  });

  // Restarting the local service is the only way to rebind its network address
  // after the Maintenance application changes it. It touches nothing else: the
  // database is the same file, and no data is written.
  ipcMain.handle('genesis:restart-backend', async () => {
    if (!backendUrl) return false;
    writeLog('Restarting the local service (requested by the interface).');
    try {
      await stopBackend();
      shutdownPromise = null;
      await startBackend();
      for (const win of BrowserWindow.getAllWindows()) {
        if (win && !win.isDestroyed()) win.loadURL(windowUrl(backendUrl, modeOfWindow(win)));
      }
      writeLog(`Service restarted at ${backendUrl}.`);
      return true;
    } catch (err) {
      writeLog(`Service restart failed: ${err && err.message ? err.message : err}`);
      return false;
    }
  });

  // Renderer may only ask for read-only application information.
  ipcMain.handle('genesis:get-app-info', () => ({
    name: APP_TITLE,
    version: app.getVersion(),
    platform: process.platform,
    dataDirectory: app.getPath('userData'),
    packaged: app.isPackaged,
    // Which application this window was opened as ('seller', 'maintenance',
    // 'admin' or null for the launcher). Read-only, and only used to pick the
    // identity of the interface.
    app: currentMode
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
      // Prove the interface can actually be served before the window opens:
      // a successful build is not the same as a window that draws something.
      const interfaceCheck = await ensureInterface();
      // A launch request that arrived while the backend was starting wins: it
      // is the application the user most recently asked for.
      const mode = pendingMode || currentMode;
      pendingMode = null;
      currentMode = mode;
      await createWindow(mode || null);
      if (!interfaceCheck.ok) showInterfaceError(interfaceCheck.problems);
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
      // Watchdog: business data is already committed by then, so the
      // application must never stay open because shutdown took too long.
      quitWatchdog = setTimeout(() => {
        writeLog('Shutdown watchdog fired (20s): forcing exit.');
        app.exit(0);
      }, 20000);
      stopBackend().finally(() => {
        if (quitWatchdog) clearTimeout(quitWatchdog);
        quitWatchdog = null;
        app.quit();
      });
    }
  });

  // Keep the process alive until quit so the backend is always stopped first.
  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('activate', () => {
    // macOS-style reactivation: re-open the last application that was used.
    if (!mainWindow && backendUrl) focusOrOpenApp(currentMode);
  });
}
