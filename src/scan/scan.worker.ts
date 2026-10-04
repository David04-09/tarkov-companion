/// <reference lib="webworker" />
/**
 * Runs the stash scan off the UI thread. The page sends the fingerprint files
 * once ("init"), then screenshots ("scan") as ImageBitmaps plus an optional crop.
 */
import { buildCandidates, detectGrid, indexFromParts, scanGrid, type Detection, type FingerprintHeader, type FingerprintIndex, type Grid } from './core'

export type WorkerRequest =
  | { type: 'init'; header: FingerprintHeader; pixels: ArrayBuffer }
  | { type: 'scan'; id: number; bitmap: ImageBitmap; crop: { x: number; y: number; w: number; h: number } | null; pitch?: number }

export type WorkerResponse =
  | { type: 'ready'; items: number }
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'result'; id: number; grid: Grid; detections: Detection[]; ms: number }
  | { type: 'error'; id: number; message: string }

let index: FingerprintIndex | null = null
let candidates: ReturnType<typeof buildCandidates> | null = null

const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') {
    index = indexFromParts(msg.header, new Uint8Array(msg.pixels))
    candidates = buildCandidates(index)
    post({ type: 'ready', items: index.ids.length })
    return
  }
  if (msg.type === 'scan') {
    try {
      if (!index || !candidates) throw new Error('Scanner data not loaded yet')
      const t0 = performance.now()
      const crop = msg.crop ?? { x: 0, y: 0, w: msg.bitmap.width, h: msg.bitmap.height }
      const canvas = new OffscreenCanvas(crop.w, crop.h)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('No 2D canvas in this browser')
      ctx.drawImage(msg.bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
      msg.bitmap.close()
      const pixels = ctx.getImageData(0, 0, crop.w, crop.h)
      const img = { width: pixels.width, height: pixels.height, data: pixels.data }
      const grid = detectGrid(img, msg.pitch)
      const detections = scanGrid(img, grid, candidates, index, {}, (done, total) => post({ type: 'progress', id: msg.id, done, total }))
      // Report positions in full-screenshot coordinates.
      const shifted: Grid = { ...grid, ox: grid.ox + crop.x, oy: grid.oy + crop.y }
      post({ type: 'result', id: msg.id, grid: shifted, detections, ms: Math.round(performance.now() - t0) })
    } catch (err) {
      post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
    }
  }
}
