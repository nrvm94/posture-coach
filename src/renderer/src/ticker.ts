// Timers that keep firing in background browser tabs. Browsers slow page timers in hidden
// tabs to about once a minute, which would stall the posture loop; worker timers aren't
// throttled that way. Only the browser version uses this.

let worker: Worker | null = null;
const callbacks = new Map<number, () => void>();
let nextId = 1;

const WORKER_SRC = `
const timers = new Map();
onmessage = (e) => {
  const [op, id, ms] = e.data;
  if (op === 'set') timers.set(id, setTimeout(() => { timers.delete(id); postMessage(id); }, ms));
  else { clearTimeout(timers.get(id)); timers.delete(id); }
};`;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    worker.onmessage = (e: MessageEvent<number>) => {
      const cb = callbacks.get(e.data);
      callbacks.delete(e.data);
      cb?.();
    };
  }
  return worker;
}

export function setBackgroundTimeout(cb: () => void, ms: number): number {
  const id = nextId++;
  callbacks.set(id, cb);
  getWorker().postMessage(['set', id, ms]);
  return id;
}

export function clearBackgroundTimeout(id: number | undefined): void {
  if (id == null) return;
  callbacks.delete(id);
  worker?.postMessage(['clear', id]);
}
