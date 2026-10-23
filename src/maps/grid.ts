/**
 * A6-style grid over a map picture (columns A–F left to right, rows 1–6 top to bottom, as the
 * picture is shown), for "zoom in on D3" by voice. Works in the picture's pixels through the
 * layer's affine, so it lines up with the screen even on rotated maps. Pure.
 */
import type { Affine, GameBounds } from './projection'

export const GRID_COLS = 'ABCDEF'
export const GRID_ROWS = 6

export interface XZ {
  x: number
  z: number
}

const toPixel = (a: Affine, p: XZ) => ({ px: a[0] * p.x + a[1] * p.z + a[2], py: a[3] * p.x + a[4] * p.z + a[5] })

function toGame(a: Affine, px: number, py: number): XZ {
  // px - c = a·x + b·z, py - f = d·x + e·z
  const det = a[0] * a[4] - a[1] * a[3]
  const u = px - a[2]
  const v = py - a[5]
  return { x: (u * a[4] - a[1] * v) / det, z: (a[0] * v - a[3] * u) / det }
}

/** The picture's extent in pixels (the layer's game bounds, projected). */
function pixelBox(a: Affine, b: GameBounds) {
  const corners = [
    { x: b[0][0], z: b[0][1] },
    { x: b[1][0], z: b[0][1] },
    { x: b[0][0], z: b[1][1] },
    { x: b[1][0], z: b[1][1] },
  ].map((p) => toPixel(a, p))
  const xs = corners.map((c) => c.px)
  const ys = corners.map((c) => c.py)
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
}

/** "D3" → column 3, row 2 (zero-based), or null. */
export function parseCell(cell: string): { col: number; row: number } | null {
  const m = /^([a-f])\s?([1-6])$/i.exec(cell.trim())
  return m ? { col: GRID_COLS.indexOf(m[1].toUpperCase()), row: Number(m[2]) - 1 } : null
}

/** The cell a spot is in ("D3"), or null outside the picture. */
export function cellOf(a: Affine, b: GameBounds, p: XZ): string | null {
  const box = pixelBox(a, b)
  const { px, py } = toPixel(a, p)
  const col = Math.floor(((px - box.x0) / (box.x1 - box.x0)) * GRID_COLS.length)
  const row = Math.floor(((py - box.y0) / (box.y1 - box.y0)) * GRID_ROWS)
  if (col < 0 || col >= GRID_COLS.length || row < 0 || row >= GRID_ROWS) return null
  return `${GRID_COLS[col]}${row + 1}`
}

/** A part of the picture (fractions 0–1 of its width and height, top left = 0,0) as game-coordinate corners. */
export function areaCorners(a: Affine, b: GameBounds, fx0: number, fy0: number, fx1: number, fy1: number): XZ[] {
  const box = pixelBox(a, b)
  const px = (f: number) => box.x0 + f * (box.x1 - box.x0)
  const py = (f: number) => box.y0 + f * (box.y1 - box.y0)
  return [toGame(a, px(fx0), py(fy0)), toGame(a, px(fx1), py(fy0)), toGame(a, px(fx1), py(fy1)), toGame(a, px(fx0), py(fy1))]
}

/** A cell's four corners in game coordinates. */
export function cellCorners(a: Affine, b: GameBounds, cell: string): XZ[] | null {
  const c = parseCell(cell)
  if (!c) return null
  return areaCorners(a, b, c.col / GRID_COLS.length, c.row / GRID_ROWS, (c.col + 1) / GRID_COLS.length, (c.row + 1) / GRID_ROWS)
}

/** Grid lines (each two game-coordinate ends) and label spots, for drawing. */
export function gridLines(a: Affine, b: GameBounds): { lines: [XZ, XZ][]; cols: { label: string; at: XZ }[]; rows: { label: string; at: XZ }[] } {
  const lines: [XZ, XZ][] = []
  for (let i = 1; i < GRID_COLS.length; i++) {
    const [top, , , bottom] = areaCorners(a, b, i / GRID_COLS.length, 0, i / GRID_COLS.length, 1)
    lines.push([top, bottom])
  }
  for (let j = 1; j < GRID_ROWS; j++) {
    const [left, right] = areaCorners(a, b, 0, j / GRID_ROWS, 1, j / GRID_ROWS)
    lines.push([left, right])
  }
  const cols = [...GRID_COLS].map((label, i) => ({ label, at: areaCorners(a, b, (i + 0.5) / GRID_COLS.length, 0.02, 0, 0)[0] }))
  const rows = Array.from({ length: GRID_ROWS }, (_, j) => ({ label: String(j + 1), at: areaCorners(a, b, 0.02, (j + 0.5) / GRID_ROWS, 0, 0)[0] }))
  return { lines, cols, rows }
}

/** Where to look, as asked by voice. */
export type MapView =
  | { kind: 'cell'; cell: string }
  | { kind: 'area'; fx0: number; fy0: number; fx1: number; fy1: number; label: string }
  | { kind: 'zoom'; delta: number }
  | { kind: 'all' }

const LETTER_SOUNDS: Record<string, string> = { ay: 'a', eh: 'a', be: 'b', bee: 'b', see: 'c', sea: 'c', cee: 'c', dee: 'd', de: 'd', ee: 'e', ef: 'f', eff: 'f' }
const NUMBERS: Record<string, string> = { one: '1', won: '1', two: '2', to: '2', too: '2', three: '3', tree: '3', four: '4', for: '4', five: '5', six: '6', sex: '6' }

/** "zoom in on D3", "d three", "bottom left corner", "zoom in", "zoom out", "whole map" … or null. */
export function parseMapView(said: string): MapView | null {
  const w = said
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const s = w.join(' ').replace(/^(?:please |can you |ok |okay )+/, '').replace(/ please$/, '')
  if (/^(?:zoom (?:all the way )?out (?:all the way|fully)|whole map|show (?:me )?the whole map|full map|reset (?:the )?(?:map|zoom)|zoom to fit)$/.test(s)) return { kind: 'all' }
  if (/^(?:zoom in|closer|zoom closer|get closer|enhance)$/.test(s)) return { kind: 'zoom', delta: 1 }
  if (/^(?:zoom out|further|zoom further out|back out)$/.test(s)) return { kind: 'zoom', delta: -1 }
  // A cell: "d3", "d 3", "dee three", "zoom in on d3", "show me square d three".
  const rest = s.replace(/^(?:zoom (?:in )?(?:on |to |into )?|show (?:me )?|go to |focus (?:on )?|look at )?(?:the )?(?:square |cell |grid |sector |box )?/, '')
  const parts = rest.split(' ')
  if (parts.length <= 2) {
    const joined = parts.length === 2 ? `${LETTER_SOUNDS[parts[0]] ?? parts[0]}${NUMBERS[parts[1]] ?? parts[1]}` : parts[0]
    if (/^[a-f][1-6]$/.test(joined)) return { kind: 'cell', cell: joined.toUpperCase() }
  }
  // A part of the map: "zoom in on the bottom left corner", "top right", "the middle".
  const area = /^(?:zoom (?:in )?(?:on |to |into )?|show (?:me )?|go to |focus (?:on )?|look at )?(?:the )?(top|upper|bottom|lower|middle|center|centre)?(?:[ -]?(left|right))?(?: (?:corner|side|part|half|of the map|bit))*$/.exec(s)
  if (area && (area[1] || area[2])) {
    const v = area[1] ? (/top|upper/.test(area[1]) ? 'top' : /bottom|lower/.test(area[1]) ? 'bottom' : 'middle') : 'middle'
    const h = area[2] ?? 'middle'
    const y = v === 'top' ? [0, 0.5] : v === 'bottom' ? [0.5, 1] : [0.25, 0.75]
    const x = h === 'left' ? [0, 0.5] : h === 'right' ? [0.5, 1] : [0.25, 0.75]
    const label = v === 'middle' && h === 'middle' ? 'the middle' : `the ${v === 'middle' ? '' : v}${v !== 'middle' && h !== 'middle' ? ' ' : ''}${h === 'middle' ? '' : h}`.trim()
    return { kind: 'area', fx0: x[0], fy0: y[0], fx1: x[1], fy1: y[1], label }
  }
  return null
}
