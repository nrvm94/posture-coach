// Copies the MediaPipe WASM runtime and downloads the pose/face models into the
// renderer's public folder, so the app never loads them from the internet at runtime.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/renderer/public/mediapipe');

const MODELS = {
  'pose_landmarker_full.task':
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

cpSync(join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), join(out, 'wasm'), { recursive: true });
console.log('mediapipe: copied wasm runtime');

mkdirSync(join(out, 'models'), { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(out, 'models', name);
  if (existsSync(dest)) continue;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`mediapipe: downloaded ${name}`);
}
