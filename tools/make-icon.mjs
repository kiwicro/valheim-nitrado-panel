/**
 * Generates assets/panel.ico — a multi-size Windows icon for the desktop
 * shortcut. Written by hand so the repo needs no image dependencies.
 *
 *   node tools/make-icon.mjs
 *
 * Artwork: a rounded dark tile with an amber chevron, matching the panel theme.
 * Each size is rendered supersampled 4x and averaged down for clean edges.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'panel.ico');
const SIZES = [256, 64, 48, 32, 16];

/* ------------------------------------------------------------ PNG encoding */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------- geometry */

/** Signed distance to a rounded rectangle. Negative is inside. */
function sdRoundRect(px, py, halfW, halfH, radius) {
  const qx = Math.abs(px) - (halfW - radius);
  const qy = Math.abs(py) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Distance from a point to a line segment. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const mix = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------------- render */

function renderMaster(size) {
  const SS = 4;
  const W = size * SS;
  const master = new Float32Array(W * W * 4);

  const half = W / 2;
  const radius = W * 0.22;
  const edge = W * 0.02;
  const halfStroke = W * 0.055;

  const top = [0x24 / 255, 0x2b / 255, 0x3a / 255];
  const bottom = [0x12 / 255, 0x16 / 255, 0x1f / 255];
  const amber = [0xe0 / 255, 0xa9 / 255, 0x4a / 255];

  // Chevron: two strokes meeting at the bottom middle.
  const ax1 = W * 0.30;
  const ay1 = W * 0.27;
  const ax2 = W * 0.5;
  const ay2 = W * 0.75;
  const bx1 = W * 0.70;

  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const sd = sdRoundRect(px - half, py - half, half, half, radius);
      if (sd >= 0) continue;

      const t = y / W;
      let r = mix(top[0], bottom[0], t);
      let g = mix(top[1], bottom[1], t);
      let b = mix(top[2], bottom[2], t);

      // Inner border ring.
      if (sd > -edge) {
        const k = 0.55;
        r = mix(r, amber[0], k);
        g = mix(g, amber[1], k);
        b = mix(b, amber[2], k);
      }

      const d = Math.min(
        segmentDistance(px, py, ax1, ay1, ax2, ay2),
        segmentDistance(px, py, bx1, ay1, ax2, ay2)
      );
      if (d < halfStroke) {
        r = amber[0];
        g = amber[1];
        b = amber[2];
      }

      const i = (y * W + x) * 4;
      master[i] = r;
      master[i + 1] = g;
      master[i + 2] = b;
      master[i + 3] = 1;
    }
  }
  return { master, W };
}

/** Average down, premultiplying so transparent edges do not darken. */
function downsample(master, W, size) {
  const factor = W / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const i = (((y * factor + sy) | 0) * W + ((x * factor + sx) | 0)) * 4;
          const alpha = master[i + 3];
          r += master[i] * alpha;
          g += master[i + 1] * alpha;
          b += master[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round((r / a) * 255);
        out[o + 1] = Math.round((g / a) * 255);
        out[o + 2] = Math.round((b / a) * 255);
      }
      out[o + 3] = Math.round((a / (factor * factor)) * 255);
    }
  }
  return out;
}

/* ------------------------------------------------------------- ICO output */

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;

  images.forEach((image, index) => {
    const base = index * 16;
    directory[base] = image.size >= 256 ? 0 : image.size; // 0 means 256
    directory[base + 1] = image.size >= 256 ? 0 : image.size;
    directory[base + 2] = 0; // palette
    directory[base + 3] = 0; // reserved
    directory.writeUInt16LE(1, base + 4); // colour planes
    directory.writeUInt16LE(32, base + 6); // bits per pixel
    directory.writeUInt32LE(image.png.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += image.png.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

/* -------------------------------------------------------------------- run */

const images = SIZES.map((size) => {
  const { master, W } = renderMaster(size);
  return { size, png: encodePng(size, downsample(master, W, size)) };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buildIco(images));
console.log(`Wrote ${OUT} (${images.map((i) => i.size).join(', ')} px, ${fs.statSync(OUT).size} bytes)`);

// Also drop the largest layer out as a PNG so the icon can be eyeballed or
// reused (for example as a favicon).
const preview = path.join(ROOT, 'assets', 'icon-preview-256.png');
fs.writeFileSync(preview, images[0].png);
console.log(`Wrote ${preview}`);
