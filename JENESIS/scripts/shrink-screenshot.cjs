#!/usr/bin/env node
/**
 * Halves a screenshot so it can live in the repository.
 *
 * The smoke test saves a full-size BMP of every window it verifies. Those are
 * published with the release, but a release asset cannot be downloaded from
 * every environment, so a smaller copy is committed to the branch as well —
 * small enough to keep in git, large enough to see what the window shows.
 *
 * Only the format this project writes is handled: 32-bit BGRA, top row first.
 *
 * Usage: node scripts/shrink-screenshot.cjs <input.bmp> <output.bmp>
 */
const fs = require('fs');

function readBmp(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 54 || buf.toString('ascii', 0, 2) !== 'BM') throw new Error(`${file} is not a BMP`);
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const height = buf.readInt32LE(22);
  const bits = buf.readUInt16LE(28);
  if (bits !== 32) throw new Error(`${file} is ${bits}-bit; only 32-bit is handled`);
  const topDown = height < 0;
  const rows = Math.abs(height);
  const stride = width * 4;
  if (offset + stride * rows > buf.length) throw new Error(`${file} is shorter than its header claims`);

  const pixels = Buffer.allocUnsafe(stride * rows);
  for (let y = 0; y < rows; y++) {
    const source = topDown ? offset + y * stride : offset + (rows - 1 - y) * stride;
    buf.copy(pixels, y * stride, source, source + stride);
  }
  return { width, height: rows, pixels };
}

function writeBmp(file, width, height, pixels) {
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(-height, 22); // negative: the top row is stored first
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(32, 28);
  header.writeUInt32LE(pixels.length, 34);
  fs.writeFileSync(file, Buffer.concat([header, pixels]));
}

function halve({ width, height, pixels }) {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const out = Buffer.allocUnsafe(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let channel = 0; channel < 4; channel++) {
        const a = pixels[((y * 2) * width + x * 2) * 4 + channel];
        const b = pixels[((y * 2) * width + x * 2 + 1) * 4 + channel];
        const c = pixels[((y * 2 + 1) * width + x * 2) * 4 + channel];
        const d = pixels[((y * 2 + 1) * width + x * 2 + 1) * 4 + channel];
        out[(y * w + x) * 4 + channel] = (a + b + c + d) >> 2;
      }
    }
  }
  return { width: w, height: h, pixels: out };
}

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/shrink-screenshot.cjs <input.bmp> <output.bmp>');
  process.exit(2);
}
const image = halve(readBmp(input));
writeBmp(output, image.width, image.height, image.pixels);
console.log(`${output}: ${image.width}x${image.height}`);
