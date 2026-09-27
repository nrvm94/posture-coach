import type { Baseline, Features } from './features';

export type FeatureKey =
  | 'neckDrop' | 'forwardHead' | 'leanIn' | 'pitch' | 'roll' | 'shoulderTilt' | 'lateral';

/**
 * Tunable scoring config. `tol` is the deviation that earns the full `weight` penalty.
 * `tip` is the fix shown in the reminder popup.
 */
export const FEATURES: Record<FeatureKey, { label: string; tip: string; weight: number; tol: number }> = {
  neckDrop:     { label: 'Head sinking',          tip: 'Lift your head',          weight: 40, tol: 0.15 },
  forwardHead:  { label: 'Head forward',          tip: 'Pull your head back',     weight: 20, tol: 0.15 },
  leanIn:       { label: 'Leaning toward screen', tip: 'Sit back from the screen', weight: 15, tol: 0.25 },
  pitch:        { label: 'Looking down',          tip: 'Raise your gaze',         weight: 15, tol: 20 },
  roll:         { label: 'Head tilted',           tip: 'Level your head',         weight: 5,  tol: 12 },
  shoulderTilt: { label: 'Shoulders uneven',      tip: 'Level your shoulders',    weight: 5,  tol: 10 },
  lateral:      { label: 'Leaning sideways',      tip: 'Sit centered',            weight: 5,  tol: 0.25 },
};

/** The biggest problems in a score, worst first. */
export function topIssues(result: ScoreResult, max = 2, minPenalty = 3): FeatureKey[] {
  return (Object.keys(result.breakdown) as FeatureKey[])
    .filter((k) => result.breakdown[k].penalty >= minPenalty)
    .sort((a, b) => result.breakdown[b].penalty - result.breakdown[a].penalty)
    .slice(0, max);
}

// Deviations below this fraction of `tol` are treated as noise.
const DEAD_ZONE = 0.2;

export interface ScoreResult {
  score: number;
  breakdown: Record<FeatureKey, { dev: number; penalty: number }>;
}

/** Raw deviation per feature. Only the "worse" direction counts where one exists. */
function deviations(f: Features, b: Baseline): Record<FeatureKey, number> {
  const angle = (x: number | null, y: number | null) => (x == null || y == null ? 0 : Math.abs(x - y));
  return {
    neckDrop: Math.max(0, (b.neck - f.neck) / b.neck),
    forwardHead: Math.max(0, f.headSize / b.headSize - 1),
    leanIn: Math.max(0, f.scale / b.scale - 1),
    pitch: angle(f.pitch, b.pitch),
    roll: angle(f.roll, b.roll),
    shoulderTilt: angle(f.shoulderTilt, b.shoulderTilt),
    lateral: Math.abs(f.lateral - b.lateral),
  };
}

/**
 * Score posture 0..100 against the baseline.
 * @param sensitivity 0.5 (lenient) .. 2 (strict); divides tolerances
 */
export function scorePosture(f: Features, baseline: Baseline, sensitivity = 1): ScoreResult {
  const dev = deviations(f, baseline);
  const breakdown = {} as ScoreResult['breakdown'];
  let penalty = 0;
  for (const key of Object.keys(FEATURES) as FeatureKey[]) {
    const { weight, tol } = FEATURES[key];
    const t = Math.min(1, Math.max(0, (dev[key] / (tol / sensitivity) - DEAD_ZONE) / (1 - DEAD_ZONE)));
    breakdown[key] = { dev: dev[key], penalty: weight * t };
    penalty += weight * t;
  }
  return { score: Math.max(0, Math.min(100, 100 - penalty)), breakdown };
}
