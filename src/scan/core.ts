/**
 * Stash screenshot scanner: pure functions on raw RGBA pixels, shared by the
 * build script (fingerprints from tarkov.dev grid images) and the in-app worker.
 *
 * How it works
 * 1. Every item has a tarkov.dev "grid image": exactly what the game draws in a
 *    stash (background tint, icon, short name). Each is reduced to a small RGB
 *    fingerprint of FP pixels per cell.
 * 2. The screenshot's grid (cell pitch and offset) is found from the faint cell
 *    lines, so any resolution / UI scale works.
 * 3. Every grid position and item footprint is sampled the same way and compared
 *    with the fingerprints of that footprint (and rotated items). The best
 *    non-overlapping matches win.
 */

/** Fingerprint resolution: pixels per cell side. */
export const FP = 12

export interface Rgba {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/**
 * Area-averaged resample of the box [x0, x0+w) × [y0, y0+h) (float coords) into
 * outW × outH RGB. Same function for fingerprints and screenshot regions, so both
 * sides blur identically.
 */
export function sampleRegion(img: Rgba, x0: number, y0: number, w: number, h: number, outW: number, outH: number, out?: Float32Array): Float32Array {
  const res = out ?? new Float32Array(outW * outH * 3)
  const sx = w / outW
  const sy = h / outH
  const { width, height, data } = img
  for (let oy = 0; oy < outH; oy++) {
    const ya = y0 + oy * sy
    const yb = ya + sy
    const iy0 = Math.max(0, Math.floor(ya))
    const iy1 = Math.min(height, Math.ceil(yb))
    for (let ox = 0; ox < outW; ox++) {
      const xa = x0 + ox * sx
      const xb = xa + sx
      const ix0 = Math.max(0, Math.floor(xa))
      const ix1 = Math.min(width, Math.ceil(xb))
      let r = 0
      let g = 0
      let b = 0
      let wsum = 0
      for (let y = iy0; y < iy1; y++) {
        const wy = Math.min(y + 1, yb) - Math.max(y, ya)
        if (wy <= 0) continue
        for (let x = ix0; x < ix1; x++) {
          const wx = Math.min(x + 1, xb) - Math.max(x, xa)
          if (wx <= 0) continue
          const wgt = wx * wy
          const i = (y * width + x) * 4
          r += data[i] * wgt
          g += data[i + 1] * wgt
          b += data[i + 2] * wgt
          wsum += wgt
        }
      }
      const o = (oy * outW + ox) * 3
      if (wsum > 0) {
        res[o] = r / wsum
        res[o + 1] = g / wsum
        res[o + 2] = b / wsum
      } else {
        res[o] = res[o + 1] = res[o + 2] = 0
      }
    }
  }
  return res
}

/** Rotates an RGB fingerprint (w × h pixels) 90° clockwise into h × w. */
export function rotateCW(src: Uint8Array | Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 3
      // (x, y) -> (h - 1 - y, x) in an h-wide image
      const di = (x * h + (h - 1 - y)) * 3
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
    }
  }
  return out
}

/**
 * Pixels to ignore when comparing: the bottom strip of the item, where the game
 * draws stack counts, durability ("60/60") and the found-in-raid tick that the
 * grid images do not have. For rotated items the short-name strip at the top is
 * ignored too (the game keeps the text horizontal while the icon turns).
 */
export function compareMask(wCells: number, hCells: number, rotated: boolean): Uint8Array {
  const W = wCells * FP
  const H = hCells * FP
  const mask = new Uint8Array(W * H)
  const bottom = H - Math.round(FP * 0.3)
  const top = rotated ? Math.round(FP * 0.25) : 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Outer 1-px frame: selection/hover borders differ between game and image.
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1
      mask[y * W + x] = edge || y >= bottom || y < top ? 0 : 1
    }
  }
  return mask
}

/** Mean absolute difference per channel over unmasked pixels (0..255). */
export function distance(a: Float32Array, b: Uint8Array | Float32Array, mask: Uint8Array, cutoff = Infinity): number {
  let sum = 0
  let n = 0
  const limit = cutoff * mask.length * 3
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    const i = p * 3
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    n += 3
    if (sum > limit) return Infinity
  }
  return n ? sum / n : Infinity
}

// ---------------------------------------------------------------------------
// Grid detection
// ---------------------------------------------------------------------------

export interface Grid {
  /** Cell pitch in screenshot pixels (cell plus one border line). */
  pitch: number
  /** Position of the first grid line. */
  ox: number
  oy: number
  cols: number
  rows: number
}

/** Edge strength profile along one axis (sum of brightness changes across the other axis). */
function edgeProfile(img: Rgba, axis: 'x' | 'y'): Float32Array {
  const { width, height, data } = img
  const len = axis === 'x' ? width : height
  const prof = new Float32Array(len)
  const lum = (x: number, y: number) => {
    const i = (y * width + x) * 4
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  if (axis === 'x') {
    for (let y = 0; y < height; y += 2) for (let x = 1; x < width - 1; x++) prof[x] += Math.abs(lum(x + 1, y) - lum(x - 1, y))
  } else {
    for (let x = 0; x < width; x += 2) for (let y = 1; y < height - 1; y++) prof[y] += Math.abs(lum(x, y + 1) - lum(x, y - 1))
  }
  return prof
}

function bestPeriod(prof: Float32Array, minP: number, maxP: number): { pitch: number; offset: number; score: number } {
  const len = prof.length
  let mean = 0
  for (const v of prof) mean += v
  mean /= len
  const at = (pos: number) => {
    const i = Math.round(pos)
    // Lines are 1-2 px wide after anti-aliasing: take the strongest of the neighbourhood.
    return Math.max(prof[i - 1] ?? 0, prof[i] ?? 0, prof[i + 1] ?? 0)
  }
  const results: { pitch: number; offset: number; score: number }[] = []
  for (let p = minP; p <= maxP; p += 0.05) {
    let best = -Infinity
    let bestOff = 0
    for (let off = 0; off < p; off += 0.5) {
      let s = 0
      let k = 0
      for (let pos = off; pos < len - 1; pos += p) {
        s += at(pos)
        k++
      }
      if (k < 3) continue
      const score = s / k - mean
      if (score > best) {
        best = score
        bestOff = off
      }
    }
    results.push({ pitch: p, offset: bestOff, score: best })
  }
  const top = Math.max(...results.map((r) => r.score))
  // Multiples of the true pitch score as high as the pitch itself: take the smallest strong one.
  return results.find((r) => r.score >= top * 0.92) ?? results[0]
}

/** Finds the stash cell grid. `hintPitch` narrows the search (e.g. from a previous scan). */
export function detectGrid(img: Rgba, hintPitch?: number): Grid {
  const minP = hintPitch ? hintPitch * 0.97 : Math.max(32, img.height / 40)
  const maxP = hintPitch ? hintPitch * 1.03 : Math.min(160, img.height / 4)
  const px = bestPeriod(edgeProfile(img, 'x'), minP, maxP)
  // Same pitch both ways: search y only around the x result.
  const py = bestPeriod(edgeProfile(img, 'y'), px.pitch * 0.98, px.pitch * 1.02)
  const pitch = (px.pitch + py.pitch) / 2
  const cols = Math.floor((img.width - px.offset) / pitch)
  const rows = Math.floor((img.height - py.offset) / pitch)
  return { pitch, ox: px.offset, oy: py.offset, cols, rows }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface FingerprintIndex {
  /** Item ids in file order. */
  ids: string[]
  widths: Uint8Array
  heights: Uint8Array
  offsets: Uint32Array
  /** All fingerprints, RGB, FP px per cell. */
  pixels: Uint8Array
}

export interface Detection {
  itemId: string
  col: number
  row: number
  /** Footprint as seen on screen (after rotation). */
  w: number
  h: number
  rotated: boolean
  /** Mean absolute difference (lower is better). */
  error: number
  /** Next best different items for this spot, for "change item". */
  alternatives: { itemId: string; error: number }[]
}

export interface ScanOptions {
  /** Accept matches below this error (0..255 per channel). */
  maxError?: number
  /** Only these item ids (e.g. skip presets). */
  allow?: (id: string) => boolean
}

interface Candidate {
  idx: number
  rotated: boolean
  fp: Uint8Array | Float32Array
  mean: [number, number, number]
  /** Pixels that belong to the item itself (icon + name), not its slot background; null if too few. */
  iconMask: Uint8Array | null
  iconMean: [number, number, number]
}

/** Extra error added to background-free matches, so a full match is preferred when both fit. */
const ICON_PENALTY = 4

/**
 * The item's own pixels: everything that differs clearly from the slot background
 * (estimated from the ring just inside the frame). Lets a match survive a tinted or
 * highlighted slot (e.g. a grey "BrokenLCD" slot vs the dark-blue reference).
 */
function iconMaskFor(fp: Uint8Array | Float32Array, w: number, h: number, base: Uint8Array): Uint8Array | null {
  const W = w * FP
  const H = h * FP
  const ring: number[][] = [[], [], []]
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (x !== 1 && y !== 1 && x !== W - 2 && y !== H - 2) continue
      const i = (y * W + x) * 3
      for (let c = 0; c < 3; c++) ring[c].push(fp[i + c])
    }
  }
  const bg = ring.map((vals) => vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)])
  const mask = new Uint8Array(base.length)
  let n = 0
  let total = 0
  for (let p = 0; p < base.length; p++) {
    if (!base[p]) continue
    total++
    const i = p * 3
    const d = Math.abs(fp[i] - bg[0]) + Math.abs(fp[i + 1] - bg[1]) + Math.abs(fp[i + 2] - bg[2])
    if (d > 36) {
      mask[p] = 1
      n++
    }
  }
  // Tiny icons would match random textures: only use this for substantial items.
  return n >= Math.max(24, total * 0.4) ? mask : null
}

function meanColor(v: Uint8Array | Float32Array, mask: Uint8Array): [number, number, number] {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue
    r += v[p * 3]
    g += v[p * 3 + 1]
    b += v[p * 3 + 2]
    n++
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0]
}

/** Groups fingerprints by on-screen footprint "WxH", adding rotated variants of non-square items. */
export function buildCandidates(index: FingerprintIndex, opts: ScanOptions = {}): Map<string, Candidate[]> {
  const groups = new Map<string, Candidate[]>()
  const push = (w: number, h: number, c: Candidate) => {
    const key = `${w}x${h}`
    const list = groups.get(key)
    if (list) list.push(c)
    else groups.set(key, [c])
  }
  for (let i = 0; i < index.ids.length; i++) {
    if (opts.allow && !opts.allow(index.ids[i])) continue
    const w = index.widths[i]
    const h = index.heights[i]
    const len = w * FP * h * FP * 3
    const fp = index.pixels.subarray(index.offsets[i], index.offsets[i] + len)
    const add = (cw: number, ch: number, rotated: boolean, f: Uint8Array | Float32Array) => {
      const base = compareMask(cw, ch, rotated)
      // Rotated thin items (stocks, barrels) match too much without their background.
      const iconMask = rotated ? null : iconMaskFor(f, cw, ch, base)
      push(cw, ch, { idx: i, rotated, fp: f, mean: meanColor(f, base), iconMask, iconMean: iconMask ? meanColor(f, iconMask) : [0, 0, 0] })
    }
    add(w, h, false, fp)
    if (w !== h) add(h, w, true, rotateCW(fp, w * FP, h * FP))
  }
  return groups
}

const AREA_BONUS = 0.8

/**
 * Empty slots: the plainest cells of the screenshot (lowest contrast) form an
 * "empty slot" template; any cell close to it is empty. A completely full grid
 * has no low-contrast cells, so nothing is marked empty.
 */
export function emptyCells(img: Rgba, grid: Grid): boolean[][] {
  const cells: { v: Float32Array; sd: number }[][] = []
  for (let r = 0; r < grid.rows; r++) {
    const rowCells: { v: Float32Array; sd: number }[] = []
    for (let c = 0; c < grid.cols; c++) {
      const v = sampleRegion(img, grid.ox + c * grid.pitch, grid.oy + r * grid.pitch, grid.pitch + 1, grid.pitch + 1, FP, FP)
      let m = 0
      for (let i = 0; i < v.length; i++) m += v[i]
      m /= v.length
      let q = 0
      for (let i = 0; i < v.length; i++) q += (v[i] - m) ** 2
      rowCells.push({ v, sd: Math.sqrt(q / v.length) })
    }
    cells.push(rowCells)
  }
  const plain = cells.flat().filter((c) => c.sd < 8)
  if (plain.length === 0) return cells.map((r) => r.map(() => false))
  const tpl = new Float32Array(FP * FP * 3)
  for (const c of plain) for (let i = 0; i < tpl.length; i++) tpl[i] += c.v[i] / plain.length
  const mask = compareMask(1, 1, false)
  return cells.map((r) => r.map((c) => c.sd < 10 && distance(c.v, tpl, mask) < 6))
}

/** Looks for items on the grid; returns non-overlapping detections, best first. */
export function scanGrid(img: Rgba, grid: Grid, candidates: Map<string, Candidate[]>, index: FingerprintIndex, opts: ScanOptions = {}, onProgress?: (done: number, total: number) => void): Detection[] {
  const maxError = opts.maxError ?? 28
  const footprints = [...candidates.keys()].map((k) => k.split('x').map(Number) as [number, number])
  const raw: Detection[] = []
  const masks = new Map<string, Uint8Array>()
  const maskFor = (w: number, h: number, rotated: boolean) => {
    const k = `${w}x${h}${rotated ? 'r' : ''}`
    let m = masks.get(k)
    if (!m) masks.set(k, (m = compareMask(w, h, rotated)))
    return m
  }
  const empty = emptyCells(img, grid)
  const total = grid.rows * grid.cols
  let done = 0
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (empty[row][col]) {
        done++
        continue
      }
      for (const [w, h] of footprints) {
        if (col + w > grid.cols || row + h > grid.rows) continue
        // An item never covers an empty slot.
        let coversEmpty = false
        for (let y = row; y < row + h && !coversEmpty; y++) for (let x = col; x < col + w; x++) if (empty[y][x]) coversEmpty = true
        if (coversEmpty) continue
        const x0 = grid.ox + col * grid.pitch
        const y0 = grid.oy + row * grid.pitch
        const region = sampleRegion(img, x0, y0, w * grid.pitch + 1, h * grid.pitch + 1, w * FP, h * FP)
        const list = candidates.get(`${w}x${h}`) ?? []
        const top: { idx: number; rotated: boolean; error: number }[] = []
        let cutoff = maxError * 1.5
        const regionMean = { plain: meanColor(region, maskFor(w, h, false)), rot: meanColor(region, maskFor(w, h, true)) }
        for (const c of list) {
          const rm = c.rotated ? regionMean.rot : regionMean.plain
          // Cheap reject: average colour far off means the full comparison cannot win.
          const md = (Math.abs(rm[0] - c.mean[0]) + Math.abs(rm[1] - c.mean[1]) + Math.abs(rm[2] - c.mean[2])) / 3
          let err = md > cutoff ? Infinity : distance(region, c.fp, maskFor(w, h, c.rotated), cutoff)
          // Second opinion on the item's own pixels only (slot background ignored).
          if (c.iconMask) {
            const im = meanColor(region, c.iconMask)
            const imd = (Math.abs(im[0] - c.iconMean[0]) + Math.abs(im[1] - c.iconMean[1]) + Math.abs(im[2] - c.iconMean[2])) / 3
            if (imd <= cutoff) {
              const iconErr = distance(region, c.fp, c.iconMask, Math.min(err, cutoff)) + ICON_PENALTY
              if (iconErr < err) err = iconErr
            }
          }
          if (err === Infinity) continue
          top.push({ idx: c.idx, rotated: c.rotated, error: err })
          top.sort((a, b) => a.error - b.error)
          if (top.length > 6) top.length = 6
          if (top.length === 6) cutoff = Math.min(cutoff, top[5].error)
        }
        if (top.length && top[0].error <= maxError) {
          const best = top[0]
          const seen = new Set([index.ids[best.idx]])
          const alternatives: Detection['alternatives'] = []
          for (const t of top.slice(1)) {
            const id = index.ids[t.idx]
            if (seen.has(id)) continue
            seen.add(id)
            alternatives.push({ itemId: id, error: t.error })
          }
          raw.push({ itemId: index.ids[best.idx], col, row, w, h, rotated: best.rotated, error: best.error, alternatives })
        }
      }
      done++
      if (onProgress && done % 8 === 0) onProgress(done, total)
    }
  }
  // Greedy, best first, no overlaps. A whole item fits slightly worse than one of its own
  // corners does (more pixels, more chance of a highlight), so larger footprints get a
  // small bonus per extra cell: the 400 ml WD-40 must beat "100 ml WD-40 + something".
  const rank = (d: Detection) => d.error - AREA_BONUS * (d.w * d.h - 1)
  raw.sort((a, b) => rank(a) - rank(b))
  const taken = new Set<string>()
  const out: Detection[] = []
  for (const d of raw) {
    let free = true
    for (let y = d.row; y < d.row + d.h && free; y++) for (let x = d.col; x < d.col + d.w; x++) if (taken.has(`${x},${y}`)) free = false
    if (!free) continue
    for (let y = d.row; y < d.row + d.h; y++) for (let x = d.col; x < d.col + d.w; x++) taken.add(`${x},${y}`)
    out.push(d)
  }
  onProgress?.(total, total)
  return out.sort((a, b) => a.row - b.row || a.col - b.col)
}

/** Serialized fingerprint file: JSON header line + binary pixels. */
export interface FingerprintHeader {
  version: 1
  fp: number
  generated: string
  items: { id: string; w: number; h: number; o: number }[]
}

export function indexFromParts(header: FingerprintHeader, pixels: Uint8Array): FingerprintIndex {
  const n = header.items.length
  const index: FingerprintIndex = {
    ids: header.items.map((i) => i.id),
    widths: new Uint8Array(n),
    heights: new Uint8Array(n),
    offsets: new Uint32Array(n),
    pixels,
  }
  header.items.forEach((it, i) => {
    index.widths[i] = it.w
    index.heights[i] = it.h
    index.offsets[i] = it.o
  })
  return index
}
