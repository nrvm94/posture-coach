let ctx: AudioContext | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  void ctx.resume();
  return ctx;
}

/** Browsers only allow sound after a user gesture; call this from one (e.g. a click) to allow later chimes. */
export function unlockAudio(): void {
  try {
    context();
  } catch {
    // No audio support: reminders stay silent.
  }
}

/** A soft two-note chime, generated so there's no audio file to ship. */
export function chime(): void {
  try {
    const ac = context();
    [523.25, 783.99].forEach((freq, i) => {
      const t = ac.currentTime + i * 0.18;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  } catch {
    // No audio support: reminders stay silent.
  }
}
