/**
 * Your own raid results. The game log says a raid happened (map, start, end) but not how
 * it ended, so you mark each raid: survived, died, MIA or run-through, PMC or Scav, plus a
 * note. Keyed per game mode by raid key (see raidKey).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'

export type RaidResult = 'survived' | 'died' | 'mia' | 'runthrough'
export type RaidRole = 'pmc' | 'scav'

export interface RaidEntry {
  result?: RaidResult
  role?: RaidRole
  note?: string
}

/** Stable id for a logged raid: the game's short raid id plus the minute it ended (known live and in old logs). */
export const raidKey = (raidId: string, end: number) => `${raidId || 'raid'}@${Math.round(end / 60_000)}`

export const RESULT_LABEL: Record<RaidResult, string> = {
  survived: 'Survived',
  died: 'Died',
  mia: 'MIA',
  runthrough: 'Run-through',
}

/** A raid added by hand (the game did not log it on this PC). */
export interface ManualRaid {
  key: string
  /** Map display name. */
  location: string
  at: number
  minutes: number | null
}

interface RaidLogState {
  byMode: Record<GameMode, Record<string, RaidEntry>>
  manual: Record<GameMode, ManualRaid[]>
  /** Logged raids the user hid (wrong entries, e.g. a loading screen counted as a raid). */
  hidden: Record<GameMode, string[]>
  setEntry: (mode: GameMode, key: string, patch: Partial<RaidEntry>) => void
  addManual: (mode: GameMode, raid: Omit<ManualRaid, 'key'>, entry: RaidEntry) => void
  removeManual: (mode: GameMode, key: string) => void
  setHidden: (mode: GameMode, key: string, hidden: boolean) => void
  importAll: (byMode: Record<GameMode, Record<string, RaidEntry>>, manual?: Record<GameMode, ManualRaid[]>, hidden?: Record<GameMode, string[]>) => void
}

export const useRaidLogStore = create<RaidLogState>()(
  persist(
    (set) => ({
      byMode: { regular: {}, pve: {} },
      manual: { regular: [], pve: [] },
      hidden: { regular: [], pve: [] },
      addManual: (mode, raid, entry) =>
        set((s) => {
          const key = `manual:${raid.at}`
          return {
            manual: { ...s.manual, [mode]: [...(s.manual?.[mode] ?? []), { ...raid, key }] },
            byMode: { ...s.byMode, [mode]: { ...s.byMode[mode], [key]: entry } },
          }
        }),
      removeManual: (mode, key) => set((s) => ({ manual: { ...s.manual, [mode]: (s.manual?.[mode] ?? []).filter((r) => r.key !== key) } })),
      setHidden: (mode, key, hidden) =>
        set((s) => {
          const list = (s.hidden?.[mode] ?? []).filter((k) => k !== key)
          return { hidden: { ...s.hidden, [mode]: hidden ? [...list, key] : list } }
        }),
      setEntry: (mode, key, patch) =>
        set((s) => ({ byMode: { ...s.byMode, [mode]: { ...s.byMode[mode], [key]: { ...s.byMode[mode][key], ...patch } } } })),
      importAll: (byMode, manual, hidden) => set({ byMode, manual: manual ?? { regular: [], pve: [] }, hidden: hidden ?? { regular: [], pve: [] } }),
    }),
    {
      name: 'tarkov-companion-raid-log',
      version: 1,
      // Saves from 1.8.0 have no manual/hidden lists yet.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<RaidLogState>
        return { ...current, byMode: p.byMode ?? current.byMode, manual: p.manual ?? current.manual, hidden: p.hidden ?? current.hidden }
      },
    },
  ),
)

/** Survival rate from marked raids: survived (+ run-through) out of all marked. */
export function survivalOf(entries: (RaidEntry | undefined)[]): { marked: number; survived: number; died: number; mia: number; runthrough: number; rate: number | null } {
  let survived = 0
  let died = 0
  let mia = 0
  let runthrough = 0
  for (const e of entries) {
    if (e?.result === 'survived') survived++
    else if (e?.result === 'died') died++
    else if (e?.result === 'mia') mia++
    else if (e?.result === 'runthrough') runthrough++
  }
  const marked = survived + died + mia + runthrough
  return { marked, survived, died, mia, runthrough, rate: marked ? (survived + runthrough) / marked : null }
}
