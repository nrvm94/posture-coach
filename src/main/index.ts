import {
  app, BrowserWindow, ipcMain, powerMonitor, session, shell, systemPreferences,
} from 'electron';
import { join } from 'node:path';
import type { AppInfo, Command, RunState, Settings, StatusUpdate } from '../shared/types';
import { ReminderPopup } from './popup';
import { appUrl, registerAppScheme, serveRenderer } from './protocol';
import { SettingsStore } from './settings';
import { AppTray } from './tray';

const APP_ID = 'com.neerav.posturecoach';

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(start);
}

let win: BrowserWindow | null = null;
let tray: AppTray;
let settings: SettingsStore;
let reminder: ReminderPopup;

let status: StatusUpdate = { status: 'starting', state: 'absent', score: null };
let pausedUntil: number | null = null;
let resumeTimer: NodeJS.Timeout | undefined;
let screenLocked = false;
let asleep = false;

function runState(): RunState {
  const paused = pausedUntil != null && Date.now() < pausedUntil;
  const locked = screenLocked || asleep;
  return { active: !paused && !locked, pausedUntil: paused ? pausedUntil : null, locked };
}

function broadcastRunState(): void {
  const run = runState();
  if (!run.active) reminder.close();
  win?.webContents.send('run:changed', run);
  tray.update(status, run);
}

function pause(minutes: number | null): void {
  clearTimeout(resumeTimer);
  pausedUntil = minutes == null ? null : Date.now() + minutes * 60_000;
  if (minutes != null) resumeTimer = setTimeout(() => pause(null), minutes * 60_000);
  broadcastRunState();
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function sendCommand(c: Command): void {
  showWindow();
  win?.webContents.send('command', c);
}

function applyLaunchAtLogin(s: Settings): void {
  // In development this would register the bare electron.exe, so only do it when packaged.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] });
}

function startedAtLogin(): boolean {
  return process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAtLogin;
}

/** Dev server page in development, bundled page otherwise. */
function pageUrl(page: string): string {
  const dev = process.env.ELECTRON_RENDERER_URL;
  return dev ? `${dev}/${page}` : appUrl(page);
}

function slouchAlert(tips: string[]): void {
  if (!runState().active) return;
  reminder.show({
    title: 'Sit up straight',
    body: tips.length ? tips.join(' · ') : 'Lift your head and sit back in your chair.',
    sound: settings.get().sound,
  });
}

/**
 * The page may only load its own bundled files. This also stops MediaPipe's built-in
 * usage logging (odml.pa.googleapis.com), which has no off switch.
 */
function blockPageNetwork(): void {
  const devHost = process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).host : null;
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, cb) => {
      const fromPage = details.webContentsId != null;
      const devServer = devHost != null && new URL(details.url).host === devHost;
      const cancel = fromPage && !devServer;
      if (cancel) console.info(`[privacy] blocked network request to ${new URL(details.url).host}`);
      cb({ cancel });
    },
  );
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'Posture Coach',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      // Keep the camera loop running at full rate while the window is minimized.
      backgroundThrottling: false,
    },
  });

  // The window hosts the camera loop, so closing it quits the app (and turns the camera off).
  // Minimizing keeps monitoring running.
  w.on('closed', () => app.quit());

  w.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e) => e.preventDefault());

  w.loadURL(pageUrl('index.html'));
  return w;
}

function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    web: false,
  }));
  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const before = settings.get();
    const next = settings.update(patch);
    if (next.launchAtLogin !== before.launchAtLogin) applyLaunchAtLogin(next);
    win?.webContents.send('settings:changed', next);
    return next;
  });
  ipcMain.handle('run:get', () => runState());
  ipcMain.handle('run:pause', (_e, minutes: number | null) => pause(minutes));
  ipcMain.on('status', (_e, s: StatusUpdate) => {
    // The reminder goes away by itself once the user sits up (or leaves).
    if (status.state === 'bad' && s.state !== 'bad') reminder.close();
    status = s;
    tray.update(status, runState());
  });
  ipcMain.on('alert', (_e, tips: string[]) => slouchAlert(Array.isArray(tips) ? tips.map(String) : []));
  ipcMain.on('reminder:dismiss', () => reminder.close());
}

async function start(): Promise<void> {
  app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath);
  settings = new SettingsStore();

  // Only the camera is allowed; everything else (mic, location, ...) is denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  blockPageNetwork();
  if (process.platform === 'darwin') await systemPreferences.askForMediaAccess('camera');

  serveRenderer(join(__dirname, '../renderer'));
  reminder = new ReminderPopup(pageUrl);
  registerIpc();

  tray = new AppTray({
    open: showWindow,
    pause,
    recalibrate: () => sendCommand('recalibrate'),
    quit: () => app.quit(),
  });
  tray.update(status, runState());

  win = createWindow();
  const s = settings.get();
  const startMinimized = s.onboarded && !!s.baseline && startedAtLogin();
  win.once('ready-to-show', () => (startMinimized ? win?.minimize() : win?.show()));

  powerMonitor.on('lock-screen', () => { screenLocked = true; broadcastRunState(); });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; broadcastRunState(); });
  powerMonitor.on('suspend', () => { asleep = true; broadcastRunState(); });
  powerMonitor.on('resume', () => { asleep = false; broadcastRunState(); });

  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
}

app.on('before-quit', () => reminder?.close());
