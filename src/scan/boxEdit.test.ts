import { describe, expect, it } from 'vitest'
import { cellAt, covers, moveBox, overlaps, resizeBox, spanCells } from './boxEdit'

const grid = { pitch: 84, ox: 6, oy: 35, cols: 14, rows: 14 }

describe('box editor geometry', () => {
  it('snaps points to cells and clamps to the grid', () => {
    expect(cellAt(grid, 6 + 84 * 7 + 10, 35 + 84 * 9 + 83)).toEqual({ col: 7, row: 9 })
    expect(cellAt(grid, -50, 5000)).toEqual({ col: 0, row: 13 })
  })
  it('spans cells in any drag direction', () => {
    expect(spanCells({ col: 9, row: 10 }, { col: 7, row: 9 })).toEqual({ col: 7, row: 9, w: 3, h: 2 })
  })
  it('moves boxes by whole cells and keeps them inside the grid', () => {
    const box = { col: 8, row: 9, w: 2, h: 1 }
    expect(moveBox(box, { col: 8, row: 9 }, { col: 7, row: 9 }, grid)).toEqual({ col: 7, row: 9, w: 2, h: 1 })
    expect(moveBox(box, { col: 8, row: 9 }, { col: 20, row: 9 }, grid)).toEqual({ col: 12, row: 9, w: 2, h: 1 })
  })
  it('resizes from a corner, keeping the opposite corner', () => {
    // The wrong 2x1 at c8 becomes the 3x2 Hand drill at c7 by dragging its top-left corner left and its
    // bottom-right corner down.
    const step1 = resizeBox({ col: 8, row: 9, w: 2, h: 1 }, 'nw', { col: 7, row: 9 })
    expect(step1).toEqual({ col: 7, row: 9, w: 3, h: 1 })
    expect(resizeBox(step1, 'se', { col: 9, row: 10 })).toEqual({ col: 7, row: 9, w: 3, h: 2 })
    // Dragging past the anchor flips the box instead of breaking it.
    expect(resizeBox({ col: 4, row: 4, w: 2, h: 2 }, 'se', { col: 2, row: 4 })).toEqual({ col: 2, row: 4, w: 3, h: 1 })
  })
  it('knows covered and overlapping boxes', () => {
    const drill = { col: 7, row: 9, w: 3, h: 2 }
    expect(covers(drill, { col: 8, row: 10, w: 2, h: 1 })).toBe(true)
    expect(covers(drill, { col: 9, row: 10, w: 2, h: 1 })).toBe(false)
    expect(overlaps(drill, { col: 9, row: 10, w: 2, h: 1 })).toBe(true)
    expect(overlaps(drill, { col: 10, row: 9, w: 1, h: 1 })).toBe(false)
  })
})
