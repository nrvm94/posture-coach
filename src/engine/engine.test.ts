import { describe, expect, it } from 'vitest';
import {
  AlertPolicy, buildBaseline, checkFraming, extractFeatures, scorePosture, Smoother,
  type Baseline, type CalibrationResult, type Features, type Landmark,
} from '.';

/** Synthetic front-facing body. Lower headY = head higher in frame. */
function body({ headY = 0.45, shoulderW = 0.3, shoulderY = 0.8, earW = 0.12, cx = 0.5, visibility = 0.99 } = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility });
  // Unmirrored camera image: the person's left shoulder appears on the right.
  set(11, cx + shoulderW / 2, shoulderY);
  set(12, cx - shoulderW / 2, shoulderY);
  set(0, cx, headY);
  set(7, cx + earW / 2, headY - 0.02);
  set(8, cx - earW / 2, headY - 0.02);
  set(2, cx + 0.02, headY - 0.03);
  set(5, cx - 0.02, headY - 0.03);
  return lm;
}

const features = (opts?: Parameters<typeof body>[0]) => extractFeatures(body(opts), null, 1)!;
const baselineOf = (r: CalibrationResult): Baseline => {
  if ('error' in r) throw new Error(r.error);
  return r.baseline;
};
const baseline = baselineOf(buildBaseline(Array(10).fill(features())));

describe('extractFeatures', () => {
  it('returns null when nobody is in frame', () => {
    expect(extractFeatures(null, null, 1)).toBeNull();
    expect(extractFeatures(body({ visibility: 0.1 }), null, 1)).toBeNull();
  });

  it('keeps shoulder tilt near zero for level shoulders', () => {
    expect(Math.abs(features().shoulderTilt)).toBeLessThan(1);
  });

  it('is unaffected by where the user sits horizontally', () => {
    const a = features({ cx: 0.4 }), b = features({ cx: 0.6 });
    expect(a.neck).toBeCloseTo(b.neck);
    expect(a.lateral).toBeCloseTo(b.lateral);
  });
});

describe('scorePosture', () => {
  it('scores the calibrated posture as 100', () => {
    expect(scorePosture(features(), baseline).score).toBe(100);
  });

  it('drops for a slouch and more for a bigger slouch', () => {
    const slight = scorePosture(features({ headY: 0.5 }), baseline).score;
    const heavy = scorePosture(features({ headY: 0.56, shoulderW: 0.34, earW: 0.15 }), baseline).score;
    expect(slight).toBeLessThan(90);
    expect(heavy).toBeLessThan(slight);
    expect(heavy).toBeLessThan(60);
  });

  it('does not penalize sitting further back or sitting taller', () => {
    expect(scorePosture(features({ shoulderW: 0.24, earW: 0.096 }), baseline).score).toBe(100);
    expect(scorePosture(features({ headY: 0.42 }), baseline).score).toBe(100);
  });

  it('is stricter at higher sensitivity', () => {
    const f = features({ headY: 0.49 });
    expect(scorePosture(f, baseline, 2).score).toBeLessThan(scorePosture(f, baseline, 0.5).score);
  });
});

describe('buildBaseline', () => {
  it('needs enough valid samples', () => {
    expect(buildBaseline([features(), null, null])).toEqual({ error: 'not-visible' });
  });

  it('rejects calibration when the shoulders are unclear in most frames', () => {
    const unclear: Features = { ...features(), shoulderVis: 0.6 };
    const samples = [...Array(4).fill(features()), ...Array(16).fill(unclear)];
    expect(buildBaseline(samples)).toEqual({ error: 'not-visible' });
  });

  it('rejects calibration when landmarks jitter (clothes blending into the background)', () => {
    const samples = Array.from({ length: 30 }, (_, i) => features({ headY: i % 2 ? 0.4 : 0.5 }));
    expect(buildBaseline(samples)).toEqual({ error: 'unstable' });
  });

  it('accepts a steady, clearly visible calibration despite a few missed frames', () => {
    const samples = [...Array(25).fill(features()), null, null, null];
    expect('baseline' in buildBaseline(samples)).toBe(true);
  });
});

describe('checkFraming', () => {
  it('accepts a centered upper body at a good distance', () => {
    expect(checkFraming(body())).toEqual({ ok: true, issue: null });
  });

  it('asks to move back, closer, or reframe', () => {
    expect(checkFraming(body({ shoulderW: 0.7 })).issue).toBe('too-close');
    expect(checkFraming(body({ shoulderW: 0.2, earW: 0.08 })).issue).toBe('too-far');
    expect(checkFraming(body({ shoulderY: 0.95 })).issue).toBe('shoulders-cut-off');
    expect(checkFraming(body({ headY: 0.15, shoulderY: 0.5 })).issue).toBe('head-high');
  });

  it('gives left/right directions for the mirrored preview', () => {
    // Low camera x = the user's right side of the image, so they should move to their left.
    expect(checkFraming(body({ cx: 0.25 })).issue).toBe('move-left');
    expect(checkFraming(body({ cx: 0.75 })).issue).toBe('move-right');
  });

  it('flags unclear shoulders and missing people', () => {
    const lm = body();
    lm[11] = { ...lm[11], visibility: 0.55 };
    expect(checkFraming(lm).issue).toBe('shoulders-hidden');
    expect(checkFraming(null).issue).toBe('no-person');
    expect(checkFraming(body({ visibility: 0.1 })).issue).toBe('no-person');
  });
});

describe('Smoother', () => {
  it('switches to bad only after the smoothed score falls, with hysteresis', () => {
    const s = new Smoother();
    for (let t = 0; t < 10; t++) s.update(95, t);
    expect(s.update(30, 10).state).toBe('good'); // one bad frame is not enough
    let t = 11;
    while (s.state === 'good' && t < 60) s.update(30, t++);
    expect(s.state).toBe('bad');
    s.update(65, t++); // between thresholds: stays bad
    expect(s.state).toBe('bad');
  });

  it('marks absent after a few seconds without a person', () => {
    const s = new Smoother();
    s.update(90, 0);
    expect(s.update(null, 1).state).toBe('good');
    expect(s.update(null, 4).state).toBe('absent');
  });
});

describe('AlertPolicy', () => {
  it('fires after sustained bad posture, then respects the cooldown', () => {
    const a = new AlertPolicy(30, 300);
    const fired: number[] = [];
    for (let t = 0; t <= 400; t++) if (a.update('bad', t)) fired.push(t);
    expect(fired).toEqual([30, 330]);
  });

  it('resets when posture recovers or the user leaves', () => {
    const a = new AlertPolicy(30, 0);
    for (let t = 0; t < 25; t++) a.update('bad', t);
    a.update('absent', 25);
    for (let t = 26; t < 50; t++) expect(a.update('bad', t)).toBe(false);
  });
});
