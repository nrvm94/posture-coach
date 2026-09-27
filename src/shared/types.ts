import type { Baseline, PostureState } from '../engine';

export interface Settings {
  onboarded: boolean;
  /** '' means the system default camera. */
  cameraId: string;
  /** 0.5 (relaxed) .. 2 (strict) */
  sensitivity: number;
  alertDelaySec: number;
  cooldownMin: number;
  fps: number;
  sound: boolean;
  launchAtLogin: boolean;
  baseline: Baseline | null;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  cameraId: '',
  sensitivity: 1,
  alertDelaySec: 30,
  cooldownMin: 5,
  fps: 3,
  sound: true,
  launchAtLogin: false,
  baseline: null,
};

export type MonitorStatus =
  | 'starting'
  | 'running'
  | 'calibrating'
  | 'needs-calibration'
  | 'paused'
  | 'camera-busy'
  | 'camera-denied'
  | 'no-camera'
  | 'error';

/** What the renderer reports to the main process about once a second. */
export interface StatusUpdate {
  status: MonitorStatus;
  state: PostureState;
  score: number | null;
}

/** Whether monitoring should run, as decided by the main process. */
export interface RunState {
  active: boolean;
  /** Epoch ms when a user pause ends, or null. */
  pausedUntil: number | null;
  /** Screen locked or system asleep. */
  locked: boolean;
}

export interface AppInfo {
  version: string;
  packaged: boolean;
  platform: NodeJS.Platform | 'web';
  /** Running as the browser version rather than the desktop app. */
  web: boolean;
}

export type Command = 'recalibrate';

/** The API the preload script exposes to the renderer as `window.api`. */
export interface Api {
  appInfo(): Promise<AppInfo>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  onSettings(cb: (s: Settings) => void): () => void;
  getRunState(): Promise<RunState>;
  onRunState(cb: (r: RunState) => void): () => void;
  /** Pause for `minutes`, or resume when null. */
  pause(minutes: number | null): Promise<void>;
  sendStatus(s: StatusUpdate): void;
  /** Show the slouch reminder popup with short "what to fix" tips. */
  sendAlert(tips: string[]): void;
  dismissReminder(): void;
  onCommand(cb: (c: Command) => void): () => void;
}
