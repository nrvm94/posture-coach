import { useState } from 'react';
import { FEATURES, topIssues } from '../../../engine';
import type { RunState } from '../../../shared/types';
import { api, isWeb } from '../api';
import { CameraPreview, formatDuration, ScoreRing, StatusNotice } from '../components';
import type { Snapshot } from '../monitor';

export function Home({ snap, run, onRecalibrate }: { snap: Snapshot; run: RunState; onRecalibrate: () => void }) {
  const [showCamera, setShowCamera] = useState(false);
  const { good, bad, absent } = snap.totals;
  const issues = snap.result && snap.state === 'bad' ? topIssues(snap.result, 3) : [];

  return (
    <div className="stack">
      <StatusNotice snap={snap} run={run} />
      {snap.status === 'needs-calibration' && (
        <div className="notice">
          <span>Calibrate once so Posture Coach knows what good posture looks like for you.</span>
          <button className="primary" onClick={onRecalibrate}>Calibrate</button>
        </div>
      )}

      <div className="hero card">
        <ScoreRing score={snap.score} state={snap.state} />
        <div className="hero-side">
          <div className="stats">
            <div><b>{formatDuration(good)}</b><span>good posture</span></div>
            <div><b>{formatDuration(bad)}</b><span>slouching</span></div>
            <div><b>{formatDuration(absent)}</b><span>away</span></div>
          </div>
          {issues.length > 0 && (
            <p className="small">Fix: {issues.map((k) => FEATURES[k].tip.toLowerCase()).join(', ')}</p>
          )}
          <div className="row">
            {run.pausedUntil ? (
              <button onClick={() => api.pause(null)}>Resume</button>
            ) : (
              <>
                <button onClick={() => api.pause(15)}>Pause 15 min</button>
                <button onClick={() => api.pause(60)}>Pause 1 hour</button>
              </>
            )}
            <button onClick={onRecalibrate}>Recalibrate</button>
          </div>
        </div>
      </div>

      {isWeb && (
        <p className="muted small web-banner">
          Want it watching all day, even with the browser closed?{' '}
          <a href="https://github.com/nrvm94/posture-coach/releases/latest" target="_blank" rel="noopener noreferrer">
            Get the Windows app →
          </a>
        </p>
      )}

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={showCamera} onChange={(e) => setShowCamera(e.target.checked)} />
          Show camera
        </label>
        {showCamera && <CameraPreview snap={snap} />}
      </div>
    </div>
  );
}
