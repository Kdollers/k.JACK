#!/usr/bin/env node
/**
 * Turns one of the smoke test's BMP screenshots into a PNG.
 *
 * The smoke test writes BMPs because that can be done with nothing but the GDI
 * calls it already makes — System.Drawing is not available on every Windows
 * runner. A 32-bit BMP is awkward to view afterwards, so this converts one.
 * Only the format this project writes is handled: 32-bit BGRA, top row first.
 *
 * Usage: node scripts/bmp-to-png.cjs <input.bmp> <output.png>
 */
const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/bmp-to-png.cjs <input.bmp> <output.png>');
  process.exit(2);
}

const bmp = fs.readFileSync(input);
if (bmp.length < 54 || bmp.toString('ascii', 0, 2) !== 'BM') throw new Error(`${input} is not a BMP`);
const offset = bmp.readUInt32LE(10);
const width = bmp.readInt32LE(18);
const raw = bmp.readInt32LE(22);
const height = Math.abs(raw);
const topDown = raw < 0;
if (bmp.readUInt16LE(28) !== 32) throw new Error(`${input} is not 32-bit`);

const stride = width * 4;
// Every scan line is prefixed with its filter type; 0 means "unfiltered".
const lines = Buffer.alloc(height * (stride + 1));
for (let y = 0; y < height; y++) {
  const target = y * (stride + 1);
  lines[target] = 0;
  const source = topDown ? offset + y * stride : offset + (height - 1 - y) * stride;
  for (let x = 0; x < width; x++) {
    const from = source + x * 4;
    const to = target + 1 + x * 4;
    lines[to] = bmp[from + 2];     // B, G, R -> R
    lines[to + 1] = bmp[from + 1]; // G
    lines[to + 2] = bmp[from];     // R -> B
    lines[to + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // colour type: RGBA
ihdr[10] = 0; // deflate
ihdr[11] = 0; // adaptive filtering
ihdr[12] = 0; // no interlace

fs.writeFileSync(
  output,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(lines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
);
console.log(`${output}: ${width}x${height}`);
