'use strict';
/**
 * Explicit LAN hosting: one SQLite-owning backend serves BOTH the desktop and
 * opt-in, TLS-only browser clients. Do not sync or copy a live database.
 * No socket is opened on a LAN interface until a local network-mode operator
 * enables it. The certificate/key stay in the user's private data directory.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
// Certificate creation uses WebCrypto signing; no shell/OpenSSL dependency or
// vulnerable PKCS#1 verifier is shipped with the installed application.
require('reflect-metadata');
const x509 = require('@peculiar/x509');
x509.cryptoProvider.set(crypto.webcrypto);

const DEFAULT_LAN_PORT = 34671;
const failure = (code) => Object.assign(new Error(code), { code });
function ipv4(address) {
  return address?.startsWith('::ffff:') ? address.slice(7) : address;
}
function isLoopback(address) {
  const ip = ipv4(address);
  return ip === '::1' || (net.isIP(ip) === 4 && ip.startsWith('127.'));
}
function isPrivateLan(address) {
  const ip = ipv4(address);
  if (net.isIP(ip) !== 4) return false;
  const [first, second] = ip.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
function lanAddresses() {
  const addresses = new Set();
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) {
      if (!item.internal && item.family === 'IPv4' && isPrivateLan(item.address)) addresses.add(item.address);
    }
  }
  return [...addresses].sort();
}
function pem(label, bytes) {
  const base64 = Buffer.from(bytes).toString('base64');
  return `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}
async function readIdentity(directory, addresses) {
  const dir = path.join(directory, 'lan-identity');
  const keyPath = path.join(dir, 'server-key.pem');
  const certPath = path.join(dir, 'server-cert.pem');
  const hasKey = fs.existsSync(keyPath);
  const hasCert = fs.existsSync(certPath);
  if (hasKey !== hasCert) throw failure('LAN_IDENTITY_INCOMPLETE');
  if (!hasKey) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const algorithm = {
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1])
    };
    const keys = await crypto.webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const signed = await x509.X509CertificateGenerator.createSelfSigned({
      name: 'CN=JENESIS local host', keys, signingAlgorithm: algorithm,
      serialNumber: `01${crypto.randomBytes(16).toString('hex')}`,
      notBefore: new Date(Date.now() - 60 * 60 * 1000),
      notAfter: new Date(Date.now() + 365 * 5 * 24 * 60 * 60 * 1000),
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature |
          x509.KeyUsageFlags.keyEncipherment, true),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
        new x509.SubjectAlternativeNameExtension([
          { type: 'dns', value: 'localhost' },
          { type: 'ip', value: '127.0.0.1' },
          ...addresses.map((ip) => ({ type: 'ip', value: ip }))
        ])
      ]
    }, crypto.webcrypto);
    const privateDer = await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    // Exclusive creation; never rotate a configured host identity silently.
    fs.writeFileSync(keyPath, pem('PRIVATE KEY', privateDer), { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(certPath, signed.toString('pem'), { flag: 'wx', mode: 0o600 });
  }
  const key = fs.readFileSync(keyPath, 'utf8');
  const cert = fs.readFileSync(certPath, 'utf8');
  const parsed = new crypto.X509Certificate(cert);
  if (!parsed.checkPrivateKey(crypto.createPrivateKey(key)) || new Date(parsed.validTo) <= new Date()) {
    throw failure('LAN_IDENTITY_INVALID');
  }
  // An IP change cannot silently yield a TLS name mismatch: stop and ask the
  // operator to set up a new address/identity explicitly on the host.
  if (addresses.some((ip) => !parsed.checkIP(ip))) throw failure('LAN_ADDRESS_CHANGED');
  return { key, cert, fingerprint: parsed.fingerprint256, expiresAt: parsed.validTo };
}

class LanHost {
  constructor({ addressProvider = lanAddresses } = {}) {
    this.addressProvider = addressProvider;
    this.app = null;
    this.server = null;
    this.configPath = null;
    this.port = DEFAULT_LAN_PORT;
    this.identity = null;
    this.errorCode = null;
    this.queue = Promise.resolve();
  }
  enqueue(operation) {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => {});
    return next;
  }
  attach(app, dbPath, { lanPort = DEFAULT_LAN_PORT } = {}) {
    if (this.app) throw failure('LAN_ALREADY_ATTACHED');
    if (dbPath === ':memory:') throw failure('LAN_PERSISTENT_DATABASE_REQUIRED');
    this.app = app;
    this.configPath = path.join(path.dirname(dbPath), 'lan-host.json');
    this.port = lanPort;
    this.errorCode = null;
    this.identity = null;
  }
  configured() {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf8')).enabled === true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw failure('LAN_CONFIG_INVALID');
    }
  }
  saveConfig(enabled) {
    const temp = `${this.configPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ enabled }), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, this.configPath);
    } finally { try { fs.unlinkSync(temp); } catch (_) { /* already renamed */ } }
  }
  status() {
    const detected = this.addressProvider();
    const addresses = this.identity
      ? detected.filter((ip) => new crypto.X509Certificate(this.identity.cert).checkIP(ip))
      : detected;
    const port = this.server?.address()?.port || this.port;
    return {
      enabled: !!this.server?.listening,
      configured: this.configured(),
      errorCode: this.identity && addresses.length !== detected.length ? 'LAN_ADDRESS_CHANGED' : this.errorCode,
      fingerprintSha256: this.identity?.fingerprint || null,
      expiresAt: this.identity?.expiresAt || null,
      // No WAN, loopback-only or non-TLS URLs. Address is for the operator to
      // copy to a client, which must verify the fingerprint out of band.
      addresses: addresses.map((ip) => `https://${ip}:${port}`)
    };
  }
  enable(options = {}) { return this.enqueue(() => this._enable(options)); }
  async _enable({ persist = true } = {}) {
    if (!this.app) throw failure('LAN_NOT_AVAILABLE');
    if (this.server?.listening) return this.status();
    const addresses = this.addressProvider();
    if (!addresses.length) throw failure('LAN_NO_PRIVATE_INTERFACE');
    const identity = await readIdentity(path.dirname(this.configPath), addresses);
    const server = https.createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2' }, this.app);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, '0.0.0.0', () => {
          server.off('error', reject);
          resolve();
        });
      });
      this.server = server;
      this.identity = identity;
      if (persist) this.saveConfig(true);
      this.errorCode = null;
      return this.status();
    } catch (err) {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      this.server = null;
      this.identity = null;
      throw failure(err.code === 'EADDRINUSE' ? 'LAN_PORT_BUSY' : (err.code?.startsWith('LAN_') ? err.code : 'LAN_START_FAILED'));
    }
  }
  disable(options = {}) { return this.enqueue(() => this._disable(options)); }
  async _disable({ persist = true } = {}) {
    const server = this.server;
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
        if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      });
    }
    this.server = null;
    this.identity = null;
    this.errorCode = null;
    if (persist) this.saveConfig(false);
    return this.status();
  }
  async resume() {
    try {
      if (this.configured()) await this.enable({ persist: false });
    } catch (err) {
      this.errorCode = err.code || 'LAN_START_FAILED';
      console.error('[JENESIS] LAN hosting not started:', this.errorCode);
    }
  }
  async detach() {
    await this.disable({ persist: false });
    this.app = null;
    this.configPath = null;
  }
}

const lanHost = new LanHost();
module.exports = { lanHost, LanHost, isLoopback, isPrivateLan, lanAddresses, DEFAULT_LAN_PORT };
