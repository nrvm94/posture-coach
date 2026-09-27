// The slouch reminder: a small always-on-top card in the corner of the screen the user is working on.
// Unlike OS notifications it can't get lost in the notification center, and it plays its own chime.
import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const WIDTH = 380;
const HEIGHT = 124;
const MARGIN = 16;
const MAX_VISIBLE_MS = 60_000;

export interface Reminder {
  title: string;
  body: string;
  sound: boolean;
}

export class ReminderPopup {
  private win: BrowserWindow | null = null;
  private timer?: NodeJS.Timeout;

  constructor(private pageUrl: (page: string) => string) {}

  get isOpen(): boolean {
    return !!this.win && !this.win.isDestroyed();
  }

  show(r: Reminder): void {
    this.close();
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const win = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      x: workArea.x + workArea.width - WIDTH - MARGIN,
      y: workArea.y + workArea.height - HEIGHT - MARGIN,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // Never steal keyboard focus from whatever the user is typing in.
      focusable: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.once('ready-to-show', () => win.showInactive());

    const q = new URLSearchParams({ title: r.title, body: r.body, sound: r.sound ? '1' : '0' });
    void win.loadURL(`${this.pageUrl('popup.html')}?${q}`);

    this.win = win;
    this.timer = setTimeout(() => this.close(), MAX_VISIBLE_MS);
  }

  close(): void {
    clearTimeout(this.timer);
    if (this.isOpen) this.win!.destroy();
    this.win = null;
  }
}
