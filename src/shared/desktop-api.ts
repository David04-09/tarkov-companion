/**
 * Types shared between the Electron main process, the preload bridge and the
 * React renderer. Keep this file free of runtime imports.
 */

/** EFT "Session mode" as the log reports it, normalised. */
export type SessionMode = 'regular' | 'pve' | 'seasonal' | 'unknown'

export type GameEventKind =
  | 'sessionMode'
  | 'profile'
  | 'gameVersion'
  | 'taskStarted'
  | 'taskFinished'
  | 'taskFailed'
  | 'mapLoading'
  | 'raidMatched'
  | 'raidStarting'
  | 'raidStarted'
  | 'raidEnded'
  | 'matchingAborted'
  | 'fleaSold'
  | 'fleaExpired'

export interface GameEventBase {
  id: string
  /** Event time in ms since epoch (from the log timestamp). */
  at: number
  /** Session mode in effect when the event happened. */
  mode: SessionMode
  /** True when read from an old log during start-up or a backfill (no live reactions). */
  historical: boolean
  /** Which file and line produced it, for troubleshooting. */
  source: { file: string; line: number }
}

export type GameEvent = GameEventBase &
  (
    | { kind: 'sessionMode'; raw: string }
    | { kind: 'profile'; profileId: string; accountId: string }
    | { kind: 'gameVersion'; version: string }
    | { kind: 'taskStarted' | 'taskFinished' | 'taskFailed'; taskId: string }
    | { kind: 'mapLoading'; scenePath: string }
    | { kind: 'raidMatched'; location: string; raidId: string; online: boolean; gameMode: string }
    | { kind: 'raidStarting' }
    | { kind: 'raidStarted' }
    | { kind: 'raidEnded'; location: string; raidId: string }
    | { kind: 'matchingAborted' }
    | { kind: 'fleaSold'; itemId: string; count: number; buyer: string }
    | { kind: 'fleaExpired'; itemId: string; count: number }
  )

export type WatcherStatus = 'watching' | 'paused' | 'no-folder' | 'error'

export interface WatcherState {
  status: WatcherStatus
  /** Folder being watched (custom or auto-detected). */
  logsPath: string | null
  /** Auto-detected folder, even when a custom one is in use. */
  detectedPath: string | null
  /** Session log folder currently tailed. */
  currentFolder: string | null
  lastEventAt: number | null
  /** Current session mode / profile as last seen in the logs. */
  sessionMode: SessionMode
  profileId: string | null
  /** Numeric BSG account id from the logs (what tarkov.dev's player pages key on). */
  accountId: string | null
  message?: string
}

export interface DesktopSettings {
  /** Custom logs folder; null = auto-detect. */
  logsPath: string | null
  startWithWindows: boolean
  startMinimized: boolean
  minimizeToTray: boolean
  openMapOnRaid: boolean
  /** Set after the first automatic backfill so it only runs once. */
  initialBackfillDone: boolean
  paused: boolean
  /** Electron accelerator for toggling the overlay window. */
  overlayHotkey: string
  /** 0.3 .. 1 */
  overlayOpacity: number
  /** Last profile id / game version seen in the logs, for wipe detection. */
  knownProfileId: string | null
  knownGameVersion: string | null
}

export interface WipeEvent {
  reason: 'profile' | 'version'
  previous: string | null
  current: string
}

export interface BackfillProgress {
  done: number
  total: number
  folder: string
}

export interface BackfillResult {
  folders: number
  files: number
  events: GameEvent[]
  /** Distinct finished task ids per mode. */
  finishedByMode: Record<SessionMode, string[]>
}

export interface DesktopApi {
  platform: string
  appVersion: string
  /** True inside the small always-on-top overlay window. */
  isOverlay: boolean
  toggleOverlay: () => Promise<void>
  closeOverlay: () => Promise<void>
  onWipeDetected: (cb: (e: WipeEvent) => void) => () => void
  onSettingsChanged: (cb: (s: DesktopSettings) => void) => () => void
  getState: () => Promise<WatcherState>
  getSettings: () => Promise<DesktopSettings>
  setSettings: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>
  pickLogsFolder: () => Promise<string | null>
  readPastLogs: () => Promise<BackfillResult>
  getRecentEvents: () => Promise<GameEvent[]>
  openLogsFolder: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  onEvent: (cb: (event: GameEvent) => void) => () => void
  onState: (cb: (state: WatcherState) => void) => () => void
  onBackfillProgress: (cb: (p: BackfillProgress) => void) => () => void
}

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}
