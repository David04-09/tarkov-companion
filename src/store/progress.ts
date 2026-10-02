import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'

export type Faction = 'USEC' | 'BEAR'

/** Progress is tracked separately per game mode, like the real game does. */
export interface Profile {
  playerLevel: number
  faction: Faction
  completedTaskIds: Set<string>
}

export const MIN_LEVEL = 1
export const MAX_LEVEL = 79

export interface ProgressExport {
  app: 'tarkov-companion'
  version: 1
  exportedAt: string
  gameMode: GameMode
  profiles: Record<GameMode, { playerLevel: number; faction: Faction; completedTaskIds: string[] }>
}

export interface ProgressState {
  gameMode: GameMode
  profiles: Record<GameMode, Profile>
  setGameMode: (mode: GameMode) => void
  setPlayerLevel: (level: number) => void
  setFaction: (faction: Faction) => void
  setTaskCompleted: (taskId: string, completed: boolean) => void
  toggleTask: (taskId: string) => void
  resetProgress: () => void
  exportProgress: () => ProgressExport
  /** Replaces all progress with the given export. Throws if the shape is invalid. */
  importProgress: (data: unknown) => void
}

const emptyProfile = (): Profile => ({
  playerLevel: 1,
  faction: 'USEC',
  completedTaskIds: new Set(),
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

function parseProfile(raw: unknown, label: string): Profile {
  if (typeof raw !== 'object' || raw === null) throw new Error(`Missing "${label}" profile.`)
  const p = raw as Record<string, unknown>
  if (typeof p.playerLevel !== 'number') throw new Error(`"${label}.playerLevel" must be a number.`)
  if (!isFaction(p.faction)) throw new Error(`"${label}.faction" must be USEC or BEAR.`)
  if (!Array.isArray(p.completedTaskIds) || !p.completedTaskIds.every((x) => typeof x === 'string'))
    throw new Error(`"${label}.completedTaskIds" must be a list of task ids.`)
  return {
    playerLevel: clampLevel(p.playerLevel),
    faction: p.faction,
    completedTaskIds: new Set(p.completedTaskIds as string[]),
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

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => {
      const updateProfile = (fn: (p: Profile) => Profile) =>
        set((s) => ({
          profiles: { ...s.profiles, [s.gameMode]: fn(s.profiles[s.gameMode]) },
        }))

      return {
        gameMode: 'regular',
        profiles: { regular: emptyProfile(), pve: emptyProfile() },

        setGameMode: (gameMode) => set({ gameMode }),
        setPlayerLevel: (level) => updateProfile((p) => ({ ...p, playerLevel: clampLevel(level) })),
        setFaction: (faction) => updateProfile((p) => ({ ...p, faction })),
        setTaskCompleted: (taskId, completed) =>
          updateProfile((p) => {
            if (p.completedTaskIds.has(taskId) === completed) return p
            const next = new Set(p.completedTaskIds)
            if (completed) next.add(taskId)
            else next.delete(taskId)
            return { ...p, completedTaskIds: next }
          }),
        toggleTask: (taskId) => {
          const s = get()
          s.setTaskCompleted(taskId, !s.profiles[s.gameMode].completedTaskIds.has(taskId))
        },
        resetProgress: () => updateProfile(() => emptyProfile()),

        exportProgress: () => {
          const s = get()
          const serialize = (p: Profile) => ({
            playerLevel: p.playerLevel,
            faction: p.faction,
            completedTaskIds: Array.from(p.completedTaskIds),
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
      version: 1,
      storage: createJSONStorage(() => localStorage, { replacer, reviver }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProgressState>
        return {
          ...current,
          gameMode: isGameMode(p.gameMode) ? p.gameMode : current.gameMode,
          profiles: {
            regular: { ...current.profiles.regular, ...(p.profiles?.regular ?? {}) },
            pve: { ...current.profiles.pve, ...(p.profiles?.pve ?? {}) },
          },
        }
      },
    },
  ),
)

/** The profile for the currently selected game mode. */
export const useProfile = (): Profile => useProgressStore((s) => s.profiles[s.gameMode])
