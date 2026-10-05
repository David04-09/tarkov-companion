/**
 * Geometry for the scan dialog's box editor. Everything works in whole grid cells, so
 * dragged boxes snap to the stash grid.
 */
import type { Grid } from './core'

export interface Cells {
  col: number
  row: number
  w: number
  h: number
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** The grid cell under an image point, clamped to the grid. */
export function cellAt(grid: Grid, x: number, y: number): { col: number; row: number } {
  return {
    col: clamp(Math.floor((x - grid.ox) / grid.pitch), 0, grid.cols - 1),
    row: clamp(Math.floor((y - grid.oy) / grid.pitch), 0, grid.rows - 1),
  }
}

/** The box spanning two cells (both included), in either drag direction. */
export function spanCells(a: { col: number; row: number }, b: { col: number; row: number }): Cells {
  return { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row), w: Math.abs(a.col - b.col) + 1, h: Math.abs(a.row - b.row) + 1 }
}

/** `orig` moved by the cells the pointer travelled, kept inside the grid. */
export function moveBox(orig: Cells, from: { col: number; row: number }, to: { col: number; row: number }, grid: Grid): Cells {
  return {
    ...orig,
    col: clamp(orig.col + to.col - from.col, 0, grid.cols - orig.w),
    row: clamp(orig.row + to.row - from.row, 0, grid.rows - orig.h),
  }
}

/** `orig` resized by dragging one corner; the opposite corner stays put. */
export function resizeBox(orig: Cells, corner: Corner, to: { col: number; row: number }): Cells {
  const anchor = {
    col: corner === 'nw' || corner === 'sw' ? orig.col + orig.w - 1 : orig.col,
    row: corner === 'nw' || corner === 'ne' ? orig.row + orig.h - 1 : orig.row,
  }
  return spanCells(anchor, to)
}

export const sameCells = (a: Cells, b: Cells) => a.col === b.col && a.row === b.row && a.w === b.w && a.h === b.h

/** `inner` lies completely inside `outer`. */
export function covers(outer: Cells, inner: Cells): boolean {
  return inner.col >= outer.col && inner.row >= outer.row && inner.col + inner.w <= outer.col + outer.w && inner.row + inner.h <= outer.row + outer.h
}

export function overlaps(a: Cells, b: Cells): boolean {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h
}
