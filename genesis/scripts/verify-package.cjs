#!/usr/bin/env node
'use strict';
/**
 * Verifies a packaged GENESIS build before it is released.
 *
 * Usage: node scripts/verify-package.cjs <path-to-win-unpacked-folder>
 *
 * Checks the folder electron-builder produces (resources/app.asar and its unpacked
 * native modules), without running the application. It fails if the build contains
 * test code, Electron itself inside the app, a bundled database, or is missing the
 * SQLite native binary.
 */
const fs = require('fs');
const path = require('path');

function readAsarIndex(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    // asar header: pickle of [size, headerPickleSize, headerStringSize, stringLength], then JSON.
    const jsonLength = head.readUInt32LE(12);
    const json = Buffer.alloc(jsonLength);
    fs.readSync(fd, json, 0, jsonLength, 16);
    return JSON.parse(json.toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

/** Returns the entry for a slash-separated path inside the archive index, or null. */
function lookup(index, rel) {
  let node = index;
  for (const part of rel.split('/').filter(Boolean)) {
    if (!node.files || !Object.prototype.hasOwnProperty.call(node.files, part)) return null;
    node = node.files[part];
  }
  return node;
}

function listFiles(node, prefix = '', out = []) {
  if (node.files) {
    for (const [name, child] of Object.entries(node.files)) listFiles(child, prefix ? `${prefix}/${name}` : name, out);
  } else {
    out.push(prefix);
  }
  return out;
}

function asarPath(unpackedDir) {
  return path.join(unpackedDir, 'resources', 'app.asar');
}

function run(unpackedDir) {
  const problems = [];
  const ok = [];
  const need = (cond, msg) => (cond ? ok.push(msg) : problems.push(msg));

  const exe = path.join(unpackedDir, 'GENESIS.exe');
  need(fs.existsSync(exe), 'GENESIS.exe present');

  const asar = path.join(unpackedDir, 'resources', 'app.asar');
  need(fs.existsSync(asar), 'resources/app.asar present');
  need(!fs.existsSync(path.join(unpackedDir, 'resources', 'seed')), 'no bundled seed database folder');

  const nativeBinary = path.join(unpackedDir, 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  need(fs.existsSync(nativeBinary), 'SQLite native binary unpacked (better_sqlite3.node)');

  if (fs.existsSync(asar)) {
    const index = readAsarIndex(asar);
    const required = [
      'electron/main.cjs',
      'electron/preload.cjs',
      'electron/backend-manager.cjs',
      'electron/data-location.cjs',
      'server/index.js',
      'server/db.js',
      'server/auth.js',
      'server/routes/api.js',
      'dist/index.html',
      'package.json',
      'node_modules/express/package.json',
      'node_modules/better-sqlite3/package.json'
    ];
    for (const rel of required) need(lookup(index, rel) && !lookup(index, rel).files, `app contains ${rel}`);

    const forbidden = [
      { prefix: 'tests', why: 'test code' },
      { prefix: 'node_modules/electron', why: 'the Electron development package' },
      { prefix: 'node_modules/electron-builder', why: 'the packaging tool' },
      { prefix: 'node_modules/vite', why: 'the build tool' },
      { prefix: 'genesis.db', why: 'a bundled database with business data' },
      { prefix: 'seed', why: 'a bundled database seed folder' }
    ];
    const files = listFiles(index);
    for (const f of forbidden) {
      const hit = files.find((p) => p === f.prefix || p.startsWith(`${f.prefix}/`));
      need(!hit, `app does not contain ${f.why}${hit ? ` (found ${hit})` : ''}`);
    }
    const dbs = files.filter((p) => p.endsWith('.db') || p.endsWith('.db-wal') || p.endsWith('.db-shm'));
    need(dbs.length === 0, `app does not contain database files (${dbs.length} found)`);
  }

  ok.forEach((m) => console.log(`PASS  ${m}`));
  problems.forEach((m) => console.log(`FAIL  ${m}`));
  if (problems.length > 0 && fs.existsSync(unpackedDir)) {
    // Diagnostics for failed packaging runs: show what the folder actually contains.
    console.log(`\nContents of ${unpackedDir} (top level):`);
    for (const e of fs.readdirSync(unpackedDir)) console.log(`  ${e}`);
    if (fs.existsSync(asarPath(unpackedDir))) {
      const top = Object.keys(readAsarIndex(asarPath(unpackedDir)).files || {});
      console.log(`app.asar top level: ${top.join(', ')}`);
    }
  }
  console.log(problems.length === 0 ? '\nPackage verification passed.' : `\nPackage verification FAILED (${problems.length} problem(s)).`);
  return problems.length === 0;
}

module.exports = { readAsarIndex, lookup, listFiles, run };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/verify-package.cjs <win-unpacked folder>');
    process.exit(2);
  }
  process.exit(run(path.resolve(dir)) ? 0 : 1);
}
