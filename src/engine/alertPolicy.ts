import type { PostureState } from './smoother';

/** Decides when to fire a slouch alert: sustained bad posture, with a cooldown. */
export class AlertPolicy {
  private badSince: number | null = null;
  private lastAlert = -Infinity;

  constructor(public delaySec = 30, public cooldownSec = 300) {}

  /** @returns true when an alert should fire now */
  update(state: PostureState, tSec: number): boolean {
    if (state !== 'bad') {
      this.badSince = null;
      return false;
    }
    this.badSince ??= tSec;
    if (tSec - this.badSince >= this.delaySec && tSec - this.lastAlert >= this.cooldownSec) {
      this.lastAlert = tSec;
      this.badSince = tSec;
      return true;
    }
    return false;
  }
}
