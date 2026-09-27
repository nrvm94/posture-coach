import { useSyncExternalStore } from 'react';
import type { Api } from '../../shared/types';
import type { Monitor, Snapshot } from './monitor';
import { createWebApi } from './webApi';

declare global {
  interface Window {
    /** Set by the Electron preload script; missing in the browser version. */
    api?: Api;
  }
}

export const isWeb = !window.api;
export const api: Api = window.api ?? createWebApi();

export function useSnapshot(monitor: Monitor): Snapshot {
  return useSyncExternalStore(
    (cb) => monitor.subscribe(cb),
    () => monitor.snapshot,
  );
}
