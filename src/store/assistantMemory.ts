import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  addChatter,
  addNote,
  emptyHabits,
  learnWord,
  recordAsk,
  recordRaid,
  recordResult,
  type Habits,
  type LearnedWord,
  type MemoryNote,
  type Style,
  type StylePref,
} from '../assistant/memory'
import { words } from '../assistant/text'
import { guarded } from './guarded'
import type { RaidResult } from './raidLog'

/** One raid's two log lines (map loading, raid matched) count once. */
const SAME_RAID_MS = 10 * 60_000

/**
 * What the assistant has learned about the player (assistant/memory.ts). Saved in this PC's
 * localStorage only (`tarkov-companion-assistant-memory`), shown and wiped from the Neural
 * network tab, and never sent anywhere.
 */
interface AssistantMemoryState {
  /** Learn from the player at all (off = nothing new is saved; what is saved is still used). */
  learning: boolean
  notes: MemoryNote[]
  words: LearnedWord[]
  habits: Habits
  style: Style
  /** Day (YYYY-MM-DD) of the last greeting, so it greets once a day. */
  lastGreetDay: string | null
  /** Old game logs were read for habits (once; later raids are counted live). */
  seededAt: number | null
  lastRaid: { mapKey: string; at: number } | null
  /** Things said to someone else during a wake-word conversation ("not you" taught it), never answered. */
  chatter: string[]
  setLearning: (on: boolean) => void
  remember: (text: string) => void
  forgetNote: (id: string) => void
  learn: (phrase: string, means: string) => void
  forgetWord: (phrase: string) => void
  usedWords: (phrases: string[]) => void
  raid: (mapKey: string, at: number) => void
  raidResult: (mapKey: string, result: RaidResult | null, before: RaidResult | null) => void
  ask: (kind: string) => void
  spoke: (cut: boolean) => void
  setStyle: (pref: StylePref) => void
  greeted: (day: string) => void
  seed: (habits: Habits, at: number) => void
  forgetAll: () => void
  notForMe: (text: string) => void
  forMe: (text: string) => void
  clearChatter: () => void
}

const fresh = () => ({
  notes: [] as MemoryNote[],
  words: [] as LearnedWord[],
  habits: emptyHabits(),
  style: { pref: 'auto', spoken: 0, cut: 0 } as Style,
  lastGreetDay: null as string | null,
  seededAt: null as number | null,
  lastRaid: null as { mapKey: string; at: number } | null,
  chatter: [] as string[],
})

const isNote = (n: unknown): n is MemoryNote => typeof n === 'object' && n !== null && typeof (n as MemoryNote).text === 'string' && typeof (n as MemoryNote).id === 'string'
const isWord = (w: unknown): w is LearnedWord => typeof w === 'object' && w !== null && typeof (w as LearnedWord).phrase === 'string' && typeof (w as LearnedWord).means === 'string'

export const useAssistantMemory = create<AssistantMemoryState>()(
  persist(
    (set, get) => ({
      learning: true,
      ...fresh(),
      setLearning: (on) => set({ learning: on }),
      remember: (text) => set((s) => ({ notes: addNote(s.notes, text, Date.now()) })),
      forgetNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      learn: (phrase, means) => set((s) => ({ words: learnWord(s.words, phrase, means, Date.now()) })),
      forgetWord: (phrase) => set((s) => ({ words: s.words.filter((w) => w.phrase !== phrase) })),
      usedWords: (phrases) => set((s) => ({ words: s.words.map((w) => (phrases.includes(w.phrase) ? { ...w, uses: w.uses + 1 } : w)) })),
      raid: (mapKey, at) => {
        const s = get()
        if (!s.learning) return
        if (s.lastRaid && s.lastRaid.mapKey === mapKey && Math.abs(at - s.lastRaid.at) < SAME_RAID_MS) return
        set({ habits: recordRaid(s.habits, mapKey, at), lastRaid: { mapKey, at } })
      },
      raidResult: (mapKey, result, before) => {
        if (get().learning) set((s) => ({ habits: recordResult(s.habits, mapKey, result, before) }))
      },
      ask: (kind) => {
        if (get().learning) set((s) => ({ habits: recordAsk(s.habits, kind) }))
      },
      spoke: (cut) => {
        if (get().learning) set((s) => ({ style: { ...s.style, spoken: s.style.spoken + 1, cut: s.style.cut + (cut ? 1 : 0) } }))
      },
      setStyle: (pref) => set((s) => ({ style: { ...s.style, pref } })),
      greeted: (day) => set({ lastGreetDay: day }),
      seed: (habits, at) => set({ habits, seededAt: at }),
      forgetAll: () => set(fresh()),
      notForMe: (text) => set((s) => ({ chatter: addChatter(s.chatter, text) })),
      forMe: (text) => set((s) => ({ chatter: s.chatter.filter((c) => c !== words(text).join(' ')) })),
      clearChatter: () => set({ chatter: [] }),
    }),
    {
      name: 'tarkov-companion-assistant-memory',
      partialize: (s) => ({ learning: s.learning, notes: s.notes, words: s.words, habits: s.habits, style: s.style, lastGreetDay: s.lastGreetDay, seededAt: s.seededAt, lastRaid: s.lastRaid, chatter: s.chatter }),
      ...guarded<AssistantMemoryState>({
        learning: 'boolean',
        notes: (v) => (Array.isArray(v) ? v.filter(isNote).slice(-200) : undefined),
        words: (v) => (Array.isArray(v) ? v.filter(isWord).slice(-300) : undefined),
        habits: (v) => {
          const h = v as Habits
          return h && typeof h.maps === 'object' && Array.isArray(h.hours) && h.hours.length === 24 && Array.isArray(h.days) && h.days.length === 7 ? { ...emptyHabits(), ...h } : undefined
        },
        style: (v) => {
          const st = v as Style
          return st && ['auto', 'short', 'full'].includes(st.pref) && typeof st.spoken === 'number' && typeof st.cut === 'number' ? st : undefined
        },
        lastGreetDay: (v) => (typeof v === 'string' && v.length <= 10 ? v : undefined),
        seededAt: 'number',
        chatter: (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(-60) : undefined),
        lastRaid: (v) => (v && typeof (v as { mapKey?: unknown }).mapKey === 'string' ? v : undefined),
      }),
    },
  ),
)
