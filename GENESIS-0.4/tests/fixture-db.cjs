'use strict';
// Historical database used ONLY as test input. It lives inside the original
// tracked archive; production packaging must never include it.
const AdmZip = require('adm-zip');
const fs = require('fs');
const os = require('os');
const path = require('path');

function writeLegacyFixture(target) {
  const zip = new AdmZip(path.join(__dirname, '..', '..', 'GEN 0.4.zip'));
  const entry = zip.getEntry('GENESIS-0.4/genesis.db');
  if (!entry) throw new Error('Archived legacy GENESIS database fixture is missing');
  fs.writeFileSync(target, entry.getData(), { flag: 'wx' });
  return target;
}

function legacyFixturePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genesis-legacy-fixture-'));
  const target = writeLegacyFixture(path.join(dir, 'genesis.db'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* ignore */ } });
  return target;
}

module.exports = { writeLegacyFixture, legacyFixturePath };
