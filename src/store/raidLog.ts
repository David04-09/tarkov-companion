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

interface RaidLogState {
  byMode: Record<GameMode, Record<string, RaidEntry>>
  setEntry: (mode: GameMode, key: string, patch: Partial<RaidEntry>) => void
  importAll: (byMode: Record<GameMode, Record<string, RaidEntry>>) => void
}

export const useRaidLogStore = create<RaidLogState>()(
  persist(
    (set) => ({
      byMode: { regular: {}, pve: {} },
      setEntry: (mode, key, patch) =>
        set((s) => ({ byMode: { ...s.byMode, [mode]: { ...s.byMode[mode], [key]: { ...s.byMode[mode][key], ...patch } } } })),
      importAll: (byMode) => set({ byMode }),
    }),
    { name: 'tarkov-companion-raid-log', version: 1 },
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
