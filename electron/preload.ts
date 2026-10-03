import { contextBridge, ipcRenderer } from 'electron'
import type { BackfillProgress, DesktopApi, DesktopSettings, GameEvent, WatcherState } from '../src/shared/desktop-api'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: DesktopApi = {
  platform: process.platform,
  appVersion: process.env.TC_APP_VERSION ?? '',
  getState: () => ipcRenderer.invoke('watcher:getState'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<DesktopSettings>) => ipcRenderer.invoke('settings:set', patch),
  pickLogsFolder: () => ipcRenderer.invoke('watcher:pickFolder'),
  readPastLogs: () => ipcRenderer.invoke('watcher:backfill'),
  getRecentEvents: () => ipcRenderer.invoke('watcher:recent'),
  openLogsFolder: () => ipcRenderer.invoke('watcher:openFolder'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onEvent: (cb) => subscribe<GameEvent>('watcher:event', cb),
  onState: (cb) => subscribe<WatcherState>('watcher:state', cb),
  onBackfillProgress: (cb) => subscribe<BackfillProgress>('watcher:backfillProgress', cb),
}

contextBridge.exposeInMainWorld('desktop', api)
