'use strict';
/**
 * network-config.js — whether the JENESIS service answers on the local network.
 *
 * Default: NO. The service binds the loopback interface only, which is why the
 * accounting data has never been reachable from another machine. Two computers
 * can only exchange Messenger messages (and share one company database) when an
 * administrator or a maintenance user deliberately allows it here — the switch
 * lives in the JENESIS Maintenance application.
 *
 * The choice is stored next to the database (<data>/network.json), never in the
 * installation folder, so it survives updates and is not shared between users.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_NAME = 'network.json';
const LOOPBACK = '127.0.0.1';
const ANY_ADDRESS = '0.0.0.0';

function networkConfigPath(dataDir) {
  return path.join(dataDir || '.', CONFIG_NAME);
}

/** Reads the configuration; anything missing or unreadable means "off". */
function readNetworkConfig(dataDir) {
  const defaults = { allowLan: false };
  try {
    const raw = fs.readFileSync(networkConfigPath(dataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return { allowLan: parsed && parsed.allowLan === true, updatedAt: parsed && parsed.updatedAt };
  } catch (_) {
    return defaults;
  }
}

/** Writes the configuration atomically (a crash must not half-write it). */
function writeNetworkConfig(dataDir, { allowLan }) {
  const target = networkConfigPath(dataDir);
  const temp = `${target}.tmp`;
  const payload = JSON.stringify(
    { allowLan: allowLan === true, updatedAt: new Date().toISOString() },
    null,
    2
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temp, payload, 'utf8');
  fs.renameSync(temp, target);
  return readNetworkConfig(dataDir);
}

/** The address the server binds: the whole network only when it is allowed. */
function bindHost(config) {
  return config && config.allowLan ? ANY_ADDRESS : LOOPBACK;
}

/**
 * The addresses another computer can use to reach this one. Loopback is
 * excluded: those entries are useless to a colleague on the network.
 */
function lanAddresses() {
  const out = [];
  const interfaces = os.networkInterfaces() || {};
  for (const list of Object.values(interfaces)) {
    for (const net of list || []) {
      if (!net || net.family !== 'IPv4' || net.internal) continue;
      out.push(net.address);
    }
  }
  return out.sort();
}

/** The data directory the service uses (the database lives there too). */
function dataDirectoryFromEnv(env = process.env) {
  if (env.GENESIS_DATA_DIR) return env.GENESIS_DATA_DIR;
  if (env.GENESIS_DB_PATH) return path.dirname(env.GENESIS_DB_PATH);
  return null;
}

module.exports = {
  CONFIG_NAME,
  LOOPBACK,
  ANY_ADDRESS,
  networkConfigPath,
  readNetworkConfig,
  writeNetworkConfig,
  bindHost,
  lanAddresses,
  dataDirectoryFromEnv
};
