#!/usr/bin/env node
'use strict';
/** Build a versioned, database-free project archive from this checkout.
 * The original GEN 0.4.zip contains historical users and business records;
 * never copy that database, node_modules, backups, installer or secrets into
 * this archive. The built web UI is included so the server can serve it.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const ROOT = path.resolve(__dirname, '..');
const PACKAGE = require(path.join(ROOT, 'package.json'));
const PREFIX = 'GENESIS-0.4/';
const OUTPUT = path.resolve(ROOT, '..', `GEN ${PACKAGE.version}.zip`);
const TOP_FILES = ['.gitignore', 'README.md', 'DESKTOP.md', 'index.html',
  'package.json', 'package-lock.json', 'postcss.config.js',
  'tailwind.config.js', 'vite.config.js'];
const DIRS = ['assets', 'electron', 'server', 'src', 'scripts', 'tests', 'dist'];
const ALLOWED_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.jsx', '.json',
  '.css', '.html', '.md', '.ps1', '.py', '.png', '.ico']);
const BLOCKED_NAMES = new Set(['node_modules', 'backups', 'release', 'build',
  'coverage', '__pycache__', '.git', '.env', '.env.local', 'genesis.db']);

function safe(relative) {
  const parts = relative.split(/[\\/]/);
  return !parts.some((part) => !part || part === '..' || BLOCKED_NAMES.has(part) ||
    part.startsWith('.env') || part.endsWith('.db') || part.endsWith('.db-wal') ||
    part.endsWith('.db-shm') || part.endsWith('.sqlite') || part.endsWith('.sqlite3'));
}

function collect(base, files = []) {
  for (const entry of fs.readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(base, entry.name);
    const relative = path.relative(ROOT, absolute).replaceAll('\\', '/');
    if (!safe(relative) || entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${relative}`);
    if (entry.isDirectory()) collect(absolute, files);
    else if (entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(relative);
  }
  return files;
}

function verify(zip) {
  // AdmZip.test() is broken in the pinned version (it indexes entries by
  // object rather than integer); reading each entry checks decompression here.
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  for (const entry of entries) {
    const data = entry.getData();
    assert.ok(Buffer.isBuffer(data) && data.length === entry.header.size,
      `corrupt ZIP entry: ${entry.entryName}`);
  }
  const names = entries.map((entry) => entry.entryName);
  assert.equal(new Set(names).size, names.length, 'duplicate ZIP paths');
  for (const name of names) {
    assert.ok(name.startsWith(PREFIX) && safe(name.slice(PREFIX.length)), `unsafe path in ZIP: ${name}`);
    assert.ok(!name.includes('node_modules/') && !name.includes('backups/'), `private data in ZIP: ${name}`);
  }
  for (const required of ['package.json', 'package-lock.json', 'README.md', 'DESKTOP.md',
    'assets/icon.ico', 'electron/main.cjs', 'server/index.js', 'scripts/recover-administrator.cjs',
    'src/i18n/en.json', 'src/i18n/fr.json', 'src/i18n/rw.json', 'dist/index.html']) {
    assert.ok(names.includes(PREFIX + required), `missing ${required} in ZIP`);
  }
  const manifest = JSON.parse(zip.getEntry(PREFIX + 'package.json').getData().toString('utf8'));
  assert.equal(manifest.version, PACKAGE.version, 'archive manifest version mismatch');
  console.log(`Verified ${names.length} files; no database, backups, dependencies or secrets included.`);
}

function main() {
  const zip = new AdmZip();
  for (const relative of [...TOP_FILES, ...DIRS.flatMap((name) => collect(path.join(ROOT, name)))]) {
    assert.ok(safe(relative), `unsafe source path: ${relative}`);
    const file = path.join(ROOT, relative);
    assert.ok(fs.statSync(file).isFile(), `missing source file: ${relative}`);
    assert.ok(fs.statSync(file).size < 5 * 1024 * 1024, `unexpectedly large source file: ${relative}`);
    zip.addLocalFile(file, path.posix.join(PREFIX, path.posix.dirname(relative)), path.posix.basename(relative));
  }
  verify(zip);
  zip.writeZip(OUTPUT);
  verify(new AdmZip(OUTPUT));
  console.log(`Saved ${OUTPUT}`);
}

main();
