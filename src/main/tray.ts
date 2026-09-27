import { Menu, Tray } from 'electron';
import type { RunState, StatusUpdate } from '../shared/types';
import { trayIcon, type IconColor } from './trayIcon';

export interface TrayActions {
  open(): void;
  pause(minutes: number | null): void;
  recalibrate(): void;
  quit(): void;
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function describe(status: StatusUpdate, run: RunState): { label: string; color: IconColor } {
  if (run.locked) return { label: 'Paused (screen locked)', color: 'gray' };
  if (run.pausedUntil) return { label: `Paused until ${time(run.pausedUntil)}`, color: 'gray' };
  switch (status.status) {
    case 'running':
      if (status.state === 'absent') return { label: 'Away from desk', color: 'gray' };
      return status.state === 'good'
        ? { label: `Good posture · ${Math.round(status.score ?? 0)}`, color: 'green' }
        : { label: `Slouching · ${Math.round(status.score ?? 0)}`, color: 'red' };
    case 'starting': return { label: 'Starting…', color: 'gray' };
    case 'calibrating': return { label: 'Calibrating…', color: 'gray' };
    case 'paused': return { label: 'Paused', color: 'gray' };
    case 'needs-calibration': return { label: 'Needs calibration', color: 'amber' };
    case 'camera-busy': return { label: 'Camera is in use by another app', color: 'amber' };
    case 'camera-denied': return { label: 'Camera access is blocked', color: 'amber' };
    case 'no-camera': return { label: 'No camera found', color: 'amber' };
    case 'error': return { label: 'Something went wrong', color: 'amber' };
  }
}

export class AppTray {
  private tray: Tray;
  private lastKey = '';

  constructor(private actions: TrayActions) {
    this.tray = new Tray(trayIcon('gray'));
    this.tray.on('click', () => actions.open());
  }

  /** Cheap to call every second: only rebuilds when something visible changed. */
  update(status: StatusUpdate, run: RunState): void {
    const { label, color } = describe(status, run);
    const paused = !!run.pausedUntil;
    const key = `${label}|${color}|${paused}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.tray.setImage(trayIcon(color));
    this.tray.setToolTip(`Posture Coach — ${label}`);
    const a = this.actions;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label, enabled: false },
        { type: 'separator' },
        { label: 'Open Posture Coach', click: () => a.open() },
        paused
          ? { label: 'Resume', click: () => a.pause(null) }
          : { label: 'Pause', submenu: [
              { label: 'For 15 minutes', click: () => a.pause(15) },
              { label: 'For 1 hour', click: () => a.pause(60) },
              { label: 'For 4 hours', click: () => a.pause(240) },
            ] },
        { label: 'Recalibrate', click: () => a.recalibrate() },
        { type: 'separator' },
        { label: 'Quit', click: () => a.quit() },
      ]),
    );
  }
}
