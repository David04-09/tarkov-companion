/**
 * Renderer side of the desktop bridge. Everything here is a no-op in the web
 * build (window.desktop is undefined), so desktop-only UI simply hides.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { create } from 'zustand'
import type { GameMode } from '../api/client'
import { gameDataKeys, useGameData } from '../api/hooks'
import { fetchGameData } from '../api/queries'
import { queryClient } from '../api/queryClient'
import type { GameData } from '../api/types'
import type { BackfillProgress, BackfillResult, DesktopSettings, GameEvent, SessionMode, UpdateStatus, WatcherState } from '../shared/desktop-api'
import { useProgressStore } from '../store/progress'
import { useUiStore } from '../store/ui'
import { useLocalFlags } from './localFlags'
import { lineKey, useSyncHistory } from './syncHistory'
import { beep, useTimersStore } from './timers'
import { useWipeBannerStore } from './wipe'

export const isDesktop = (): boolean => typeof window !== 'undefined' && Boolean(window.desktop)

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
  updateStatus: UpdateStatus | null
  /** Result of 'Read past logs' waiting for the user to confirm. */
  review: BackfillReview | null
  setReview: (r: BackfillReview | null) => void
  setUpdateStatus: (u: UpdateStatus) => void
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
  updateStatus: null,
  review: null,
  setReview: (review) => set({ review }),
  setUpdateStatus: (updateStatus) => set({ updateStatus }),
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

/** Quest exists in the loaded game data for this mode (filters dailies/weeklies and stray ids). */
function isKnownTask(mode: GameMode, taskId: string): boolean {
  const data = queryClient.getQueryData<GameData>(gameDataKeys.mode(mode))
  // Without data we cannot check; the store ignores unknown ids on screen anyway.
  return data ? Boolean(data.tasksById[taskId]) : true
}

/** Applies one parsed game event to the progress store. Safe to call repeatedly. */
export function applyGameEvent(e: GameEvent): void {
  const progress = useProgressStore.getState()
  const mode = modeToGameMode(e.mode, progress.gameMode)
  switch (e.kind) {
    case 'taskFinished': {
      if (!isKnownTask(mode, e.taskId)) return
      const history = useSyncHistory.getState()
      // The user undid this exact hand-in before: re-reading the log must not re-tick it.
      if (history.undoneKeys.includes(lineKey(mode, e.taskId, e.source.file, e.source.line))) return
      if (progress.profiles[mode].completedTaskIds.has(e.taskId)) return
      progress.setTaskCompletedFor(mode, e.taskId, true)
      history.record([{ mode, taskId: e.taskId, at: e.at, source: 'live', file: e.source.file, line: e.source.line }], !e.historical)
      break
    }
    case 'taskStarted':
      if (isKnownTask(mode, e.taskId)) progress.markTaskStartedFor(mode, e.taskId)
      break
    case 'taskFailed':
      if (isKnownTask(mode, e.taskId)) progress.markTaskFailedFor(mode, e.taskId)
      break
    default:
      break
  }
}

export interface ReviewItem {
  mode: GameMode
  taskId: string
  at: number
  file: string
  line: number
  /** The user undid this quest's automatic tick before: offered, but unticked. */
  previouslyUndone: boolean
}

export interface BackfillReview {
  items: ReviewItem[]
  folders: number
  files: number
  skippedOtherProfile: number
  /** Quests the log shows as handed in that are already ticked. */
  alreadyDone: Record<GameMode, number>
}

/**
 * Turns a backfill result into a list for the user to confirm. Nothing is ticked
 * here; started/failed states (which never complete anything) are applied for
 * the current profile only.
 */
async function buildReview(result: BackfillResult): Promise<BackfillReview> {
  // Quest names and the "is this a real quest" check need the game data for every mode
  // that has hand-ins; load it first so dailies/weeklies never slip through.
  const modesNeeded = new Set<GameMode>()
  for (const sessionMode of Object.keys(result.finishedByMode) as SessionMode[]) {
    if (result.finishedByMode[sessionMode].length > 0) modesNeeded.add(modeToGameMode(sessionMode, 'regular'))
  }
  await Promise.all([...modesNeeded].map((m) => queryClient.ensureQueryData({ queryKey: gameDataKeys.mode(m), queryFn: ({ signal }) => fetchGameData(m, signal) })))
  const progress = useProgressStore.getState()
  const history = useSyncHistory.getState()
  const alreadyDone: Record<GameMode, number> = { regular: 0, pve: 0 }
  const latest = new Map<string, GameEvent>()
  for (const e of result.events) {
    if (e.kind === 'taskFinished') latest.set(`${e.mode}:${e.taskId}`, e)
    if ((e.kind === 'taskStarted' || e.kind === 'taskFailed') && e.profileId === result.currentProfileByMode[e.mode]) applyGameEvent(e)
  }
  const items: ReviewItem[] = []
  for (const sessionMode of Object.keys(result.finishedByMode) as SessionMode[]) {
    const mode = modeToGameMode(sessionMode, 'regular')
    for (const taskId of result.finishedByMode[sessionMode]) {
      if (!isKnownTask(mode, taskId)) continue
      if (progress.profiles[mode].completedTaskIds.has(taskId)) {
        alreadyDone[mode] += 1
        continue
      }
      const ev = latest.get(`${sessionMode}:${taskId}`)
      items.push({
        mode,
        taskId,
        at: ev?.at ?? 0,
        file: ev?.source.file ?? '',
        line: ev?.source.line ?? 0,
        previouslyUndone: history.undoneTasks.includes(`${mode}:${taskId}`),
      })
    }
  }
  items.sort((a, b) => b.at - a.at)
  return { items, folders: result.folders, files: result.files, skippedOtherProfile: result.skippedOtherProfile, alreadyDone }
}

/** Ticks the quests the user kept selected in the review. */
export function applyReview(review: BackfillReview, selected: ReadonlySet<string>): BackfillSummary {
  const progress = useProgressStore.getState()
  const found: Record<GameMode, number> = { regular: review.alreadyDone.regular, pve: review.alreadyDone.pve }
  const added: Record<GameMode, number> = { regular: 0, pve: 0 }
  const picked = review.items.filter((i) => selected.has(`${i.mode}:${i.taskId}`))
  for (const mode of ['regular', 'pve'] as GameMode[]) {
    const ids = picked.filter((i) => i.mode === mode).map((i) => i.taskId)
    found[mode] += review.items.filter((i) => i.mode === mode).length
    added[mode] += progress.addCompletedFor(mode, ids)
  }
  useSyncHistory.getState().record(picked.map((i) => ({ mode: i.mode, taskId: i.taskId, at: i.at, source: 'past-logs' as const, file: i.file, line: i.line })))
  const summary: BackfillSummary = { at: Date.now(), folders: review.folders, files: review.files, found, added }
  useLocalFlags.getState().setBackfillDone(true)
  useDesktopStore.getState().setBackfill({ last: summary })
  useDesktopStore.getState().setReview(null)
  return summary
}

/** Closes the review without ticking anything (and does not offer it again automatically). */
export function dismissReview(): void {
  useLocalFlags.getState().setBackfillDone(true)
  useDesktopStore.getState().setReview(null)
}

/** Runs "Read past logs" and opens the review list (nothing is ticked until the user confirms). */
export async function runBackfill(): Promise<BackfillReview | null> {
  const api = window.desktop
  if (!api) return null
  const ui = useDesktopStore.getState()
  if (ui.backfill.running) return null
  ui.setBackfill({ running: true, progress: null, error: null })
  try {
    const result = await api.readPastLogs()
    const review = await buildReview(result)
    useDesktopStore.getState().setBackfill({ running: false, progress: null })
    useDesktopStore.getState().setReview(review)
    useDesktopStore.getState().setSettings(await api.getSettings())
    return review
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
    void api.getUpdateStatus().then(ui.setUpdateStatus)
    const offUpdate = api.onUpdateStatus((u) => useDesktopStore.getState().setUpdateStatus(u))

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
        if (useDesktopStore.getState().settings?.openMapOnRaid) {
          useUiStore.getState().setLastMapKey(map.normalizedName)
          navigate('/maps')
        }
      }
    })
    return () => {
      offState()
      offSettings()
      offProgress()
      offWipe()
      offEvent()
      offUpdate()
    }
    // gameData.data is read lazily inside the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  // First connection to a logs folder: read past logs once, automatically (main window only,
  // and only after the first-run screen, which offers the same thing explicitly).
  const logsPath = useDesktopStore((s) => s.state?.logsPath ?? null)
  const setupDone = useLocalFlags((s) => s.setupDone)
  const backfillDone = useLocalFlags((s) => s.backfillDone)
  useEffect(() => {
    if (!window.desktop || !logsPath || !setupDone || backfillDone) return
    void runBackfill()
  }, [logsPath, setupDone, backfillDone])

  return null
}
