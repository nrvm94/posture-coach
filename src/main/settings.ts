import { app } from 'electron';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** Coerce untrusted input (renderer or a hand-edited file) into valid settings. */
function sanitize(raw: Partial<Settings>, base: Settings): Settings {
  const s = { ...base, ...raw };
  const d = DEFAULT_SETTINGS;
  return {
    onboarded: !!s.onboarded,
    cameraId: typeof s.cameraId === 'string' ? s.cameraId : '',
    sensitivity: clamp(s.sensitivity, 0.5, 2, d.sensitivity),
    alertDelaySec: clamp(s.alertDelaySec, 5, 600, d.alertDelaySec),
    cooldownMin: clamp(s.cooldownMin, 1, 120, d.cooldownMin),
    fps: clamp(s.fps, 1, 5, d.fps),
    sound: !!s.sound,
    launchAtLogin: !!s.launchAtLogin,
    baseline: s.baseline && typeof s.baseline === 'object' ? s.baseline : null,
  };
}

export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json');
  private data: Settings;

  constructor() {
    let stored: Partial<Settings> = {};
    try {
      stored = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      // First run or unreadable file: start from defaults.
    }
    this.data = sanitize(stored, DEFAULT_SETTINGS);
  }

  get(): Settings {
    return this.data;
  }

  update(patch: Partial<Settings>): Settings {
    this.data = sanitize(patch, this.data);
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
    return this.data;
  }
}
