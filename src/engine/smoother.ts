export type PostureState = 'good' | 'bad' | 'absent';

/** EMA smoothing plus a hysteresis state machine, so the state doesn't flicker. */
export class Smoother {
  value: number | null = null;
  state: PostureState = 'absent';
  private lastSeen = -Infinity;
  private lastT: number | null = null;

  constructor(
    private opts = { tauSec: 4, badBelow: 60, goodAbove: 70, absentAfterSec: 3 },
  ) {}

  /** @param score raw score, or null when nobody is in frame */
  update(score: number | null, tSec: number): { value: number | null; state: PostureState } {
    const dt = this.lastT == null ? 0 : tSec - this.lastT;
    this.lastT = tSec;

    if (score == null) {
      if (tSec - this.lastSeen >= this.opts.absentAfterSec) {
        this.state = 'absent';
        this.value = null;
      }
      return { value: this.value, state: this.state };
    }

    this.lastSeen = tSec;
    if (this.value == null) {
      this.value = score;
    } else {
      this.value += (1 - Math.exp(-dt / this.opts.tauSec)) * (score - this.value);
    }

    const { badBelow, goodAbove } = this.opts;
    if (this.state === 'absent') this.state = this.value < badBelow ? 'bad' : 'good';
    else if (this.state === 'good' && this.value < badBelow) this.state = 'bad';
    else if (this.state === 'bad' && this.value > goodAbove) this.state = 'good';

    return { value: this.value, state: this.state };
  }

  reset(): void {
    this.value = null;
    this.state = 'absent';
    this.lastSeen = -Infinity;
    this.lastT = null;
  }
}
