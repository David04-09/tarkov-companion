/**
 * The search bar's stash scan: a snip of a few stash or container slots, scanned in this window.
 * The scanner (item pictures, name reader) loads only when a snip arrives and is unloaded again
 * once it is done, so the bar stays light while you play.
 */
import { create } from 'zustand'
import type { Detection, Grid } from '../scan/core'

export interface StashScan {
  id: number
  /** The snipped part of the screen (PNG) and a page URL for it. */
  image: Blob
  url: string
  width: number
  height: number
  status: 'waiting' | 'reading' | 'matching' | 'done' | 'error'
  /** 0..1 while matching. */
  progress: number
  error: string | null
  grid: Grid | null
  detections: Detection[]
}

interface StashScanState {
  scan: StashScan | null
  /** A new snip: replaces the last one (its results go away). */
  start: (image: Blob, width: number, height: number) => void
  patch: (id: number, p: Partial<StashScan>) => void
  clear: () => void
}

let nextId = 1

export const useStashScan = create<StashScanState>()((set, get) => ({
  scan: null,
  start: (image, width, height) => {
    const old = get().scan
    if (old) URL.revokeObjectURL(old.url)
    set({ scan: { id: nextId++, image, url: URL.createObjectURL(image), width, height, status: 'waiting', progress: 0, error: null, grid: null, detections: [] } })
  },
  patch: (id, p) => set((s) => (s.scan?.id === id ? { scan: { ...s.scan, ...p } } : s)),
  clear: () => {
    const old = get().scan
    if (old) URL.revokeObjectURL(old.url)
    set({ scan: null })
  },
}))

/** Scans the waiting snip once (the body calls this when it sees one). */
export async function runStashScan(id: number): Promise<void> {
  const st = useStashScan.getState()
  const scan = st.scan
  if (!scan || scan.id !== id || scan.status !== 'waiting') return
  st.patch(id, { status: 'reading' })
  const [scanner, ocr, learned, cellSize] = await Promise.all([import('../scan/scanner'), import('../scan/ocr'), import('../scan/learned'), import('../scan/cellSize')])
  try {
    // Your own corrections from the app's scanner count here too (same saved data).
    await learned.useLearnedStore.getState().load()
    // The printed item names first (they make matches much surer); scanning works without them.
    const words = await ocr.readWords(scan.image, null).catch(() => undefined)
    useStashScan.getState().patch(id, { status: 'matching' })
    const r = await scanner.scanImage(
      scan.image,
      null,
      (p) => useStashScan.getState().patch(id, { progress: p }),
      learned.learnedFingerprints(learned.useLearnedStore.getState().records),
      undefined,
      words,
      cellSize.rememberedCellSize(),
    )
    useStashScan.getState().patch(id, { status: 'done', grid: r.grid, detections: r.detections, progress: 1 })
  } catch (e) {
    useStashScan.getState().patch(id, { status: 'error', error: e instanceof Error ? e.message : String(e) })
  } finally {
    // The item pictures and the name reader are big: let them go until the next snip.
    scanner.unloadScanner()
    ocr.unloadOcr()
  }
}

/** Cuts the dragged box (picture pixels) out of the screen picture. */
export async function cropSnip(screenPng: Blob, box: { x: number; y: number; w: number; h: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(screenPng, box.x, box.y, box.w, box.h)
  const canvas = new OffscreenCanvas(box.w, box.h)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/png' })
}
