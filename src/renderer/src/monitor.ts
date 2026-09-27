// Camera + MediaPipe + posture engine loop. Framework-agnostic; the React UI subscribes to it.
// Frames only ever exist in memory here: nothing is saved or sent anywhere.
import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  AlertPolicy, buildBaseline, checkFraming, extractFeatures, scorePosture, Smoother,
  type CalibrationResult, type Features, type Framing, type PostureState, type ScoreResult,
} from '../../engine';
import type { MonitorStatus, Settings } from '../../shared/types';

const asset = (path: string) => new URL(`mediapipe/${path}`, document.baseURI).href;
const CAMERA_RETRY_MS = 60_000;
const CALIBRATION_FPS = 10;
const LIGHT_CHECK_MS = 1000;
/** Mean frame brightness (0..255) below which tracking gets unreliable. */
const DARK_BELOW = 60;

/** How the loop schedules itself. The browser version swaps in worker timers that survive background tabs. */
export interface Timers {
  set(cb: () => void, ms: number): number;
  clear(id: number | undefined): void;
}

const windowTimers: Timers = {
  set: (cb, ms) => window.setTimeout(cb, ms),
  clear: (id) => window.clearTimeout(id),
};

export interface Snapshot {
  status: MonitorStatus;
  state: PostureState;
  score: number | null;
  result: ScoreResult | null;
  /** Head and shoulders visible in the latest frame. */
  detected: boolean;
  /** Whether the user lines up with the body-outline guide. */
  framing: Framing;
  /** Seconds spent in each state since the app started. */
  totals: Record<PostureState, number>;
  /** 0..1 while calibrating. */
  calibration: number | null;
  stream: MediaStream | null;
  error: string | null;
}

type Listener = (s: Snapshot) => void;

export class Monitor {
  snapshot: Snapshot = {
    status: 'starting', state: 'absent', score: null, result: null, detected: false,
    framing: { ok: false, issue: 'no-person' },
    totals: { good: 0, bad: 0, absent: 0 }, calibration: null, stream: null, error: null,
  };

  private pose?: PoseLandmarker;
  private face?: FaceLandmarker;
  private video = document.createElement('video');
  private loopTimer?: number;
  private retryTimer?: number;
  private active = false;
  private ready = false;
  private smoother = new Smoother();
  private alerts: AlertPolicy;
  private lastTick: number | null = null;
  private calib: { until: number; samples: (Features | null)[]; done: (r: CalibrationResult) => void } | null = null;
  private lightCanvas = document.createElement('canvas');
  private lastLightCheck = 0;
  private dark = false;
  private listeners = new Set<Listener>();

  constructor(
    private settings: Settings,
    private onAlert: (result: ScoreResult | null) => void,
    private timers: Timers = windowTimers,
  ) {
    this.alerts = new AlertPolicy(settings.alertDelaySec, settings.cooldownMin * 60);
    this.video.muted = true;
    this.video.playsInline = true;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<Snapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn(this.snapshot);
  }

  async init(): Promise<void> {
    try {
      const vision = await FilesetResolver.forVisionTasks(asset('wasm'));
      const make = (delegate: 'GPU' | 'CPU') => Promise.all([
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: asset('models/pose_landmarker_full.task'), delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        }),
      ]);
      try {
        [this.pose, this.face] = await make('GPU');
      } catch (e) {
        console.warn('GPU delegate failed, falling back to CPU', e);
        [this.pose, this.face] = await make('CPU');
      }
      this.ready = true;
      if (this.active) await this.startCamera();
    } catch (e) {
      console.error(e);
      this.set({ status: 'error', error: 'Could not load the pose model.' });
    }
  }

  updateSettings(next: Settings): void {
    const cameraChanged = next.cameraId !== this.settings.cameraId;
    this.settings = next;
    this.alerts.delaySec = next.alertDelaySec;
    this.alerts.cooldownSec = next.cooldownMin * 60;
    if (cameraChanged && this.snapshot.stream) void this.startCamera();
    else if (this.snapshot.status === 'needs-calibration' && next.baseline) this.set({ status: 'running' });
  }

  /** Called when the main process pauses/resumes monitoring (user pause, screen lock). */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      if (this.ready) void this.startCamera();
    } else {
      this.stopCamera();
      this.calib?.done({ error: 'not-visible' });
      this.calib = null;
      this.set({ status: 'paused', state: 'absent', score: null, calibration: null });
    }
  }

  /** Collects `seconds` of samples; resolves with the new baseline or the reason it was rejected. */
  calibrate(seconds = 5): Promise<CalibrationResult> {
    if (!this.snapshot.stream) return Promise.resolve({ error: 'not-visible' });
    this.calib?.done({ error: 'not-visible' });
    return new Promise((resolve) => {
      this.calib = { until: performance.now() + seconds * 1000, samples: [], done: resolve };
      this.set({ status: 'calibrating', calibration: 0 });
    });
  }

  private async startCamera(): Promise<void> {
    this.stopCamera();
    const { cameraId } = this.settings;
    try {
      let stream: MediaStream;
      try {
        stream = await this.open(cameraId);
      } catch (e) {
        // The saved camera was unplugged: fall back to the default one.
        if (!cameraId || !['NotFoundError', 'OverconstrainedError'].includes((e as Error).name)) throw e;
        stream = await this.open('');
      }
      if (!this.active) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.getVideoTracks()[0].addEventListener('ended', () => this.retryCamera(5_000));
      this.video.srcObject = stream;
      await this.video.play();
      this.smoother.reset();
      this.lastTick = null;
      this.set({
        stream, error: null,
        status: this.settings.baseline ? 'running' : 'needs-calibration',
      });
      this.loop();
    } catch (e) {
      const name = (e as Error).name;
      console.warn('camera error', name, e);
      if (name === 'NotAllowedError' || name === 'SecurityError') this.set({ status: 'camera-denied' });
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.set({ status: 'no-camera' });
      else this.set({ status: 'camera-busy' });
      this.retryCamera(CAMERA_RETRY_MS);
    }
  }

  private open(deviceId: string): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: 640, height: 480, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) },
    });
  }

  private retryCamera(ms: number): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (this.active && this.ready) void this.startCamera();
    }, ms);
  }

  private stopCamera(): void {
    this.timers.clear(this.loopTimer);
    clearTimeout(this.retryTimer);
    this.snapshot.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    if (this.snapshot.stream) this.set({ stream: null, detected: false });
  }

  private loop = (): void => {
    this.loopTimer = this.timers.set(this.loop, 1000 / (this.calib ? CALIBRATION_FPS : this.settings.fps));
    if (!this.pose || !this.face || this.video.readyState < 2) return;

    const now = performance.now();
    const pose = this.pose.detectForVideo(this.video, now).landmarks?.[0] ?? null;
    const matrix = this.face.detectForVideo(this.video, now).facialTransformationMatrixes?.[0]?.data ?? null;
    const f = extractFeatures(pose, matrix, this.video.videoWidth / this.video.videoHeight);
    const framing = this.frame(pose, now);

    if (this.calib) {
      const c = this.calib;
      // Only frames where the user lines up with the guide count toward the baseline.
      c.samples.push(framing.ok ? f : null);
      const left = (c.until - now) / 1000;
      if (left > 0) {
        this.set({ detected: !!f, framing, calibration: Math.min(1, 1 - left / 5) });
        return;
      }
      this.calib = null;
      const result = buildBaseline(c.samples);
      const hasBaseline = 'baseline' in result || !!this.settings.baseline;
      this.set({ framing, calibration: null, status: hasBaseline ? 'running' : 'needs-calibration' });
      c.done(result);
      return;
    }

    const baseline = this.settings.baseline;
    if (!baseline) {
      this.set({ detected: !!f, framing });
      return;
    }

    const t = now / 1000;
    const result = f ? scorePosture(f, baseline, this.settings.sensitivity) : null;
    const { value, state } = this.smoother.update(result?.score ?? null, t);
    const totals = { ...this.snapshot.totals };
    if (this.lastTick != null) totals[state] += t - this.lastTick;
    this.lastTick = t;

    if (this.alerts.update(state, t)) this.onAlert(result);
    this.set({ detected: !!f, framing, result, score: value, state, totals, status: 'running' });
  };

  /** Framing for the outline guide. When framing is off and the room is dark, darkness is the likely cause. */
  private frame(pose: Parameters<typeof checkFraming>[0], now: number): Framing {
    if (now - this.lastLightCheck >= LIGHT_CHECK_MS) {
      this.lastLightCheck = now;
      this.dark = this.brightness() < DARK_BELOW;
    }
    const framing = checkFraming(pose);
    return !framing.ok && this.dark ? { ok: false, issue: 'too-dark' } : framing;
  }

  /** Mean brightness of a tiny downscaled copy of the current frame. Kept in memory only. */
  private brightness(): number {
    const c = this.lightCanvas;
    c.width = 32;
    c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return 255;
    g.drawImage(this.video, 0, 0, 32, 24);
    const px = g.getImageData(0, 0, 32, 24).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    return sum / (px.length / 4);
  }
}
