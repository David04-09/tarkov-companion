/**
 * Corrections the user made in the scanner, kept as extra references.
 *
 * When a match is wrong and the user picks the right item, the exact patch of
 * their screenshot is saved (as a fingerprint for matching plus a small JPEG to
 * show and to use as a test image). Future scans compare against these too, so
 * the same item in the same look is recognised next time. Stored locally in
 * IndexedDB; can be exported and sent to the developer, who drops the file into
 * `scan-corrections/` so the next release ships it to everyone.
 */
import { get, set } from 'idb-keyval'
import { create } from 'zustand'
import { FP, sampleRegion, type Detection, type Grid, type LearnedFingerprint } from './core'

export type LearnedKind = 'correct' | 'confirmed' | 'not'

export interface LearnedRecord {
  id: string
  itemId: string
  /** correct = you fixed a wrong match to this item; confirmed = you kept an uncertain match; not = this look is NOT itemId. Missing = correct. */
  kind?: LearnedKind
  /** What the scanner had guessed (for the test report). */
  wrongItemId: string | null
  w: number
  h: number
  /** Fingerprint, base64 RGB (w*FP x h*FP). */
  fp: string
  /** Small JPEG of the screenshot patch (data URL). */
  thumb: string
  /** Screenshot cell size, for reference. */
  pitch: number
  createdAt: number
}

export interface CorrectionsFile {
  kind: 'tarkov-companion-scan-corrections'
  version: 1
  fp: number
  exportedAt: string
  records: LearnedRecord[]
}

const KEY = 'tarkov-companion-scan-learned'
/** Per item and footprint keep the newest few; a handful covers lighting/highlight variants. */
const PER_ITEM: Record<LearnedKind, number> = { correct: 4, confirmed: 3, not: 4 }
const MAX_RECORDS = 400

const toBase64 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

interface LearnedState {
  loaded: boolean
  records: LearnedRecord[]
  load: () => Promise<void>
  add: (r: LearnedRecord) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: () => Promise<void>
  importFile: (data: unknown) => Promise<number>
}

function prune(records: LearnedRecord[]): LearnedRecord[] {
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  const seen = new Map<string, number>()
  const out: LearnedRecord[] = []
  for (const r of sorted) {
    const kind = r.kind ?? 'correct'
    const k = `${kind}:${r.itemId}:${r.w}x${r.h}`
    const n = seen.get(k) ?? 0
    if (n >= PER_ITEM[kind]) continue
    seen.set(k, n + 1)
    out.push(r)
    if (out.length >= MAX_RECORDS) break
  }
  return out
}

export const useLearnedStore = create<LearnedState>()((setState, getState) => {
  const save = async (records: LearnedRecord[]) => {
    const pruned = prune(records)
    setState({ records: pruned })
    await set(KEY, pruned).catch(() => undefined)
  }
  return {
    loaded: false,
    records: [],
    load: async () => {
      if (getState().loaded) return
      const records = ((await get<LearnedRecord[]>(KEY).catch(() => undefined)) ?? []).filter((r) => r && r.fp && r.itemId)
      setState({ records, loaded: true })
    },
    add: async (r) => {
      await getState().load()
      await save([r, ...getState().records])
    },
    remove: async (id) => save(getState().records.filter((r) => r.id !== id)),
    clear: async () => save([]),
    importFile: async (data) => {
      const file = data as Partial<CorrectionsFile>
      if (file?.kind !== 'tarkov-companion-scan-corrections' || !Array.isArray(file.records)) throw new Error('Not a scanner corrections file')
      if (file.fp !== FP) throw new Error('Corrections were made with a different scanner version')
      await getState().load()
      const known = new Set(getState().records.map((r) => r.id))
      const fresh = file.records.filter((r) => r && typeof r.fp === 'string' && !known.has(r.id))
      await save([...fresh, ...getState().records])
      return fresh.length
    },
  }
})

/** Matcher input from stored records. */
export function learnedFingerprints(records: LearnedRecord[]): LearnedFingerprint[] {
  return records.map((r) => ({ itemId: r.itemId, w: r.w, h: r.h, fp: fromBase64(r.fp), kind: r.kind ?? 'correct' }))
}

export function exportCorrections(records: LearnedRecord[]): CorrectionsFile {
  return { kind: 'tarkov-companion-scan-corrections', version: 1, fp: FP, exportedAt: new Date().toISOString(), records }
}

/**
 * Cuts the corrected item out of the screenshot. The footprint is the detected one
 * when the chosen item has that size (or that size turned sideways); otherwise the
 * chosen item's own size, anchored at the detected cell (e.g. two small wrong
 * matches that were really one tall item).
 */
export async function recordFromCorrection(
  image: Blob,
  grid: Grid,
  det: Detection,
  item: { width: number; height: number },
  itemId: string,
): Promise<LearnedRecord | null> {
  let w = det.w
  let h = det.h
  const sameSize = (item.width === w && item.height === h) || (item.width === h && item.height === w)
  if (!sameSize) {
    w = item.width
    h = item.height
    if (det.col + w > grid.cols || det.row + h > grid.rows) return null
  }
  return recordFromSpot(image, grid, det, w, h, itemId, 'correct')
}

/** Saves the patch at a detection's cell with the given footprint, labelled itemId with the given kind. */
export async function recordFromSpot(image: Blob, grid: Grid, det: Detection, w: number, h: number, itemId: string, kind: LearnedKind): Promise<LearnedRecord | null> {
  const x0 = Math.max(0, Math.floor(grid.ox + det.col * grid.pitch))
  const y0 = Math.max(0, Math.floor(grid.oy + det.row * grid.pitch))
  const wpx = Math.ceil(w * grid.pitch + 1)
  const hpx = Math.ceil(h * grid.pitch + 1)
  const bitmap = await createImageBitmap(image, x0, y0, wpx, hpx)
  const canvas = document.createElement('canvas')
  canvas.width = wpx
  canvas.height = hpx
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = ctx.getImageData(0, 0, wpx, hpx)
  // Same sampling as the bundled fingerprints, relative to the fractional grid position.
  const fx = grid.ox + det.col * grid.pitch - x0
  const fy = grid.oy + det.row * grid.pitch - y0
  const fpFloat = sampleRegion({ width: wpx, height: hpx, data: pixels.data }, fx, fy, w * grid.pitch + 1, h * grid.pitch + 1, w * FP, h * FP)
  const fp = Uint8Array.from(fpFloat, (v) => Math.round(v))
  const thumbH = Math.min(hpx, 64 * h)
  const thumb = document.createElement('canvas')
  thumb.height = thumbH
  thumb.width = Math.round((wpx / hpx) * thumbH)
  thumb.getContext('2d')?.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    itemId,
    kind,
    wrongItemId: kind === 'correct' && det.itemId !== itemId ? det.itemId : null,
    w,
    h,
    fp: toBase64(fp),
    thumb: thumb.toDataURL('image/jpeg', 0.82),
    pitch: grid.pitch,
    createdAt: Date.now(),
  }
}
