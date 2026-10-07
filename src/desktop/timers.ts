import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { prefs } from '../store/prefs'
import { guarded } from '../store/guarded'

/** Survive-to-count threshold: leaving earlier is a "run-through". */
export const RUN_THROUGH_SECONDS = 7 * 60

export interface TimersState {
  /** Live raid from the log watcher. */
  raidStartedAt: number | null
  raidMapNameId: string | null
  /** Raid length in seconds (from the map data), null if unknown. */
  raidDurationSeconds: number | null
  /** Scav cooldown end (ms since epoch), persisted so it survives restarts. */
  scavCooldownEndsAt: number | null
  scavCooldownMinutes: number
  soundsEnabled: boolean
  startRaid: (at: number, mapNameId: string | null, durationSeconds: number | null) => void
  endRaid: () => void
  startScavCooldown: () => void
  cancelScavCooldown: () => void
  setScavCooldownMinutes: (m: number) => void
  setSoundsEnabled: (on: boolean) => void
}

export const useTimersStore = create<TimersState>()(
  persist(
    (set, get) => ({
      raidStartedAt: null,
      raidMapNameId: null,
      raidDurationSeconds: null,
      scavCooldownEndsAt: null,
      scavCooldownMinutes: 20,
      soundsEnabled: false,
      startRaid: (at, mapNameId, durationSeconds) => set({ raidStartedAt: at, raidMapNameId: mapNameId, raidDurationSeconds: durationSeconds }),
      endRaid: () => set({ raidStartedAt: null, raidMapNameId: null, raidDurationSeconds: null }),
      startScavCooldown: () => set({ scavCooldownEndsAt: Date.now() + get().scavCooldownMinutes * 60_000 }),
      cancelScavCooldown: () => set({ scavCooldownEndsAt: null }),
      setScavCooldownMinutes: (m) => set({ scavCooldownMinutes: Math.max(1, Math.min(90, Math.round(m))) }),
      setSoundsEnabled: (soundsEnabled) => set({ soundsEnabled }),
    }),
    {
      name: 'tarkov-companion-timers',
      version: 1,
      ...guarded<TimersState>({ scavCooldownEndsAt: 'number', scavCooldownMinutes: 'number', soundsEnabled: 'boolean' }),
      partialize: (s) => ({ scavCooldownEndsAt: s.scavCooldownEndsAt, scavCooldownMinutes: s.scavCooldownMinutes, soundsEnabled: s.soundsEnabled }),
    },
  ),
)

/** Short synthesized beep (no audio files needed); silent when sounds are off. */
export function beep(kind: 'start' | 'ok' | 'done' = 'ok') {
  if (!useTimersStore.getState().soundsEnabled) return
  try {
    const Ctx = window.AudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = kind === 'start' ? [660, 880] : kind === 'done' ? [880, 660, 880] : [784]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.value = 0.16 * (prefs().soundVolume / 100)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.18)
      osc.stop(ctx.currentTime + i * 0.18 + 0.15)
    })
    setTimeout(() => void ctx.close(), 1500)
  } catch {
    // audio unavailable
  }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
