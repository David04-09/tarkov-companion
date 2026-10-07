import { create } from 'zustand'
import type { GameMode } from '../api/client'

/** What the last "Apply" changed, so it can be undone (kept while the app runs). */
export interface LastApply {
  mode: GameMode
  /** Item Collection counts before the apply, per item id. */
  previous: Record<string, number>
  /** "Confirmed" scanner memories saved by that apply. */
  learnedIds: string[]
  summary: string
}

/** Opens the stash scanner, optionally with an image to scan right away. */
interface ScanUiState {
  open: boolean
  image: Blob | null
  /** Bumped for every new image so the dialog rescans. */
  nonce: number
  openWith: (image?: Blob | null) => void
  close: () => void
  lastApply: LastApply | null
  setLastApply: (a: LastApply | null) => void
  addLearnedId: (id: string) => void
}

export const useScanStore = create<ScanUiState>()((set) => ({
  open: false,
  image: null,
  nonce: 0,
  openWith: (image) => set((s) => ({ open: true, image: image ?? s.image, nonce: image ? s.nonce + 1 : s.nonce })),
  close: () => set({ open: false }),
  lastApply: null,
  setLastApply: (lastApply) => set({ lastApply }),
  addLearnedId: (id) => set((s) => (s.lastApply ? { lastApply: { ...s.lastApply, learnedIds: [...s.lastApply.learnedIds, id] } } : {})),
}))


/** First image on the clipboard event, if any. */
export function imageFromClipboard(e: ClipboardEvent): Blob | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}
