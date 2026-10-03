import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProgressExport } from './progress'

export interface ProgressArchive {
  id: string
  at: number
  label: string
  progress: ProgressExport
}

export interface ArchivesState {
  archives: ProgressArchive[]
  add: (label: string, progress: ProgressExport) => void
  remove: (id: string) => void
}

/** Snapshots of progress kept when a wipe is detected (or taken manually). */
export const useArchivesStore = create<ArchivesState>()(
  persist(
    (set) => ({
      archives: [],
      add: (label, progress) =>
        set((s) => ({ archives: [{ id: `${Date.now().toString(36)}`, at: Date.now(), label, progress }, ...s.archives].slice(0, 20) })),
      remove: (id) => set((s) => ({ archives: s.archives.filter((a) => a.id !== id) })),
    }),
    { name: 'tarkov-companion-archives', version: 1 },
  ),
)
