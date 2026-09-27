// Draws the tray icon (a colored dot) in code, so there are no image assets to keep in sync.
import { nativeImage, type NativeImage } from 'electron';
import { crc32, deflateSync } from 'node:zlib';

export type IconColor = 'green' | 'red' | 'gray' | 'amber';

const RGB: Record<IconColor, [number, number, number]> = {
  green: [18, 183, 106],
  red: [240, 68, 56],
  gray: [152, 162, 179],
  amber: [247, 144, 9],
};

function encodePng(size: number, rgba: Buffer): Buffer {
  const chunk = (type: string, data: Buffer) => {
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
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

/** Anti-aliased filled circle with a thin white ring so it reads on dark and light taskbars. */
function dot(size: number, [r, g, b]: [number, number, number]): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2, outer = size * 0.44, inner = outer - Math.max(1, size / 16);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const alpha = Math.min(1, Math.max(0, outer - d + 0.5));
      const fill = Math.min(1, Math.max(0, inner - d + 0.5)); // 1 inside, 0 on the ring
      const i = (y * size + x) * 4;
      px[i] = Math.round(r * fill + 255 * (1 - fill));
      px[i + 1] = Math.round(g * fill + 255 * (1 - fill));
      px[i + 2] = Math.round(b * fill + 255 * (1 - fill));
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

const cache = new Map<IconColor, NativeImage>();

export function trayIcon(color: IconColor): NativeImage {
  let img = cache.get(color);
  if (!img) {
    img = nativeImage.createEmpty();
    for (const scaleFactor of [1, 2]) {
      const size = 16 * scaleFactor;
      img.addRepresentation({ scaleFactor, buffer: encodePng(size, dot(size, RGB[color])) });
    }
    cache.set(color, img);
  }
  return img;
}
