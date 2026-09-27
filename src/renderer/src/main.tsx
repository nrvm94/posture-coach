import { createRoot } from 'react-dom/client';
import { FEATURES, topIssues } from '../../engine';
import { api, isWeb } from './api';
import { App } from './App';
import { Reminder } from './components';
import { Monitor } from './monitor';
import { clearBackgroundTimeout, setBackgroundTimeout } from './ticker';
import './styles.css';

async function boot(): Promise<void> {
  const settings = await api.getSettings();
  const monitor = new Monitor(
    settings,
    (result) => api.sendAlert(result ? topIssues(result).map((k) => FEATURES[k].tip) : []),
    isWeb ? { set: setBackgroundTimeout, clear: clearBackgroundTimeout } : undefined,
  );

  api.onSettings((s) => monitor.updateSettings(s));
  api.onRunState((r) => monitor.setActive(r.active));

  // Report to the tray at most once a second, or right away when the state changes.
  let lastSent = 0, lastKey = '';
  monitor.subscribe((s) => {
    const key = `${s.status}|${s.state}`;
    if (key === lastKey && Date.now() - lastSent < 1000) return;
    lastKey = key;
    lastSent = Date.now();
    api.sendStatus({ status: s.status, state: s.state, score: s.score });
  });

  const run = await api.getRunState();
  monitor.setActive(run.active);
  void monitor.init();

  createRoot(document.getElementById('root')!).render(
    <>
      <App monitor={monitor} initialSettings={settings} initialRun={run} />
      {isWeb && <Reminder />}
    </>,
  );
}

void boot();
