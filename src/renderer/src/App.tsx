import { useEffect, useState } from 'react';
import type { AppInfo, RunState, Settings } from '../../shared/types';
import { api, useSnapshot } from './api';
import type { Monitor } from './monitor';
import { Calibrate } from './views/Calibrate';
import { Home } from './views/Home';
import { Onboarding } from './views/Onboarding';
import { SettingsView } from './views/SettingsView';

type View = 'home' | 'settings' | 'calibrate';

export function App({ monitor, initialSettings, initialRun }: {
  monitor: Monitor;
  initialSettings: Settings;
  initialRun: RunState;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [run, setRun] = useState(initialRun);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [view, setView] = useState<View>('home');
  const snap = useSnapshot(monitor);

  useEffect(() => api.onSettings(setSettings), []);
  useEffect(() => api.onRunState(setRun), []);
  useEffect(() => api.onCommand((c) => c === 'recalibrate' && setView('calibrate')), []);
  useEffect(() => { void api.appInfo().then(setInfo); }, []);

  if (!settings.onboarded) return <Onboarding monitor={monitor} snap={snap} run={run} settings={settings} />;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Posture Coach</strong>
        <nav>
          <button className={view === 'home' ? 'tab active' : 'tab'} onClick={() => setView('home')}>Today</button>
          <button className={view === 'settings' ? 'tab active' : 'tab'} onClick={() => setView('settings')}>Settings</button>
        </nav>
      </header>
      <main className="content">
        {view === 'calibrate' && (
          <Calibrate monitor={monitor} snap={snap} run={run} onDone={() => setView('home')} onCancel={() => setView('home')} />
        )}
        {view === 'home' && <Home snap={snap} run={run} onRecalibrate={() => setView('calibrate')} />}
        {view === 'settings' && (
          <SettingsView settings={settings} info={info} onRecalibrate={() => setView('calibrate')} />
        )}
      </main>
    </div>
  );
}
