import { describe, expect, it } from 'vitest'
import { FP, buildCandidates, detectGrid, rotateCW, scanGrid, type FingerprintIndex, type Rgba } from './core'

/** Deterministic pseudo-random fingerprint for a fake item. */
function fakeFingerprint(seed: number, w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * FP * h * FP * 3)
  let s = seed * 9301 + 49297
  for (let i = 0; i < px.length; i++) {
    s = (s * 9301 + 49297) % 233280
    px[i] = 40 + Math.floor((s / 233280) * 180)
  }
  return px
}

/** Paints fingerprints into a dark "stash" with 1-px grid lines at the given pitch. */
function renderStash(pitch: number, cols: number, rows: number, placed: { fp: Float32Array | Uint8Array; col: number; row: number; w: number; h: number }[]): Rgba {
  const width = Math.round(cols * pitch + 8)
  const height = Math.round(rows * pitch + 8)
  const data = new Uint8ClampedArray(width * height * 4)
  const ox = 4
  const oy = 4
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const onLine = Math.abs(((x - ox) % pitch + pitch) % pitch) < 1 || Math.abs(((y - oy) % pitch + pitch) % pitch) < 1
      const v = onLine ? 70 : 22
      data[i] = data[i + 1] = data[i + 2] = v
      data[i + 3] = 255
    }
  }
  for (const p of placed) {
    const x0 = ox + p.col * pitch
    const y0 = oy + p.row * pitch
    const W = p.w * pitch
    const H = p.h * pitch
    for (let y = 1; y < H; y++) {
      for (let x = 1; x < W; x++) {
        const fx = Math.min(p.w * FP - 1, Math.floor((x / W) * p.w * FP))
        const fy = Math.min(p.h * FP - 1, Math.floor((y / H) * p.h * FP))
        const si = (fy * p.w * FP + fx) * 3
        const i = ((Math.round(y0) + y) * width + Math.round(x0) + x) * 4
        data[i] = p.fp[si]
        data[i + 1] = p.fp[si + 1]
        data[i + 2] = p.fp[si + 2]
      }
    }
  }
  return { width, height, data }
}

describe('stash scanner core', () => {
  const sizes: [number, number][] = [[1, 1], [1, 1], [2, 1], [1, 2], [2, 2], [1, 1]]
  const fps = sizes.map(([w, h], i) => fakeFingerprint(i + 1, w, h))
  const total = fps.reduce((n, f) => n + f.length, 0)
  const index: FingerprintIndex = {
    ids: sizes.map((_, i) => `item${i}`),
    widths: Uint8Array.from(sizes.map((s) => s[0])),
    heights: Uint8Array.from(sizes.map((s) => s[1])),
    offsets: new Uint32Array(sizes.length),
    pixels: new Uint8Array(total),
  }
  let o = 0
  fps.forEach((f, i) => {
    index.offsets[i] = o
    index.pixels.set(f, o)
    o += f.length
  })

  it('finds the grid pitch at a non-1080p scale', () => {
    const img = renderStash(84, 8, 6, [{ fp: fps[0], col: 0, row: 0, w: 1, h: 1 }])
    const grid = detectGrid(img)
    expect(grid.pitch).toBeGreaterThan(83)
    expect(grid.pitch).toBeLessThan(85)
    expect(grid.cols).toBe(8)
  })

  it('recognises placed items, a rotated one, and ignores empty slots', () => {
    const placed = [
      { fp: fps[0], col: 0, row: 0, w: 1, h: 1 },
      { fp: fps[2], col: 2, row: 0, w: 2, h: 1 },
      { fp: fps[4], col: 4, row: 1, w: 2, h: 2 },
      { fp: rotateCW(fps[3], FP, 2 * FP), col: 0, row: 3, w: 2, h: 1 }, // 1x2 item turned sideways
      { fp: fps[5], col: 7, row: 5, w: 1, h: 1 },
    ]
    const img = renderStash(84, 8, 6, placed)
    const grid = detectGrid(img)
    const found = scanGrid(img, grid, buildCandidates(index), index)
    const summary = found.map((d) => `${d.itemId}@${d.col},${d.row}${d.rotated ? 'R' : ''}`).sort()
    expect(summary).toEqual(['item0@0,0', 'item2@2,0', 'item3@0,3R', 'item4@4,1', 'item5@7,5'].sort())
  })
})
