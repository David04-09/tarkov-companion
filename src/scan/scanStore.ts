import { create } from 'zustand'

/** Opens the stash scanner, optionally with an image to scan right away. */
interface ScanUiState {
  open: boolean
  image: Blob | null
  /** Bumped for every new image so the dialog rescans. */
  nonce: number
  openWith: (image?: Blob | null) => void
  close: () => void
}

export const useScanStore = create<ScanUiState>()((set) => ({
  open: false,
  image: null,
  nonce: 0,
  openWith: (image) => set((s) => ({ open: true, image: image ?? s.image, nonce: image ? s.nonce + 1 : s.nonce })),
  close: () => set({ open: false }),
}))

/** First image on the clipboard event, if any. */
export function imageFromClipboard(e: ClipboardEvent): Blob | null {
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}
