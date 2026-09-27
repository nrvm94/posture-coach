// Landmarks -> posture features, and calibration baselines.

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Features {
  /** Vertical head-to-shoulder gap / shoulder width. Drops when slouching. */
  neck: number;
  /** Ear (or eye) distance / shoulder width. Grows when the head juts forward. */
  headSize: number;
  /** Shoulder width in frame units. Grows when leaning toward the camera. */
  scale: number;
  /** Shoulder line angle, degrees. */
  shoulderTilt: number;
  /** Nose offset from shoulder midpoint / shoulder width. */
  lateral: number;
  /** Head pitch and roll from the face model, degrees (null when no face). */
  pitch: number | null;
  roll: number | null;
  /** The lower of the two shoulder visibility scores (0..1). Low when clothes blend into the background. */
  shoulderVis: number;
}

/** The user's calibrated "good posture" features. */
export type Baseline = Features;

export type CalibrationResult =
  | { baseline: Baseline }
  /** not-visible: shoulders missing or unclear in too many samples. unstable: landmarks jittered too much. */
  | { error: 'not-visible' | 'unstable' };

// MediaPipe Pose landmark indices
const NOSE = 0, L_EYE = 2, R_EYE = 5, L_EAR = 7, R_EAR = 8, L_SHOULDER = 11, R_SHOULDER = 12;

const MIN_VISIBILITY = 0.5;
const RAD_TO_DEG = 180 / Math.PI;

type Point = { x: number; y: number; visibility?: number };

const visible = (p: Point | undefined): p is Point => !!p && (p.visibility ?? 1) >= MIN_VISIBILITY;
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Turn raw landmarks into posture features.
 * @param pose       33 pose landmarks, normalized 0..1
 * @param faceMatrix 16 floats, column-major 4x4 facial transformation matrix
 * @param aspect     frame width / height, so x and y share one unit
 * @returns null when no usable person is in frame
 */
export function extractFeatures(
  pose: Landmark[] | null,
  faceMatrix: ArrayLike<number> | null,
  aspect: number,
): Features | null {
  if (!pose) return null;
  const px = (i: number): Point | undefined =>
    pose[i] && { x: pose[i].x * aspect, y: pose[i].y, visibility: pose[i].visibility };

  const ls = px(L_SHOULDER), rs = px(R_SHOULDER), nose = px(NOSE);
  if (!visible(ls) || !visible(rs) || !visible(nose)) return null;

  const shoulderMid = mid(ls, rs);
  const sw = dist(ls, rs);
  if (sw < 0.05) return null;

  // Prefer ears for head position; fall back to eyes when an ear is hidden.
  const le = px(L_EAR), re = px(R_EAR);
  const [ha, hb] = visible(le) && visible(re) ? [le, re] : [px(L_EYE), px(R_EYE)];
  if (!ha || !hb) return null;
  const headMid = mid(ha, hb);

  // atan2 on the shoulder line is near ±180 because left/right are swapped in the image;
  // fold it into [-90, 90].
  let shoulderTilt = Math.atan2(rs.y - ls.y, rs.x - ls.x) * RAD_TO_DEG;
  if (shoulderTilt > 90) shoulderTilt -= 180;
  if (shoulderTilt < -90) shoulderTilt += 180;

  let pitch: number | null = null, roll: number | null = null;
  if (faceMatrix && faceMatrix.length === 16) {
    const m = (row: number, col: number) => faceMatrix[col * 4 + row];
    pitch = Math.atan2(m(2, 1), m(2, 2)) * RAD_TO_DEG;
    roll = Math.atan2(m(1, 0), m(0, 0)) * RAD_TO_DEG;
  }

  return {
    neck: (shoulderMid.y - headMid.y) / sw,
    headSize: dist(ha, hb) / sw,
    scale: sw,
    shoulderTilt,
    lateral: (nose.x - shoulderMid.x) / sw,
    pitch,
    roll,
    shoulderVis: Math.min(ls.visibility ?? 1, rs.visibility ?? 1),
  };
}

function median(xs: (number | null)[]): number | null {
  const s = xs.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!s.length) return null;
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

const MIN_CALIBRATION_VISIBILITY = 0.8;
const MIN_USABLE_FRACTION = 0.6;
const MAX_RELATIVE_SPREAD = 0.08;

/** Median absolute deviation relative to the median: how much a value jitters between frames. */
function relativeSpread(xs: number[]): number {
  const m = median(xs)!;
  return median(xs.map((x) => Math.abs(x - m)))! / Math.abs(m || 1);
}

/**
 * Build a baseline from samples collected while the user sits up straight.
 * Pass null for frames where the user wasn't framed. Rejects calibrations where the
 * shoulders were unclear or jittery, rather than saving a baseline that scores wrongly.
 */
export function buildBaseline(samples: (Features | null)[]): CalibrationResult {
  const usable = samples.filter((s): s is Features => s != null && s.shoulderVis >= MIN_CALIBRATION_VISIBILITY);
  if (usable.length < Math.max(5, samples.length * MIN_USABLE_FRACTION)) return { error: 'not-visible' };
  if (
    relativeSpread(usable.map((s) => s.neck)) > MAX_RELATIVE_SPREAD ||
    relativeSpread(usable.map((s) => s.scale)) > MAX_RELATIVE_SPREAD
  ) {
    return { error: 'unstable' };
  }

  const pick = (k: keyof Features) => median(usable.map((s) => s[k]));
  return {
    baseline: {
      neck: pick('neck')!,
      headSize: pick('headSize')!,
      scale: pick('scale')!,
      shoulderTilt: pick('shoulderTilt')!,
      lateral: pick('lateral')!,
      pitch: pick('pitch'),
      roll: pick('roll'),
      shoulderVis: pick('shoulderVis')!,
    },
  };
}
