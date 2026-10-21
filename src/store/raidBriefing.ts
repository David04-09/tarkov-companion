import { create } from 'zustand'
import type { RaidBriefing } from '../briefing/raidBriefing'

/**
 * The live raid briefing (not saved: it only matters during the raid it was made for).
 * `request` is set when the game loads a map; RaidBriefingHost builds the briefing from it.
 */
interface RaidBriefingState {
  request: { mapKey: string; at: number; nonce: number } | null
  current: RaidBriefing | null
  /** Map and time of the last briefing, so the two log lines of one raid brief once. */
  last: { mapKey: string; at: number } | null
  /** The last briefed raid has ended (the next load of the same map is a new raid). */
  ended: boolean
  ask: (mapKey: string, at: number) => void
  show: (briefing: RaidBriefing, at: number) => void
  close: () => void
  raidEnded: () => void
}

export const useRaidBriefingStore = create<RaidBriefingState>()((set) => ({
  request: null,
  current: null,
  last: null,
  ended: false,
  ask: (mapKey, at) => set((s) => ({ request: { mapKey, at, nonce: (s.request?.nonce ?? 0) + 1 } })),
  show: (briefing, at) => set({ current: briefing, last: { mapKey: briefing.mapKey, at }, ended: false }),
  close: () => set({ current: null }),
  raidEnded: () => set({ current: null, ended: true }),
}))
