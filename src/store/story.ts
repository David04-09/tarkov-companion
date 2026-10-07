/**
 * Story chapter progress per game mode: ticked objectives, running wait timers and the
 * ending path the player follows in The Ticket. Objectives are keyed by the stable key
 * from `api/storyWiki.ts` (slug of the wiki text + occurrence).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'
import { guarded } from './guarded'

export interface StoryTimer {
  startedAt: number
  minH: number
  maxH: number
  /** "Falling Skies: Wait for information from Prapor" (for the notification). */
  label: string
  /** Set once the "ready" notification was shown. */
  notified?: boolean
}

export interface ChapterProgress {
  /** Objective key -> when it was ticked (ms). */
  done: Record<string, number>
  timers: Record<string, StoryTimer>
  /** Guide tab / ending followed (The Ticket), e.g. "Savior ending". */
  path?: string
}

export type StoryByMode = Record<GameMode, Record<string, ChapterProgress>>

interface StoryState {
  byMode: StoryByMode
  setDone: (mode: GameMode, chapter: string, key: string, done: boolean) => void
  setTimer: (mode: GameMode, chapter: string, key: string, timer: StoryTimer | null) => void
  /** Starts (or restarts) a wait timer from now. */
  startTimer: (mode: GameMode, chapter: string, key: string, wait: Omit<StoryTimer, 'startedAt' | 'notified'>) => void
  markNotified: (mode: GameMode, chapter: string, key: string) => void
  setPath: (mode: GameMode, chapter: string, path: string) => void
  resetChapter: (mode: GameMode, chapter: string) => void
  resetAll: () => void
  importAll: (byMode: StoryByMode) => void
}

const empty = (): ChapterProgress => ({ done: {}, timers: {} })

export const useStoryStore = create<StoryState>()(
  persist(
    (set) => {
      const patch = (mode: GameMode, chapter: string, fn: (c: ChapterProgress) => ChapterProgress) =>
        set((s) => ({ byMode: { ...s.byMode, [mode]: { ...s.byMode[mode], [chapter]: fn(s.byMode[mode][chapter] ?? empty()) } } }))
      return {
        byMode: { regular: {}, pve: {} },
        setDone: (mode, chapter, key, done) =>
          patch(mode, chapter, (c) => {
            const next = { ...c.done }
            if (done) next[key] = Date.now()
            else delete next[key]
            return { ...c, done: next }
          }),
        setTimer: (mode, chapter, key, timer) =>
          patch(mode, chapter, (c) => {
            const next = { ...c.timers }
            if (timer) next[key] = timer
            else delete next[key]
            return { ...c, timers: next }
          }),
        startTimer: (mode, chapter, key, wait) =>
          patch(mode, chapter, (c) => ({ ...c, timers: { ...c.timers, [key]: { ...wait, startedAt: Date.now() } } })),
        markNotified: (mode, chapter, key) =>
          patch(mode, chapter, (c) => (c.timers[key] ? { ...c, timers: { ...c.timers, [key]: { ...c.timers[key], notified: true } } } : c)),
        setPath: (mode, chapter, path) => patch(mode, chapter, (c) => ({ ...c, path })),
        resetChapter: (mode, chapter) =>
          set((s) => {
            const next = { ...s.byMode[mode] }
            delete next[chapter]
            return { byMode: { ...s.byMode, [mode]: next } }
          }),
        resetAll: () => set({ byMode: { regular: {}, pve: {} } }),
        importAll: (byMode) => set({ byMode }),
      }
    },
    { name: 'tarkov-companion-story', version: 1, ...guarded<StoryState>({ byMode: (v) => parseStory(v) }) },
  ),
)

/** Loose validation for the story part of an imported progress file. */
export function parseStory(raw: unknown): StoryByMode | null {
  if (typeof raw !== 'object' || raw === null) return null
  const out: StoryByMode = { regular: {}, pve: {} }
  for (const mode of ['regular', 'pve'] as const) {
    const chapters = (raw as Record<string, unknown>)[mode]
    if (typeof chapters !== 'object' || chapters === null) continue
    for (const [slug, c] of Object.entries(chapters as Record<string, unknown>)) {
      if (typeof c !== 'object' || c === null) continue
      const cp = c as Partial<ChapterProgress>
      out[mode][slug] = {
        done: typeof cp.done === 'object' && cp.done ? (cp.done as Record<string, number>) : {},
        timers: typeof cp.timers === 'object' && cp.timers ? (cp.timers as Record<string, StoryTimer>) : {},
        path: typeof cp.path === 'string' ? cp.path : undefined,
      }
    }
  }
  return out
}
