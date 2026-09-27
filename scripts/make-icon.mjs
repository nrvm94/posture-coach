// Draws the app icon (build/icon.png, 512x512) in code: a green rounded square with a
// white head-and-shoulders figure. Run once after changing the design: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const SIZE = 512;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Signed distance functions (negative inside), in pixels.
const roundedSquare = (x, y, half, r) => {
  const qx = Math.abs(x) - half + r, qy = Math.abs(y) - half + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x, y, r) => Math.hypot(x, y) - r;
const ellipse = (x, y, rx, ry) => (Math.hypot(x / rx, y / ry) - 1) * Math.min(rx, ry);
const coverage = (d) => Math.min(1, Math.max(0, 0.5 - d));

const px = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let qx = 0; qx < SIZE; qx++) {
    const x = qx + 0.5 - SIZE / 2, y = py + 0.5 - SIZE / 2;
    const bg = coverage(roundedSquare(x, y, 240, 112));
    // Vertical gradient from a lighter to a deeper green.
    const t = (py / SIZE);
    const [r, g, b] = [Math.round(38 - 20 * t), Math.round(201 - 40 * t), Math.round(121 - 30 * t)];

    // Figure: head plus the top of a rounded bust, cut flat near the bottom edge.
    const head = circle(x, y + 62, 70);
    const bust = Math.max(ellipse(x, y - 190, 158, 150), y - 200);
    const figure = coverage(Math.min(head, bust));

    const i = (py * SIZE + qx) * 4;
    px[i] = Math.round(r * (1 - figure) + 255 * figure);
    px[i + 1] = Math.round(g * (1 - figure) + 255 * figure);
    px[i + 2] = Math.round(b * (1 - figure) + 255 * figure);
    px[i + 3] = Math.round(255 * bg);
  }
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build/icon.png'), png(SIZE, px));
console.log('wrote build/icon.png');
