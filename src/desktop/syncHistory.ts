/**
 * Every quest the game log ticked automatically, so each one can be checked and
 * undone. Undone ticks are remembered by their exact log line, so re-reading
 * the same log (app restart, "Read past logs") never re-applies them.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameMode } from '../api/client'
import { useProgressStore } from '../store/progress'

export type SyncSource = 'live' | 'past-logs'

export interface SyncEntry {
  id: string
  mode: GameMode
  taskId: string
  /** When the game logged the hand-in (ms). */
  at: number
  /** When the app applied it (ms). */
  appliedAt: number
  source: SyncSource
  /** Log file and line the hand-in came from, for checking. */
  file: string
  line: number
  undone: boolean
}

const MAX_ENTRIES = 400

/** Stable identity of one log line for one mode. */
export const lineKey = (mode: GameMode, taskId: string, file: string, line: number) => `${mode}:${taskId}:${file}:${line}`

interface SyncHistoryState {
  entries: SyncEntry[]
  /** lineKey() of every tick the user undid. */
  undoneKeys: string[]
  /** Quest ids (per mode) the user undid at least once: "mode:taskId". */
  undoneTasks: string[]
  /** Latest live tick, for the on-screen "Undo" toast. */
  toast: SyncEntry | null
  record: (entries: Omit<SyncEntry, 'id' | 'appliedAt' | 'undone'>[], showToast?: boolean) => void
  undo: (id: string) => void
  redo: (id: string) => void
  dismissToast: () => void
}

export const useSyncHistory = create<SyncHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      undoneKeys: [],
      undoneTasks: [],
      toast: null,
      record: (list, showToast = false) => {
        if (list.length === 0) return
        const now = Date.now()
        const added = list.map((e, i) => ({ ...e, id: `${now}-${i}-${e.taskId}`, appliedAt: now, undone: false }))
        set((s) => ({
          entries: [...added.reverse(), ...s.entries].slice(0, MAX_ENTRIES),
          toast: showToast ? added[0] : s.toast,
        }))
      },
      undo: (id) => {
        const entry = get().entries.find((e) => e.id === id)
        if (!entry || entry.undone) return
        useProgressStore.getState().setTaskCompletedFor(entry.mode, entry.taskId, false)
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, undone: true } : e)),
          undoneKeys: [...new Set([...s.undoneKeys, lineKey(entry.mode, entry.taskId, entry.file, entry.line)])],
          undoneTasks: [...new Set([...s.undoneTasks, `${entry.mode}:${entry.taskId}`])],
          toast: s.toast?.id === id ? null : s.toast,
        }))
      },
      redo: (id) => {
        const entry = get().entries.find((e) => e.id === id)
        if (!entry || !entry.undone) return
        useProgressStore.getState().setTaskCompletedFor(entry.mode, entry.taskId, true)
        const key = lineKey(entry.mode, entry.taskId, entry.file, entry.line)
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, undone: false } : e)),
          undoneKeys: s.undoneKeys.filter((k) => k !== key),
        }))
      },
      dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'tarkov-companion-sync-history',
      version: 1,
      partialize: (s) => ({ entries: s.entries, undoneKeys: s.undoneKeys, undoneTasks: s.undoneTasks }),
    },
  ),
)

/** Latest still-applied automatic tick for a quest, if any (for the "from game log" badge). */
export function autoTickFor(entries: SyncEntry[], mode: GameMode, taskId: string): SyncEntry | undefined {
  return entries.find((e) => e.mode === mode && e.taskId === taskId && !e.undone)
}
