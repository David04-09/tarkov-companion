import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'

export type Faction = 'USEC' | 'BEAR'

/** Progress is tracked separately per game mode, like the real game does. */
export interface Profile {
  playerLevel: number
  faction: Faction
  completedTaskIds: Set<string>
  /** Tasks the game log reported as started (accepted) and not yet finished/failed. */
  activeTaskIds: Set<string>
  /** Tasks the game log reported as failed. */
  failedTaskIds: Set<string>
}

export const MIN_LEVEL = 1
export const MAX_LEVEL = 79

interface SerializedProfile {
  playerLevel: number
  faction: Faction
  completedTaskIds: string[]
  activeTaskIds?: string[]
  failedTaskIds?: string[]
}

export interface ProgressExport {
  app: 'tarkov-companion'
  version: 1
  exportedAt: string
  gameMode: GameMode
  profiles: Record<GameMode, SerializedProfile>
}

export interface ProgressState {
  gameMode: GameMode
  profiles: Record<GameMode, Profile>
  setGameMode: (mode: GameMode) => void
  setPlayerLevel: (level: number) => void
  setFaction: (faction: Faction) => void
  /** Active-mode helpers used by the UI. */
  setTaskCompleted: (taskId: string, completed: boolean) => void
  toggleTask: (taskId: string) => void
  /** Explicit-mode helpers used by the desktop log watcher. */
  setTaskCompletedFor: (mode: GameMode, taskId: string, completed: boolean) => void
  markTaskStartedFor: (mode: GameMode, taskId: string) => void
  markTaskFailedFor: (mode: GameMode, taskId: string) => void
  /** Adds many completed tasks at once (backfill); returns how many were new. */
  addCompletedFor: (mode: GameMode, taskIds: string[]) => number
  resetProgress: () => void
  exportProgress: () => ProgressExport
  /** Replaces all progress with the given export. Throws if the shape is invalid. */
  importProgress: (data: unknown) => void
}

const emptyProfile = (): Profile => ({
  playerLevel: 1,
  faction: 'USEC',
  completedTaskIds: new Set(),
  activeTaskIds: new Set(),
  failedTaskIds: new Set(),
})

const clampLevel = (n: number) =>
  Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(Number.isFinite(n) ? n : MIN_LEVEL)))

// --- Set <-> JSON helpers so the persisted state survives localStorage ----

interface SerializedSet {
  __type: 'Set'
  values: string[]
}

const isSerializedSet = (v: unknown): v is SerializedSet =>
  typeof v === 'object' &&
  v !== null &&
  (v as { __type?: unknown }).__type === 'Set' &&
  Array.isArray((v as { values?: unknown }).values)

const replacer = (_key: string, value: unknown): unknown =>
  value instanceof Set ? ({ __type: 'Set', values: Array.from(value) } satisfies SerializedSet) : value

const reviver = (_key: string, value: unknown): unknown =>
  isSerializedSet(value) ? new Set(value.values) : value

// --- Import validation --------------------------------------------------------

const isFaction = (v: unknown): v is Faction => v === 'USEC' || v === 'BEAR'
const isGameMode = (v: unknown): v is GameMode => v === 'regular' || v === 'pve'
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

function parseProfile(raw: unknown, label: string): Profile {
  if (typeof raw !== 'object' || raw === null) throw new Error(`Missing "${label}" profile.`)
  const p = raw as Record<string, unknown>
  if (typeof p.playerLevel !== 'number') throw new Error(`"${label}.playerLevel" must be a number.`)
  if (!isFaction(p.faction)) throw new Error(`"${label}.faction" must be USEC or BEAR.`)
  if (!isStringArray(p.completedTaskIds)) throw new Error(`"${label}.completedTaskIds" must be a list of task ids.`)
  return {
    playerLevel: clampLevel(p.playerLevel),
    faction: p.faction,
    completedTaskIds: new Set(p.completedTaskIds),
    activeTaskIds: new Set(isStringArray(p.activeTaskIds) ? p.activeTaskIds : []),
    failedTaskIds: new Set(isStringArray(p.failedTaskIds) ? p.failedTaskIds : []),
  }
}

export function parseProgressExport(data: unknown): { gameMode: GameMode; profiles: Record<GameMode, Profile> } {
  if (typeof data !== 'object' || data === null) throw new Error('File is not a JSON object.')
  const d = data as Record<string, unknown>
  if (d.app !== 'tarkov-companion') throw new Error('This file was not exported by Tarkov Companion.')
  if (typeof d.profiles !== 'object' || d.profiles === null) throw new Error('Missing "profiles".')
  const profiles = d.profiles as Record<string, unknown>
  return {
    gameMode: isGameMode(d.gameMode) ? d.gameMode : 'regular',
    profiles: {
      regular: parseProfile(profiles.regular, 'regular'),
      pve: parseProfile(profiles.pve, 'pve'),
    },
  }
}

// --- Store ----------------------------------------------------------------------

function withCompleted(p: Profile, taskId: string, completed: boolean): Profile {
  if (p.completedTaskIds.has(taskId) === completed && !(completed && (p.activeTaskIds.has(taskId) || p.failedTaskIds.has(taskId)))) return p
  const next = new Set(p.completedTaskIds)
  const active = new Set(p.activeTaskIds)
  const failed = new Set(p.failedTaskIds)
  if (completed) {
    next.add(taskId)
    active.delete(taskId)
    failed.delete(taskId)
  } else {
    next.delete(taskId)
  }
  return { ...p, completedTaskIds: next, activeTaskIds: active, failedTaskIds: failed }
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => {
      const updateProfileFor = (mode: GameMode, fn: (p: Profile) => Profile) =>
        set((s) => {
          const nextProfile = fn(s.profiles[mode])
          if (nextProfile === s.profiles[mode]) return s
          return { profiles: { ...s.profiles, [mode]: nextProfile } }
        })
      const updateProfile = (fn: (p: Profile) => Profile) => updateProfileFor(get().gameMode, fn)

      return {
        gameMode: 'regular',
        profiles: { regular: emptyProfile(), pve: emptyProfile() },

        setGameMode: (gameMode) => set({ gameMode }),
        setPlayerLevel: (level) => updateProfile((p) => ({ ...p, playerLevel: clampLevel(level) })),
        setFaction: (faction) => updateProfile((p) => ({ ...p, faction })),
        setTaskCompleted: (taskId, completed) => updateProfile((p) => withCompleted(p, taskId, completed)),
        toggleTask: (taskId) => {
          const s = get()
          s.setTaskCompleted(taskId, !s.profiles[s.gameMode].completedTaskIds.has(taskId))
        },
        setTaskCompletedFor: (mode, taskId, completed) => updateProfileFor(mode, (p) => withCompleted(p, taskId, completed)),
        markTaskStartedFor: (mode, taskId) =>
          updateProfileFor(mode, (p) => {
            if (p.activeTaskIds.has(taskId) && !p.failedTaskIds.has(taskId)) return p
            const active = new Set(p.activeTaskIds)
            const failed = new Set(p.failedTaskIds)
            active.add(taskId)
            failed.delete(taskId)
            return { ...p, activeTaskIds: active, failedTaskIds: failed }
          }),
        markTaskFailedFor: (mode, taskId) =>
          updateProfileFor(mode, (p) => {
            if (p.failedTaskIds.has(taskId) && !p.activeTaskIds.has(taskId)) return p
            const active = new Set(p.activeTaskIds)
            const failed = new Set(p.failedTaskIds)
            active.delete(taskId)
            failed.add(taskId)
            return { ...p, activeTaskIds: active, failedTaskIds: failed }
          }),
        addCompletedFor: (mode, taskIds) => {
          let added = 0
          updateProfileFor(mode, (p) => {
            const fresh = taskIds.filter((id) => !p.completedTaskIds.has(id))
            added = fresh.length
            if (fresh.length === 0) return p
            const next = new Set(p.completedTaskIds)
            const active = new Set(p.activeTaskIds)
            const failed = new Set(p.failedTaskIds)
            for (const id of fresh) {
              next.add(id)
              active.delete(id)
              failed.delete(id)
            }
            return { ...p, completedTaskIds: next, activeTaskIds: active, failedTaskIds: failed }
          })
          return added
        },
        resetProgress: () => updateProfile(() => emptyProfile()),

        exportProgress: () => {
          const s = get()
          const serialize = (p: Profile): SerializedProfile => ({
            playerLevel: p.playerLevel,
            faction: p.faction,
            completedTaskIds: Array.from(p.completedTaskIds),
            activeTaskIds: Array.from(p.activeTaskIds),
            failedTaskIds: Array.from(p.failedTaskIds),
          })
          return {
            app: 'tarkov-companion',
            version: 1,
            exportedAt: new Date().toISOString(),
            gameMode: s.gameMode,
            profiles: { regular: serialize(s.profiles.regular), pve: serialize(s.profiles.pve) },
          }
        },
        importProgress: (data) => {
          const parsed = parseProgressExport(data)
          set({ gameMode: parsed.gameMode, profiles: parsed.profiles })
        },
      }
    },
    {
      name: 'tarkov-companion-progress',
      version: 2,
      storage: createJSONStorage(() => localStorage, { replacer, reviver }),
      // v1 -> v2 only added activeTaskIds/failedTaskIds, which `merge` fills in.
      // Without a migrate function zustand would throw the old state away.
      migrate: (persisted) => persisted as ProgressState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>
        const mergeProfile = (base: Profile, stored?: Partial<Profile>): Profile => ({
          ...base,
          ...(stored ?? {}),
          completedTaskIds: stored?.completedTaskIds instanceof Set ? stored.completedTaskIds : base.completedTaskIds,
          activeTaskIds: stored?.activeTaskIds instanceof Set ? stored.activeTaskIds : new Set(),
          failedTaskIds: stored?.failedTaskIds instanceof Set ? stored.failedTaskIds : new Set(),
        })
        return {
          ...current,
          gameMode: isGameMode(p.gameMode) ? p.gameMode : current.gameMode,
          profiles: {
            regular: mergeProfile(current.profiles.regular, p.profiles?.regular),
            pve: mergeProfile(current.profiles.pve, p.profiles?.pve),
          },
        }
      },
    },
  ),
)

/** The profile for the currently selected game mode. */
export const useProfile = (): Profile => useProgressStore((s) => s.profiles[s.gameMode])
