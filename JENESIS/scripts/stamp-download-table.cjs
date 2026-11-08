#!/usr/bin/env node
'use strict';
/**
 * Stamps the measured numbers of THIS build into DOWNLOAD.md.
 *
 * DOWNLOAD.md is published alongside the installer, so it has to describe the
 * file it is shipped next to — not whichever build somebody last typed the
 * numbers in for. The build measures the sizes and the checksums when it makes
 * them; this script copies those measurements into the document.
 *
 * Nothing here is invented. If a number cannot be found in the table the build
 * wrote, the document is left alone and the reason is printed, so a build that
 * cannot measure cannot claim to have measured.
 *
 * The table the build writes rounds sizes to one decimal in megabytes, which
 * is not exact enough to check a download against. Given --dir, the real file
 * is measured as well and the document carries the exact byte count.
 *
 * Usage:
 *   node scripts/stamp-download-table.cjs
 *         --table    release/download-table.md
 *         --download DOWNLOAD.md
 *         --dir      release          (optional: where the built files are)
 *         --run      <github run id>
 *         --commit   <short sha>
 */
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const tablePath = arg('table', path.join('release', 'download-table.md'));
const downloadPath = arg('download', 'DOWNLOAD.md');
const run = arg('run', process.env.GITHUB_RUN_ID || '');
const commit = arg('commit', (process.env.GITHUB_SHA || '').slice(0, 7));
const releaseDir = arg('dir', path.dirname(tablePath));

if (!fs.existsSync(tablePath)) {
  console.log(`stamp-download-table: no ${tablePath} — the build did not measure anything, so nothing was stamped.`);
  process.exit(0);
}
if (!fs.existsSync(downloadPath)) {
  console.log(`stamp-download-table: no ${downloadPath} — nothing to stamp.`);
  process.exit(0);
}

/** `| `JEN 0.5.5 Setup.exe` | 88.8 MB | `abc…` |`  ->  { name, size, hash } */
function parseRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*`([0-9a-f]{64})`\s*\|/.exec(line);
    if (m) rows.push({ name: m[1], size: m[2].trim(), hash: m[3] });
  }
  return rows;
}

const measured = parseRows(fs.readFileSync(tablePath, 'utf8'));
if (measured.length === 0) {
  console.log('stamp-download-table: the table the build wrote has no measured rows — nothing was stamped.');
  process.exit(0);
}

/**
 * `93,077,670 bytes (88.8 MB)` - the exact count a download can be checked
 * against, with the rounded figure beside it for reading.
 */
function describe(name, rounded) {
  try {
    const bytes = fs.statSync(path.join(releaseDir, name)).size;
    return `${bytes.toLocaleString('en-US')} bytes (${rounded})`;
  } catch (_) {
    // The file is not beside the table, so the rounded figure is all there is.
    return rounded;
  }
}

let doc = fs.readFileSync(downloadPath, 'utf8');
let replaced = 0;

// 1. The three published files: rewrite each row from the measurement.
for (const row of measured) {
  const escaped = row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\|\\s*\`${escaped}\`\\s*\\|[^|]*\\|\\s*\`[0-9a-f]*\`\\s*\\|$`, 'm');
  if (pattern.test(doc)) {
    doc = doc.replace(pattern, `| \`${row.name}\` | ${describe(row.name, row.size)} | \`${row.hash}\` |`);
    replaced += 1;
  }
}

// 2. Which build these numbers belong to.
if (run && commit) {
  const before = doc;
  doc = doc.replace(/run \d+, commit `[0-9a-f]+`/g, `run ${run}, commit \`${commit}\``);
  if (doc !== before) replaced += 1;
}

if (replaced === 0) {
  console.log('stamp-download-table: no matching rows or build line in DOWNLOAD.md — nothing was stamped.');
  process.exit(0);
}

fs.writeFileSync(downloadPath, doc);
console.log(`stamp-download-table: ${replaced} place(s) stamped with the measurements of run ${run || '?'}.`);
for (const row of measured) console.log(`  ${row.name}  ${describe(row.name, row.size)}  ${row.hash}`);
