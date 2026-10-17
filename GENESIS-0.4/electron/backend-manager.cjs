'use strict';
/**
 * Lifecycle management for the local GENESIS backend process.
 *
 * This module intentionally does not import 'electron', so it can be unit-tested
 * with plain Node.js. The Electron main process uses it to:
 *   - pick a free loopback port,
 *   - start the Express server in a child process (Electron's Node runtime),
 *   - wait until the server identifies itself as GENESIS on /api/health,
 *   - stop the server cleanly, escalating only if it does not exit in time.
 */
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const LOOPBACK = '127.0.0.1';
const EXPECTED_APP_ID = 'genesis-accounting';

/** Finds a free TCP port on the loopback interface. */
function findFreePort(host = LOOPBACK) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, host, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Performs one GET request and resolves with { status, body } or rejects on network error. */
function httpGetJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch (_) { body = null; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/**
 * Polls the health endpoint until the expected GENESIS server answers.
 * Rejects after timeoutMs, or immediately if `isAlive()` reports the process has exited.
 */
async function waitForHealth({ port, host = LOOPBACK, timeoutMs = 20000, intervalMs = 150, isAlive = () => true }) {
  const url = `http://${host}:${port}/api/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!isAlive()) {
      throw new Error('The GENESIS backend process exited before it became ready.');
    }
    try {
      const { status, body } = await httpGetJson(url, 1000);
      if (status === 200 && body && body.appId === EXPECTED_APP_ID) {
        return body;
      }
      // Something else is listening on this port. Do not attach to it.
      if (status === 200 || body) {
        lastError = new Error('Another service is listening on the GENESIS backend port.');
        throw lastError;
      }
      lastError = new Error(`Unexpected HTTP status ${status} from the backend.`);
    } catch (err) {
      if (err && err.message === 'Another service is listening on the GENESIS backend port.') throw err;
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const reason = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`The GENESIS backend did not become ready within ${Math.round(timeoutMs / 1000)} seconds.${reason}`);
}

class BackendProcess {
  /**
   * @param {object} opts
   * @param {string} opts.nodeExecutable  Executable used to run the server (Electron binary or node).
   * @param {boolean} [opts.runAsNode=true] Set ELECTRON_RUN_AS_NODE=1 so the Electron binary behaves as Node.
   * @param {string} opts.serverEntry     Path to server/index.js.
   * @param {string} opts.cwd             Working directory for the child.
   * @param {object} opts.env             Extra environment variables (GENESIS_DB_PATH, GENESIS_DIST_DIR, ...).
   * @param {(line: string) => void} [opts.onLog] Receives backend stdout/stderr lines.
   */
  constructor(opts) {
    this.opts = opts;
    this.child = null;
    this.port = null;
    this.exited = false;
    this.exitInfo = null;
    this.stopping = false;
    this.exitPromise = null;
  }

  /** Starts the backend on `port` and resolves once it reports healthy. */
  async start(port) {
    this.port = port;
    const env = {
      ...process.env,
      ...this.opts.env,
      GENESIS_HOST: LOOPBACK,
      GENESIS_PORT: String(port),
      NODE_ENV: 'production'
    };
    if (this.opts.runAsNode !== false) env.ELECTRON_RUN_AS_NODE = '1';
    if (this.opts.childLogPath) env.GENESIS_CHILD_LOG = this.opts.childLogPath;

    this.child = spawn(this.opts.nodeExecutable, [this.opts.serverEntry], {
      cwd: this.opts.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });

    const log = this.opts.onLog || (() => {});
    const forward = (prefix) => (buf) => {
      String(buf).split(/\r?\n/).filter(Boolean).forEach((l) => log(`${prefix}${l}`));
    };
    this.child.stdout.on('data', forward(''));
    this.child.stderr.on('data', forward('[stderr] '));

    this.exitPromise = new Promise((resolve) => {
      this.child.on('exit', (code, signal) => {
        this.exited = true;
        this.exitInfo = { code, signal };
        resolve(this.exitInfo);
      });
      this.child.on('error', (err) => {
        this.exited = true;
        this.exitInfo = { code: null, signal: null, error: err };
        resolve(this.exitInfo);
      });
    });

    try {
      await waitForHealth({
        port,
        timeoutMs: this.opts.startupTimeoutMs || 25000,
        isAlive: () => !this.exited
      });
    } catch (err) {
      if (this.exited && this.exitInfo) {
        const detail = this.exitInfo.error
          ? `spawn error: ${this.exitInfo.error.message}`
          : `exit code ${this.exitInfo.code}${this.exitInfo.signal ? `, signal ${this.exitInfo.signal}` : ''}`;
        throw new Error(`${err.message} (${detail})`);
      }
      throw err;
    }
    return port;
  }

  /**
   * Stops the backend. Asks it to shut down over IPC first (works on Windows),
   * then terminates it if it is still running after graceTimeoutMs.
   */
  async stop(graceTimeoutMs = 5000) {
    if (!this.child || this.exited) return this.exitInfo;
    this.stopping = true;
    try {
      if (this.child.connected) this.child.send('shutdown');
    } catch (_) { /* channel already closed */ }

    const timer = new Promise((resolve) => setTimeout(() => resolve('timeout'), graceTimeoutMs));
    const result = await Promise.race([this.exitPromise, timer]);
    if (result === 'timeout' && !this.exited) {
      try { this.child.kill('SIGKILL'); } catch (_) { /* ignore */ }
      await this.exitPromise;
    }
    return this.exitInfo;
  }
}

module.exports = {
  BackendProcess,
  findFreePort,
  waitForHealth,
  EXPECTED_APP_ID,
  LOOPBACK
};
