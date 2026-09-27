import { useEffect, useRef, useState } from 'react';
import { FRAMING_HINTS, GUIDE, type Framing, type PostureState } from '../../engine';
import type { RunState } from '../../shared/types';
import { api, isWeb } from './api';
import type { Snapshot } from './monitor';
import { reminders, type ReminderContent } from './webApi';

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** True once `value` has stayed true for `ms`, so the UI doesn't flicker as the user settles. */
export function useHeld(value: boolean, ms = 1000): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!value) {
      setHeld(false);
      return;
    }
    const t = setTimeout(() => setHeld(true), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return held;
}

/**
 * Camera preview. With `guide`, overlays the body outline the user lines up with
 * (like ID-verification apps); otherwise shows a simple detection pill.
 */
export function CameraPreview({ snap, guide = false }: { snap: Snapshot; guide?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = snap.stream;
  }, [snap.stream]);

  return (
    <div className="preview">
      {snap.stream ? <video ref={ref} autoPlay muted playsInline /> : <div className="preview-empty">Camera is off</div>}
      {snap.stream && guide && <BodyGuide framing={snap.framing} />}
      {snap.stream && !guide && (
        <span className={snap.detected ? 'pill ok' : 'pill warn'}>
          {snap.detected ? 'Head and shoulders visible' : "Can't see your head and shoulders"}
        </span>
      )}
    </div>
  );
}

// Outline geometry in a 400x300 viewBox (the camera's 4:3 frame), built from the same
// GUIDE numbers the framing check uses. The outline is symmetric, so mirroring doesn't matter.
const W = 400, H = 300;
const head = { cx: GUIDE.headX * W, cy: GUIDE.headY * H, rx: GUIDE.headRx * W, ry: GUIDE.headRy * H };
const sy = GUIDE.shoulderY * H;
const sl = (0.5 - GUIDE.shoulderWidth / 2) * W, sr = (0.5 + GUIDE.shoulderWidth / 2) * W;
const neckTop = head.cy + head.ry * 0.85, neckBottom = head.cy + head.ry + 22;
const BUST = [
  `M ${W / 2 - 18} ${neckTop}`,
  `L ${W / 2 - 20} ${neckBottom}`,
  `C ${W / 2 - 50} ${neckBottom + 8}, ${sl + 10} ${sy - 32}, ${sl} ${sy - 8}`,
  `C ${sl - 10} ${sy + 14}, ${sl - 18} ${sy + 50}, ${sl - 22} ${H}`,
  `L ${sr + 22} ${H}`,
  `C ${sr + 18} ${sy + 50}, ${sr + 10} ${sy + 14}, ${sr} ${sy - 8}`,
  `C ${sr - 10} ${sy - 32}, ${W / 2 + 50} ${neckBottom + 8}, ${W / 2 + 20} ${neckBottom}`,
  `L ${W / 2 + 18} ${neckTop}`,
].join(' ');

function BodyGuide({ framing }: { framing: Framing }) {
  const ok = useHeld(framing.ok, 400);
  return (
    <>
      <svg className={ok ? 'guide ok' : 'guide'} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <mask id="guide-cutout">
            <rect width={W} height={H} fill="white" />
            <ellipse {...head} fill="black" />
            <path d={`${BUST} Z`} fill="black" />
          </mask>
        </defs>
        <rect className="guide-dim" width={W} height={H} mask="url(#guide-cutout)" />
        <ellipse className="guide-line" {...head} />
        <path className="guide-line" d={BUST} />
      </svg>
      <div className={ok ? 'guide-hint ok' : 'guide-hint'} role="status">
        {framing.ok ? 'Perfect, hold this position' : FRAMING_HINTS[framing.issue ?? 'no-person']}
      </div>
    </>
  );
}

export function CameraSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = async () =>
      setCams((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
    void load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, []);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">System default</option>
      {cams.map((c, i) => (
        <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>
      ))}
    </select>
  );
}

/** Explains why monitoring isn't running, if it isn't. */
export function StatusNotice({ snap, run }: { snap: Snapshot; run: RunState }) {
  if (run.pausedUntil) {
    return (
      <div className="notice">
        <span>Paused until {time(run.pausedUntil)}. The camera is off.</span>
        <button onClick={() => api.pause(null)}>Resume now</button>
      </div>
    );
  }
  const messages: Partial<Record<Snapshot['status'], string>> = {
    starting: 'Loading the pose model…',
    'camera-busy': 'Another app is using your camera, for example a video call. Posture Coach will try again every minute.',
    'camera-denied': isWeb
      ? 'Camera access is blocked. Click the camera icon in the address bar, allow the camera, then reload the page.'
      : navigator.userAgent.includes('Mac')
      ? 'Camera access is blocked. Allow it in System Settings → Privacy & Security → Camera, then restart the app.'
      : 'Camera access is blocked. Allow it in Settings → Privacy & security → Camera → "Let desktop apps access your camera".',
    'no-camera': 'No camera found. Plug one in and it will be picked up automatically.',
    error: snap.error ?? 'Something went wrong.',
  };
  const msg = messages[snap.status];
  return msg ? <div className="notice"><span>{msg}</span></div> : null;
}

/** Browser version only: the in-page equivalent of the desktop reminder popup. */
export function Reminder() {
  const [r, setR] = useState<ReminderContent | null>(null);
  useEffect(() => reminders.on(setR), []);
  if (!r) return null;
  return (
    <div className="web-reminder" role="alert">
      <div className="web-reminder-icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="4.5" r="2.2" /><path d="M12 7.5v8M8 11h8M12 15.5l-3 5M12 15.5l3 5" />
        </svg>
      </div>
      <div className="web-reminder-text">
        <b>{r.title}</b>
        <span>{r.body}</span>
      </div>
      <button aria-label="Dismiss" onClick={() => api.dismissReminder()}>×</button>
    </div>
  );
}

const STATE_LABEL: Record<PostureState, string> = { good: 'Good posture', bad: 'Slouching', absent: 'Away' };

export function ScoreRing({ score, state }: { score: number | null; state: PostureState }) {
  const r = 70, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  return (
    <div className={`ring ${state}`}>
      <svg viewBox="0 0 160 160" aria-hidden>
        <circle cx="80" cy="80" r={r} className="ring-track" />
        <circle cx="80" cy="80" r={r} className="ring-value" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="ring-label">
        <b>{score == null ? '--' : Math.round(score)}</b>
        <span>{STATE_LABEL[state]}</span>
      </div>
    </div>
  );
}
