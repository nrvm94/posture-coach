import type { AppInfo, Settings } from '../../../shared/types';
import { api, isWeb } from '../api';
import { CameraSelect } from '../components';

const DELAYS = [[15, '15 seconds'], [30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes']] as const;
const COOLDOWNS = [2, 5, 10, 15, 30];

function sensitivityLabel(v: number): string {
  if (v < 0.8) return 'Relaxed';
  if (v <= 1.2) return 'Balanced';
  return 'Strict';
}

export function SettingsView({ settings, info, onRecalibrate }: {
  settings: Settings;
  info: AppInfo | null;
  onRecalibrate: () => void;
}) {
  const set = (patch: Partial<Settings>) => void api.updateSettings(patch);

  return (
    <div className="stack settings">
      <section className="card">
        <h3>Camera</h3>
        <label className="field">
          Camera
          <CameraSelect value={settings.cameraId} onChange={(cameraId) => set({ cameraId })} />
        </label>
        <div className="row"><button onClick={onRecalibrate}>Recalibrate posture</button></div>
      </section>

      <section className="card">
        <h3>Reminders</h3>
        <label className="field">
          Sensitivity: {sensitivityLabel(settings.sensitivity)}
          <input type="range" min={0.5} max={2} step={0.1} value={settings.sensitivity}
            onChange={(e) => set({ sensitivity: +e.target.value })} />
        </label>
        <label className="field">
          Remind me after slouching for
          <select value={settings.alertDelaySec} onChange={(e) => set({ alertDelaySec: +e.target.value })}>
            {DELAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          At most one reminder every
          <select value={settings.cooldownMin} onChange={(e) => set({ cooldownMin: +e.target.value })}>
            {COOLDOWNS.map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={settings.sound} onChange={(e) => set({ sound: e.target.checked })} />
          Play a sound with reminders
        </label>
        <div className="row">
          <button onClick={() => api.sendAlert(['Lift your head', 'Sit back from the screen'])}>Show a test reminder</button>
        </div>
      </section>

      <section className="card">
        <h3>General</h3>
        {!isWeb && (
          <label className="check">
            <input type="checkbox" checked={settings.launchAtLogin} disabled={!info?.packaged}
              onChange={(e) => set({ launchAtLogin: e.target.checked })} />
            Start Posture Coach when I log in
            {info && !info.packaged && <span className="muted small"> (only in the installed app)</span>}
          </label>
        )}
        <label className="field">
          Checks per second (lower saves battery)
          <select value={settings.fps} onChange={(e) => set({ fps: +e.target.value })}>
            {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </section>

      <p className="muted small">
        Posture Coach {info?.version}. Video is processed {isWeb ? 'in your browser' : 'on this computer'} and never saved or uploaded.
      </p>
    </div>
  );
}
