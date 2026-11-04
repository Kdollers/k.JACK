'use strict';
/**
 * Finding the other JENESIS computers, keeping a list of them, and saying
 * plainly what is wrong when one cannot be reached.
 *
 * Modification 6 asks Network & Maintenance to do four things over the local
 * network: discover the other computers, let an administrator register one,
 * connect to and disconnect from it, and watch whether it is still there —
 * with a message a person can act on when it is not.
 *
 * How discovery works
 * -------------------
 * A JENESIS service that has been allowed on the network announces itself by
 * UDP broadcast every few seconds, and answers a probe with the same
 * announcement. A service looking for its neighbours broadcasts one probe and
 * collects the answers.
 *
 * The announcement carries only what a colleague needs to know where to knock:
 * a computer name, an address, a port, a version. No token, no user, no
 * company, no database path. Discovery is a door number, not a key — reaching
 * anything still takes a session and a permission.
 *
 * Nothing here runs while the network switch is off: with it off the service
 * neither announces nor answers, which is what keeps the accounting data off
 * the wire until an administrator decides otherwise.
 *
 * A note on honesty: this module is tested by starting two real services and
 * having one find the other. That proves the mechanism. It does not prove two
 * physical computers, which needs two machines on a real network — see
 * scripts/messenger-two-computers.cjs for that proof.
 */
const dgram = require('dgram');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const REGISTRY_NAME = 'computers.json';
const DISCOVERY_PORT = 41235;
const BROADCAST_ADDRESS = '255.255.255.255';
const BEACON_INTERVAL_MS = 15000;
const DISCOVER_TIMEOUT_MS = 3000;
const PROBE_TIMEOUT_MS = 4000;
const PROTOCOL = 'jenesis-discovery-1';

// ---------------------------------------------------------------------------
// The list of known computers
// ---------------------------------------------------------------------------
function registryPath(dataDir) {
  return path.join(dataDir || '.', REGISTRY_NAME);
}

/** Reads the registry. A missing or damaged file means "none known yet". */
function readRegistry(dataDir) {
  if (!dataDir) return { computers: [], damaged: false };
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(dataDir), 'utf8'));
    const list = Array.isArray(parsed && parsed.computers) ? parsed.computers : [];
    return { computers: list.filter((c) => c && typeof c.address === 'string'), damaged: false };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { computers: [], damaged: false };
    // A file we cannot read is not a reason to lose the application; it is a
    // reason to tell the user their configuration is damaged.
    return { computers: [], damaged: true };
  }
}

/** Writes the registry atomically, so a crash cannot leave half a file. */
function writeRegistry(dataDir, computers) {
  const target = registryPath(dataDir);
  const temp = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, JSON.stringify({ computers, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  fs.renameSync(temp, target);
  return { computers };
}

function newId() {
  return `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Adds a computer, or refreshes it when the same address is already known. */
function addComputer(dataDir, { name, address, port }) {
  const { computers } = readRegistry(dataDir);
  const existing = computers.find((c) => c.address === address && Number(c.port) === Number(port));
  if (existing) {
    return updateComputer(dataDir, existing.id, { name: name || existing.name });
  }
  const entry = {
    id: newId(),
    name: name || `${address}:${port}`,
    address,
    port: Number(port),
    addedAt: new Date().toISOString(),
    lastSeenAt: null,
    lastStatus: 'UNKNOWN'
  };
  const next = [...computers, entry];
  writeRegistry(dataDir, next);
  return { computers: next, computer: entry };
}

function updateComputer(dataDir, id, patch) {
  const { computers } = readRegistry(dataDir);
  const next = computers.map((c) => (c.id === id ? { ...c, ...patch } : c));
  writeRegistry(dataDir, next);
  return { computers: next, computer: next.find((c) => c.id === id) || null };
}

function forgetComputer(dataDir, id) {
  const { computers } = readRegistry(dataDir);
  const next = computers.filter((c) => c.id !== id);
  writeRegistry(dataDir, next);
  return { computers: next, removed: computers.length !== next.length };
}

// ---------------------------------------------------------------------------
// Announcing this computer, and listening for others
// ---------------------------------------------------------------------------
/** What this computer says about itself. No secret is ever included. */
function announcement({ computerId, computerName, port, version }) {
  return {
    protocol: PROTOCOL,
    type: 'announce',
    computerId,
    name: computerName || os.hostname(),
    address: null, // filled by the receiver: it knows where the packet came from
    port: Number(port),
    version: version || null
  };
}

/**
 * Starts announcing this computer on the network.
 *
 * Returns a handle with stop(). Silently does nothing when the network switch
 * is off — that is the whole point of the switch.
 */
function startBeacon({ dataDir, port, computerId, computerName, version, isAllowed }) {
  if (!isAllowed || !isAllowed()) {
    return { running: false, stop() {} };
  }
  let socket = null;
  let timer = null;
  try {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  } catch (_) {
    return { running: false, stop() {} };
  }

  const reply = (remote) => {
    const payload = Buffer.from(JSON.stringify(announcement({ computerId, computerName, port, version })));
    try {
      socket.send(payload, remote.port, remote.address);
    } catch (_) { /* a peer that has gone away is not an error */ }
  };

  socket.on('message', (message, remote) => {
    let parsed = null;
    try { parsed = JSON.parse(message.toString('utf8')); } catch (_) { return; }
    if (!parsed || parsed.protocol !== PROTOCOL) return;
    if (parsed.type === 'probe' || parsed.type === 'announce') {
      if (parsed.computerId && parsed.computerId === computerId) return; // that is us
      if (parsed.type === 'probe') reply(remote);
    }
  });

  socket.on('error', () => { /* the network may not permit broadcast; ignore */ });

  socket.bind(DISCOVERY_PORT, () => {
    try { socket.setBroadcast(true); } catch (_) { /* best effort */ }
  });

  timer = setInterval(() => {
    if (!isAllowed()) return;
    const payload = Buffer.from(JSON.stringify(announcement({ computerId, computerName, port, version })));
    try {
      socket.send(payload, DISCOVERY_PORT, BROADCAST_ADDRESS);
    } catch (_) { /* nothing to do if the network refuses */ }
  }, BEACON_INTERVAL_MS);
  if (timer.unref) timer.unref();

  return {
    running: true,
    stop() {
      if (timer) clearInterval(timer);
      try { if (socket) socket.close(); } catch (_) { /* already closed */ }
    }
  };
}

/**
 * Broadcasts one probe and collects the answers.
 *
 * Resolves with the computers that answered — each one already carrying the
 * address the packet came from, which is more trustworthy than whatever a
 * machine claims about itself.
 */
function discover({ timeoutMs = DISCOVER_TIMEOUT_MS, computerId } = {}) {
  return new Promise((resolve) => {
    const found = new Map();
    let socket;
    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    } catch (_) {
      return resolve([]);
    }

    const finish = () => {
      try { socket.close(); } catch (_) { /* already closed */ }
      resolve([...found.values()].sort((a, b) => a.address.localeCompare(b.address)));
    };

    const timer = setTimeout(finish, timeoutMs);
    if (timer.unref) timer.unref();

    socket.on('message', (message, remote) => {
      let parsed = null;
      try { parsed = JSON.parse(message.toString('utf8')); } catch (_) { return; }
      if (!parsed || parsed.protocol !== PROTOCOL || parsed.type !== 'announce') return;
      if (parsed.computerId && computerId && parsed.computerId === computerId) return; // ourselves
      found.set(`${remote.address}:${parsed.port}`, {
        computerId: parsed.computerId || null,
        name: parsed.name || remote.address,
        address: remote.address,
        port: Number(parsed.port) || 3000,
        version: parsed.version || null
      });
    });

    socket.on('error', () => { clearTimeout(timer); finish(); });

    socket.bind(0, () => {
      try { socket.setBroadcast(true); } catch (_) { /* best effort */ }
      const payload = Buffer.from(JSON.stringify({ protocol: PROTOCOL, type: 'probe' }));
      try {
        socket.send(payload, DISCOVERY_PORT, BROADCAST_ADDRESS);
      } catch (_) {
        clearTimeout(timer);
        finish();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Is a computer there, and can we use it?
// ---------------------------------------------------------------------------
/**
 * The reasons a connection can fail, each with a message a person can act on.
 * The interface translates these; the text here is the fallback and the
 * explanation of what the code means.
 */
const DIAGNOSES = {
  ONLINE: 'The computer answered. It is running JENESIS and you can connect to it.',
  UNREACHABLE: 'Nothing answered at that address. The computer may be switched off, asleep, or not on this network.',
  REFUSED: 'The computer is on the network but nothing is listening on that port. JENESIS may not be running there.',
  NOT_JENESIS: 'Something answered at that address, but it is not a JENESIS service.',
  VERSION_MISMATCH: 'The other computer is running a different version of JENESIS. Update both to the same version before sharing data.',
  TIMEOUT: 'The computer did not answer in time. The network may be slow or busy — try again.',
  BAD_ADDRESS: 'That address is not one a computer can be reached at. It should look like 192.168.1.20.',
  LAN_DISABLED: 'This computer is not allowed on the network. Turn the network switch on in Network & Maintenance first.'
};

/** True for something that could be an address: a name or an IPv4 literal. */
function looksLikeAddress(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const host = value.trim();
  if (host.length > 253) return false;
  if (/[^A-Za-z0-9._-]/.test(host)) return false;
  return true;
}

/**
 * Asks one computer whether it is a JENESIS service.
 *
 * A successful answer proves two things: something is listening, and it is
 * JENESIS (it advertises the handshake id). It deliberately does NOT prove
 * that this user may use it — that takes signing in, and is checked then.
 */
function probeComputer({ address, port = 3000, timeoutMs = PROBE_TIMEOUT_MS, expectVersion = null }) {
  return new Promise((resolve) => {
    if (!looksLikeAddress(address)) {
      return resolve({ status: 'BAD_ADDRESS', code: 'BAD_ADDRESS', message: DIAGNOSES.BAD_ADDRESS });
    }
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return resolve({ status: 'BAD_ADDRESS', code: 'BAD_ADDRESS', message: DIAGNOSES.BAD_ADDRESS });
    }

    const req = http.request({
      host: address,
      port: portNumber,
      path: '/api/health',
      method: 'GET',
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(data); } catch (_) { /* not JSON */ }
        const isJenesis = !!body && body.appId === 'genesis-accounting';
        if (!isJenesis) {
          return resolve({ status: 'NOT_JENESIS', code: 'NOT_JENESIS', message: DIAGNOSES.NOT_JENESIS });
        }
        if (expectVersion && body.version && body.version !== expectVersion) {
          return resolve({
            status: 'VERSION_MISMATCH', code: 'VERSION_MISMATCH', message: DIAGNOSES.VERSION_MISMATCH,
            version: body.version
          });
        }
        resolve({
          status: 'ONLINE', code: 'ONLINE', message: DIAGNOSES.ONLINE,
          version: body.version || null,
          application: body.application || null
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'TIMEOUT', code: 'TIMEOUT', message: DIAGNOSES.TIMEOUT });
    });
    req.on('error', (err) => {
      const code = err && (err.code === 'ECONNREFUSED' ? 'REFUSED' : err.code === 'ENOTFOUND' || err.code === 'EHOSTUNREACH' ? 'UNREACHABLE' : 'UNREACHABLE');
      resolve({ status: code, code, message: DIAGNOSES[code] || DIAGNOSES.UNREACHABLE });
    });
    req.end();
  });
}

/** Probes every registered computer and records what it found. */
async function refreshRegistry(dataDir, { expectVersion = null } = {}) {
  const { computers, damaged } = readRegistry(dataDir);
  const results = [];
  for (const computer of computers) {
    // Deliberately sequential: probing a handful of addresses at once is fine,
    // and it keeps the answers in a readable order.
    // eslint-disable-next-line no-await-in-loop
    const probe = await probeComputer({ address: computer.address, port: computer.port, expectVersion });
    results.push({
      ...computer,
      lastStatus: probe.status,
      lastMessage: probe.message,
      version: probe.version || null,
      lastSeenAt: probe.status === 'ONLINE' ? new Date().toISOString() : computer.lastSeenAt
    });
  }
  writeRegistry(dataDir, results.map(({ id, name, address, port, addedAt, lastSeenAt, lastStatus }) => ({
    id, name, address, port, addedAt, lastSeenAt, lastStatus
  })));
  return { computers: results, damaged };
}

module.exports = {
  REGISTRY_NAME,
  DISCOVERY_PORT,
  PROTOCOL,
  DIAGNOSES,
  registryPath,
  readRegistry,
  writeRegistry,
  addComputer,
  updateComputer,
  forgetComputer,
  startBeacon,
  discover,
  probeComputer,
  refreshRegistry,
  looksLikeAddress
};
