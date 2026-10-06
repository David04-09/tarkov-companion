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
  | 'fleaRating'

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
    | {
        kind: 'taskStarted' | 'taskFinished' | 'taskFailed'
        taskId: string
        /** Game profile that was selected when the message arrived (PvP and PvE profiles differ). */
        profileId: string | null
        /** Trader who sent the message. */
        traderId: string | null
      }
    | { kind: 'mapLoading'; scenePath: string }
    | { kind: 'raidMatched'; location: string; raidId: string; online: boolean; gameMode: string }
    | { kind: 'raidStarting' }
    | { kind: 'raidStarted' }
    | { kind: 'raidEnded'; location: string; raidId: string }
    | { kind: 'matchingAborted' }
    | { kind: 'fleaSold'; itemId: string; count: number; buyer: string; income: number; currency: 'RUB' | 'USD' | 'EUR' | null }
    | { kind: 'fleaRating'; rating: number; growing: boolean }
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
  /** Electron accelerator that captures the screen and opens the stash scanner. */
  scanHotkey: string
  /** 0.3 .. 1 */
  overlayOpacity: number
  /** Last profile id / game version seen in the logs, for wipe detection. */
  knownProfileId: string | null
  knownGameVersion: string | null
  /** First-run setup screen completed (logs folder, mode, faction). */
  setupDone: boolean
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' }
  | { state: 'disabled'; message: string }
  | { state: 'none'; checkedAt: number }
  | { state: 'downloading'; version?: string; percent: number }
  | { state: 'ready'; version: string }
  /** "Restart to update" clicked: the app is about to close and the installer to run. */
  | { state: 'installing'; version: string }
  /** Portable exe: a newer release exists but must be downloaded by hand. */
  | { state: 'available'; version: string; url: string }
  | { state: 'error'; message: string }

/** What became of the last "Restart to update" (checked once at the next launch). */
export interface UpdateOutcome {
  ok: boolean
  /** Version that was being installed. */
  version: string
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

/** One game launch (one log folder): first and last log time. */
export interface PlaySession {
  start: number
  end: number
}

/** Everything the Stats tab needs, read from all log folders (read-only). */
export interface LogStatsData {
  events: GameEvent[]
  sessions: PlaySession[]
  accountId: string | null
  /** Oldest and newest log folder times. */
  from: number | null
  to: number | null
}

export interface BackfillResult {
  /** First/last log line time per log folder (game launch). */
  sessions?: PlaySession[]
  folders: number
  files: number
  events: GameEvent[]
  /** Distinct finished task ids per mode, current profile only. */
  finishedByMode: Record<SessionMode, string[]>
  /** The profile treated as "you" per mode (the most recently selected one). */
  currentProfileByMode: Record<SessionMode, string | null>
  /** Completions ignored because they belong to another profile (older wipe, second account). */
  skippedOtherProfile: number
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
  /** Raids, flea sales and quest hand-ins from all log folders, for the Stats tab. */
  readLogStats: () => Promise<LogStatsData>
  getRecentEvents: () => Promise<GameEvent[]>
  openLogsFolder: () => Promise<void>
  openExternal: (url: string) => Promise<void>
  /** Reads a bundled scanner data file (desktop: file:// cannot be fetched). */
  readAppResource: (rel: string) => Promise<ArrayBuffer>
  /** Captures the screen under the mouse (PNG bytes). */
  captureScreen: () => Promise<Uint8Array>
  /** Newest screenshots from Documents\Escape from Tarkov\Screenshots. */
  listGameScreenshots: () => Promise<{ name: string; modified: number }[]>
  readGameScreenshot: (name: string) => Promise<Uint8Array>
  /** Scan hotkey pressed: a fresh capture to scan. */
  onScanCapture: (cb: (png: Uint8Array) => void) => () => void
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>
  getUpdateOutcome: () => Promise<UpdateOutcome | null>
  /** Opens the downloaded installer normally (fallback when the silent install failed). */
  runInstaller: (version: string) => Promise<void>
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => () => void
  onEvent: (cb: (event: GameEvent) => void) => () => void
  onState: (cb: (state: WatcherState) => void) => () => void
  onBackfillProgress: (cb: (p: BackfillProgress) => void) => () => void
}

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}
