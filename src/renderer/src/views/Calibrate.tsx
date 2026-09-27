import { useState } from 'react';
import type { RunState } from '../../../shared/types';
import { api } from '../api';
import { CameraPreview, StatusNotice, useHeld } from '../components';
import type { Monitor, Snapshot } from '../monitor';

type Phase = 'idle' | 'countdown' | 'capturing' | 'failed';

const FAILURE: Record<'not-visible' | 'unstable', string> = {
  'not-visible': 'We lost sight of your shoulders during calibration. Line up with the outline and hold still.',
  unstable:
    'Your shoulders are hard to make out. This usually happens when your clothes blend into the background. ' +
    'Try more light in front of you, a top that contrasts with the wall behind you, or a plainer background.',
};

export function Calibrate({ monitor, snap, run, onDone, onCancel }: {
  monitor: Monitor;
  snap: Snapshot;
  run: RunState;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(3);
  const [failure, setFailure] = useState<keyof typeof FAILURE>('not-visible');
  const framed = useHeld(snap.framing.ok);

  async function start() {
    setPhase('countdown');
    for (let n = 3; n > 0; n--) {
      setCount(n);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setPhase('capturing');
    const result = await monitor.calibrate(5);
    if ('error' in result) {
      setFailure(result.error);
      setPhase('failed');
      return;
    }
    await api.updateSettings({ baseline: result.baseline });
    setPhase('idle');
    onDone();
  }

  const busy = phase === 'countdown' || phase === 'capturing';

  return (
    <div className="stack">
      <div>
        <h2>Calibrate your good posture</h2>
        <p className="muted">
          Sit the way you'd like to sit all day: back against the chair, shoulders relaxed, head up,
          looking at your screen. Line yourself up with the outline; it turns green when you're in place.
        </p>
      </div>
      <StatusNotice snap={snap} run={run} />
      <div className="calib-stage">
        <CameraPreview snap={snap} guide />
        {phase === 'countdown' && <div className="calib-overlay"><span className="countdown">{count}</span></div>}
        {phase === 'capturing' && (
          <div className="calib-overlay capture">
            <span>Hold still…</span>
            <div className="progress"><i style={{ width: `${(snap.calibration ?? 0) * 100}%` }} /></div>
          </div>
        )}
      </div>
      {phase === 'failed' && (
        <div className="notice"><span>{FAILURE[failure]}</span></div>
      )}
      <div className="row">
        <button className="primary" disabled={busy || !snap.stream || !framed} onClick={start}>
          {phase === 'failed' ? 'Try again' : 'Start calibration'}
        </button>
        {onCancel && <button disabled={busy} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
