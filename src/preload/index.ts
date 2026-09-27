import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { Api } from '../shared/types';

function subscribe<T>(channel: string, cb: (value: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, value: T) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: Api = {
  appInfo: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  onSettings: (cb) => subscribe('settings:changed', cb),
  getRunState: () => ipcRenderer.invoke('run:get'),
  onRunState: (cb) => subscribe('run:changed', cb),
  pause: (minutes) => ipcRenderer.invoke('run:pause', minutes),
  sendStatus: (s) => ipcRenderer.send('status', s),
  sendAlert: (tips) => ipcRenderer.send('alert', tips),
  dismissReminder: () => ipcRenderer.send('reminder:dismiss'),
  onCommand: (cb) => subscribe('command', cb),
};

contextBridge.exposeInMainWorld('api', api);
