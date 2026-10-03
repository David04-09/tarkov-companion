/**
 * Renderer side of the desktop bridge. Everything here is a no-op in the web
 * build (window.desktop is undefined), so desktop-only UI simply hides.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import type { GameMode } from '../api/client'
import { useGameData } from '../api/hooks'
import type { BackfillProgress, BackfillResult, DesktopSettings, GameEvent, SessionMode, WatcherState } from '../shared/desktop-api'
import { useProgressStore } from '../store/progress'
import { useUiStore } from '../store/ui'
import { beep, useTimersStore } from './timers'
import { useWipeBannerStore } from './wipe'

export const isDesktop = (): boolean => typeof window !== 'undefined' && Boolean(window.desktop)
export const isOverlayWindow = (): boolean => Boolean(window.desktop?.isOverlay)

/** Log session mode -> the app's progress mode. PvP season shares the PvP profile. */
export function modeToGameMode(mode: SessionMode, fallback: GameMode): GameMode {
  if (mode === 'pve') return 'pve'
  if (mode === 'regular' || mode === 'seasonal') return 'regular'
  return fallback
}

export interface BackfillSummary {
  at: number
  folders: number
  files: number
  found: Record<GameMode, number>
  added: Record<GameMode, number>
}

interface DesktopUiState {
  state: WatcherState | null
  settings: DesktopSettings | null
  backfill: { running: boolean; progress: BackfillProgress | null; last: BackfillSummary | null; error: string | null }
  /** Location of the last matched raid (nameId), used when the raid starts. */
  lastRaidLocation: string | null
  setState: (s: WatcherState) => void
  setSettings: (s: DesktopSettings) => void
  setBackfill: (patch: Partial<DesktopUiState['backfill']>) => void
  setLastRaidLocation: (l: string | null) => void
}

export const useDesktopStore = create<DesktopUiState>()((set) => ({
  state: null,
  settings: null,
  backfill: { running: false, progress: null, last: null, error: null },
  lastRaidLocation: null,
  setState: (state) => set({ state }),
  setSettings: (settings) => set({ settings }),
  setBackfill: (patch) => set((s) => ({ backfill: { ...s.backfill, ...patch } })),
  setLastRaidLocation: (lastRaidLocation) => set({ lastRaidLocation }),
}))

export async function updateDesktopSettings(patch: Partial<DesktopSettings>): Promise<void> {
  if (!window.desktop) return
  const next = await window.desktop.setSettings(patch)
  useDesktopStore.getState().setSettings(next)
}

/** Applies one parsed game event to the progress store. Safe to call repeatedly. */
export function applyGameEvent(e: GameEvent): void {
  const progress = useProgressStore.getState()
  const mode = modeToGameMode(e.mode, progress.gameMode)
  switch (e.kind) {
    case 'taskFinished':
      progress.setTaskCompletedFor(mode, e.taskId, true)
      break
    case 'taskStarted':
      progress.markTaskStartedFor(mode, e.taskId)
      break
    case 'taskFailed':
      progress.markTaskFailedFor(mode, e.taskId)
      break
    default:
      break
  }
}

function applyBackfillResult(result: BackfillResult): BackfillSummary {
  const progress = useProgressStore.getState()
  const found: Record<GameMode, number> = { regular: 0, pve: 0 }
  const added: Record<GameMode, number> = { regular: 0, pve: 0 }
  for (const e of result.events) {
    if (e.kind === 'taskStarted' || e.kind === 'taskFailed') applyGameEvent(e)
  }
  for (const sessionMode of Object.keys(result.finishedByMode) as SessionMode[]) {
    const ids = result.finishedByMode[sessionMode]
    if (ids.length === 0) continue
    const gm = modeToGameMode(sessionMode, 'regular')
    found[gm] += ids.length
    added[gm] += progress.addCompletedFor(gm, ids)
  }
  return { at: Date.now(), folders: result.folders, files: result.files, found, added }
}

/** Runs "Read past logs" and merges the result into progress. */
export async function runBackfill(): Promise<BackfillSummary | null> {
  const api = window.desktop
  if (!api) return null
  const ui = useDesktopStore.getState()
  if (ui.backfill.running) return null
  ui.setBackfill({ running: true, progress: null, error: null })
  try {
    const result = await api.readPastLogs()
    const summary = applyBackfillResult(result)
    useDesktopStore.getState().setBackfill({ running: false, progress: null, last: summary })
    useDesktopStore.getState().setSettings(await api.getSettings())
    return summary
  } catch (err) {
    useDesktopStore.getState().setBackfill({ running: false, error: err instanceof Error ? err.message : 'Backfill failed' })
    return null
  }
}

/**
 * Mounted once per window inside the router. Subscribes to the main process,
 * applies events to the stores, drives timers, switches game mode, opens the
 * map on raid start and triggers the one-time automatic backfill.
 */
export function DesktopBridge() {
  const navigate = useNavigate()
  const gameData = useGameData()

  useEffect(() => {
    const api = window.desktop
    if (!api) return
    const ui = useDesktopStore.getState()
    void api.getState().then(ui.setState)
    void api.getSettings().then(ui.setSettings)

    const offState = api.onState((s) => useDesktopStore.getState().setState(s))
    const offSettings = api.onSettingsChanged((s) => useDesktopStore.getState().setSettings(s))
    const offProgress = api.onBackfillProgress((p) => useDesktopStore.getState().setBackfill({ progress: p }))
    const offWipe = api.onWipeDetected((e) => useWipeBannerStore.getState().show(e))
    const offEvent = api.onEvent((e) => {
      applyGameEvent(e)
      if (e.kind === 'sessionMode' && (e.mode === 'pve' || e.mode === 'regular' || e.mode === 'seasonal')) {
        const gm = modeToGameMode(e.mode, 'regular')
        if (useProgressStore.getState().gameMode !== gm) useProgressStore.getState().setGameMode(gm)
      }
      if (e.historical) return
      const maps = gameData.data?.maps ?? []
      if (e.kind === 'raidMatched') useDesktopStore.getState().setLastRaidLocation(e.location)
      if (e.kind === 'raidStarted') {
        const loc = useDesktopStore.getState().lastRaidLocation
        const map = loc ? maps.find((m) => m.nameId.toLowerCase() === loc.toLowerCase()) : undefined
        useTimersStore.getState().startRaid(e.at, loc, map?.raidDuration ? map.raidDuration * 60 : null)
        beep('start')
      }
      if (e.kind === 'raidEnded' || e.kind === 'matchingAborted') useTimersStore.getState().endRaid()
      if (e.kind === 'raidMatched' || e.kind === 'mapLoading') {
        const map =
          e.kind === 'raidMatched'
            ? maps.find((m) => m.nameId.toLowerCase() === e.location.toLowerCase())
            : maps.find((m) => m.scenePath && m.scenePath.toLowerCase() === e.scenePath.toLowerCase())
        if (!map) return
        // The overlay always follows the current raid; the main window only if the setting is on.
        if (isOverlayWindow() || useDesktopStore.getState().settings?.openMapOnRaid) {
          useUiStore.getState().setLastMapKey(map.normalizedName)
          if (!isOverlayWindow()) navigate('/maps')
        }
      }
    })
    return () => {
      offState()
      offSettings()
      offProgress()
      offWipe()
      offEvent()
    }
    // gameData.data is read lazily inside the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // First connection to a logs folder: read past logs once, automatically (main window only).
  const logsPath = useDesktopStore((s) => s.state?.logsPath ?? null)
  const settings = useDesktopStore((s) => s.settings)
  useEffect(() => {
    if (!window.desktop || isOverlayWindow() || !logsPath || !settings || settings.initialBackfillDone) return
    void runBackfill()
  }, [logsPath, settings])

  return null
}
