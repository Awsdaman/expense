// Writes the dashboard app icons: a flat cycle strip on the accent green.
// Pure Node (zlib only). Run with: node scripts/make-icons.js
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'icons');

// The mark, in a unit square: a strip from salary day to salary day, filled up to today, with a dot at today.
const BG = [0x2f, 0x6f, 0x4f];
const WHITE = [0xff, 0xff, 0xff];
const STRIP_Y = 0.5;
const STRIP_X0 = 0.2;
const STRIP_X1 = 0.8;
const TODAY_X = 0.62;
const STROKE = 0.032;
const DOT_R = 0.06;
const TRACK_ALPHA = 0.35;

const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

function distToSegment(px, py, x0, x1, y) {
  const cx = Math.min(Math.max(px, x0), x1);
  return Math.hypot(px - cx, py - y);
}

function colorAt(u, v) {
  if (Math.hypot(u - TODAY_X, v - STRIP_Y) <= DOT_R) return WHITE;
  if (distToSegment(u, v, STRIP_X0, TODAY_X, STRIP_Y) <= STROKE / 2) return WHITE;
  if (distToSegment(u, v, STRIP_X0, STRIP_X1, STRIP_Y) <= STROKE / 2) return mix(BG, WHITE, TRACK_ALPHA);
  return BG;
}

// 4x4 supersampling for smooth edges.
function renderRgb(size) {
  const SS = 4;
  const out = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 3;
      out[i] = Math.round(r / (SS * SS));
      out[i + 1] = Math.round(g / (SS * SS));
      out[i + 2] = Math.round(b / (SS * SS));
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, rgb) {
  const stride = size * 3;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const p = (v) => (v * 512).toFixed(1);
  const sw = (STROKE * 512).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2f6f4f"/>
  <line x1="${p(STRIP_X0)}" y1="${p(STRIP_Y)}" x2="${p(STRIP_X1)}" y2="${p(STRIP_Y)}" stroke="#ffffff" stroke-opacity="${TRACK_ALPHA}" stroke-width="${sw}" stroke-linecap="round"/>
  <line x1="${p(STRIP_X0)}" y1="${p(STRIP_Y)}" x2="${p(TODAY_X)}" y2="${p(STRIP_Y)}" stroke="#ffffff" stroke-width="${sw}" stroke-linecap="round"/>
  <circle cx="${p(TODAY_X)}" cy="${p(STRIP_Y)}" r="${p(DOT_R)}" fill="#ffffff"/>
</svg>
`;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon.svg'), svg());
for (const size of [180, 192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), encodePng(size, renderRgb(size)));
  console.log(`wrote icon-${size}.png`);
}
console.log('wrote icon.svg');
