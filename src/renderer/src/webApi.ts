// Browser stand-in for the Electron bridge (window.api), so the same UI runs as a web page.
// Settings live in this browser's localStorage; nothing is sent anywhere.
import type { PostureState } from '../../engine';
import { DEFAULT_SETTINGS, type Api, type RunState, type Settings } from '../../shared/types';
import { chime, unlockAudio } from './chime';

declare const __APP_VERSION__: string;

const STORAGE_KEY = 'posture-coach:settings';
const REMINDER_MAX_MS = 60_000;

export interface ReminderContent {
  title: string;
  body: string;
}

function emitter<T>() {
  const listeners = new Set<(v: T) => void>();
  return {
    on(cb: (v: T) => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit(v: T): void {
      for (const cb of listeners) cb(v);
    },
  };
}

/** The in-page reminder card subscribes to this (see Reminder in components.tsx). */
export const reminders = emitter<ReminderContent | null>();

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw), launchAtLogin: false } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage blocked: settings last for this visit only.
  }
}

export function createWebApi(): Api {
  let settings = loadSettings();
  const settingsChanged = emitter<Settings>();
  const runChanged = emitter<RunState>();
  let pausedUntil: number | null = null;
  let resumeTimer: number | undefined;
  let reminderTimer: number | undefined;
  let lastState: PostureState = 'absent';

  document.addEventListener('pointerdown', unlockAudio, { once: true });

  const runState = (): RunState => ({ active: pausedUntil == null, pausedUntil, locked: false });

  function showReminder(r: ReminderContent | null): void {
    clearTimeout(reminderTimer);
    reminders.emit(r);
    if (r) reminderTimer = window.setTimeout(() => reminders.emit(null), REMINDER_MAX_MS);
  }

  function pause(minutes: number | null): Promise<void> {
    clearTimeout(resumeTimer);
    pausedUntil = minutes == null ? null : Date.now() + minutes * 60_000;
    if (minutes != null) resumeTimer = window.setTimeout(() => void pause(null), minutes * 60_000);
    if (pausedUntil) showReminder(null);
    runChanged.emit(runState());
    return Promise.resolve();
  }

  return {
    appInfo: async () => ({ version: __APP_VERSION__, packaged: false, platform: 'web', web: true }),
    getSettings: async () => settings,
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch };
      saveSettings(settings);
      settingsChanged.emit(settings);
      return settings;
    },
    onSettings: settingsChanged.on,
    getRunState: async () => runState(),
    onRunState: runChanged.on,
    pause,
    sendStatus: (s) => {
      // Like the desktop popup: the reminder goes away once the user sits up (or leaves).
      if (lastState === 'bad' && s.state !== 'bad') showReminder(null);
      lastState = s.state;
    },
    sendAlert: (tips) => {
      if (!runState().active) return;
      const r = {
        title: 'Sit up straight',
        body: tips.length ? tips.join(' · ') : 'Lift your head and sit back in your chair.',
      };
      showReminder(r);
      if (settings.sound) chime();
      // The in-page card isn't visible while the user is in another tab.
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(r.title, { body: r.body, silent: true });
      }
    },
    dismissReminder: () => showReminder(null),
    onCommand: () => () => {},
  };
}
