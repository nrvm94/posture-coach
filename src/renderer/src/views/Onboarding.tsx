import { useState } from 'react';
import type { RunState, Settings } from '../../../shared/types';
import { api, isWeb } from '../api';
import { CameraPreview, CameraSelect, StatusNotice, useHeld } from '../components';
import type { Monitor, Snapshot } from '../monitor';
import { Calibrate } from './Calibrate';

export function Onboarding({ monitor, snap, run, settings }: {
  monitor: Monitor;
  snap: Snapshot;
  run: RunState;
  settings: Settings;
}) {
  const [step, setStep] = useState(0);
  const framed = useHeld(snap.framing.ok);

  function finish() {
    if (isWeb && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
    void api.updateSettings({ onboarded: true });
  }

  return (
    <div className="onboarding">
      <div className="steps">{[0, 1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <div className="stack">
          <h1>Sit better without thinking about it</h1>
          <p className="muted">
            Posture Coach watches how you sit through your webcam and nudges you when you start to slouch.
          </p>
          <ul className="bullets">
            <li><b>Private by design.</b> Video is analyzed on this computer and thrown away right after. Nothing is recorded or uploaded.</li>
            {isWeb ? (
              <>
                <li><b>Stays out of the way.</b> Keep this tab open and work in other tabs. It only speaks up after a sustained slouch.</li>
                <li><b>Stops counting</b> when you step away from your desk.</li>
              </>
            ) : (
              <>
                <li><b>Stays out of the way.</b> Minimize it and keep working. It only speaks up after a sustained slouch.</li>
                <li><b>Pauses itself</b> when you lock your screen or step away.</li>
              </>
            )}
          </ul>
          <div className="row"><button className="primary" onClick={() => setStep(1)}>Get started</button></div>
        </div>
      )}

      {step === 1 && (
        <div className="stack">
          <h2>Check your camera</h2>
          <p className="muted">
            Sit the way you normally work and line yourself up with the outline. The more of your
            upper body the camera can see, the better the tracking.
          </p>
          <StatusNotice snap={snap} run={run} />
          <CameraPreview snap={snap} guide />
          <label className="field">
            Camera
            <CameraSelect value={settings.cameraId} onChange={(cameraId) => api.updateSettings({ cameraId })} />
          </label>
          <div className="row">
            <button className="primary" disabled={!snap.stream || !framed} onClick={() => setStep(2)}>Looks good</button>
            <button onClick={() => setStep(0)}>Back</button>
          </div>
        </div>
      )}

      {step === 2 && <Calibrate monitor={monitor} snap={snap} run={run} onDone={() => setStep(3)} />}

      {step === 3 && (
        <div className="stack">
          <h2>You're all set</h2>
          <p className="muted">
            {isWeb
              ? 'Keep this tab open and get back to work; other tabs are fine. If you slouch for a while, you’ll hear a chime and see a reminder. Your browser will ask to allow notifications so reminders reach you in other tabs too. Closing the tab turns Posture Coach off.'
              : 'Minimize this window and get back to work. If you slouch for a while, a small reminder pops up in the corner of your screen and goes away once you sit up. Closing the window turns Posture Coach off.'}
          </p>
          <div className="row">
            <button className="primary" onClick={finish}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
