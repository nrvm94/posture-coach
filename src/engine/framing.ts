// Is the user sitting where the camera can track them well? Drives the body-outline guide.
import type { Landmark } from './features';

export type FramingIssue =
  | 'no-person'
  | 'too-close'
  | 'too-far'
  | 'shoulders-cut-off'
  | 'shoulders-hidden'
  | 'move-left'
  | 'move-right'
  | 'head-high'
  | 'head-low'
  | 'too-dark';

export interface Framing {
  ok: boolean;
  issue: FramingIssue | null;
}

/**
 * Where the outline is drawn, in normalized frame coordinates (0..1).
 * The acceptance zones below are centered on these, so the outline and the check agree.
 */
export const GUIDE = {
  headX: 0.5,
  headY: 0.315,
  headRx: 0.095,
  headRy: 0.135,
  shoulderY: 0.7,
  shoulderWidth: 0.44,
} as const;

const ZONE = {
  headX: [0.35, 0.65],
  headY: [0.18, 0.45],
  shoulderY: [0.55, 0.85],
  maxShoulderY: 0.92,
  width: [0.28, 0.6],
  minShoulderVis: 0.7,
} as const;

/** Directions assume the preview is mirrored, like every video-call app. */
export const FRAMING_HINTS: Record<FramingIssue, string> = {
  'no-person': 'Sit in front of the camera',
  'too-close': 'Move back a little',
  'too-far': 'Move a little closer',
  'shoulders-cut-off': 'Tilt your screen forward a little so your shoulders are in view',
  'shoulders-hidden': 'Make sure both shoulders are clearly in view',
  'move-left': 'Move a little to your left',
  'move-right': 'Move a little to your right',
  'head-high': 'Tilt your screen back a little',
  'head-low': 'Tilt your screen forward a little',
  'too-dark': 'Your room is a bit dark. Turn on a light in front of you.',
};

const NOSE = 0, L_EYE = 2, R_EYE = 5, L_EAR = 7, R_EAR = 8, L_SHOULDER = 11, R_SHOULDER = 12;

const vis = (p: Landmark | undefined) => p?.visibility ?? 0;
const bad = (issue: FramingIssue): Framing => ({ ok: false, issue });

export function checkFraming(pose: Landmark[] | null): Framing {
  if (!pose) return bad('no-person');

  // Head position: ears, else eyes, else nose.
  const [a, b] = vis(pose[L_EAR]) >= 0.5 && vis(pose[R_EAR]) >= 0.5
    ? [pose[L_EAR], pose[R_EAR]]
    : [pose[L_EYE], pose[R_EYE]];
  const head = vis(a) >= 0.5 && vis(b) >= 0.5
    ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    : vis(pose[NOSE]) >= 0.5 ? pose[NOSE] : null;
  if (!head) return bad('no-person');

  // MediaPipe still estimates shoulder positions when they're outside the frame.
  const ls = pose[L_SHOULDER], rs = pose[R_SHOULDER];
  if (!ls || !rs) return bad('no-person');
  const width = Math.abs(ls.x - rs.x);
  const shoulderY = (ls.y + rs.y) / 2;

  if (width > ZONE.width[1]) return bad('too-close');
  if (Math.max(ls.y, rs.y) > ZONE.maxShoulderY || shoulderY > ZONE.shoulderY[1]) return bad('shoulders-cut-off');
  if (Math.min(vis(ls), vis(rs)) < ZONE.minShoulderVis) return bad('shoulders-hidden');
  if (width < ZONE.width[0]) return bad('too-far');
  // Camera x grows toward the user's left, so a low x means they're too far to their right.
  if (head.x < ZONE.headX[0]) return bad('move-left');
  if (head.x > ZONE.headX[1]) return bad('move-right');
  if (head.y < ZONE.headY[0] || shoulderY < ZONE.shoulderY[0]) return bad('head-high');
  if (head.y > ZONE.headY[1]) return bad('head-low');
  return { ok: true, issue: null };
}
