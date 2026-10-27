import { describe, expect, it } from 'vitest'
import { anchorStyle, boxIds, clampPos, cleanBoxes, openSide, shapeRects } from './boxes'

const frame = { x: 0, y: 0, width: 2560, height: 1400 }

describe('openSide', () => {
  it('opens away from the near screen edges', () => {
    expect(openSide({ x: 16, y: 16 }, frame)).toEqual({ left: false, up: false })
    expect(openSide({ x: 2400, y: 1300 }, frame)).toEqual({ left: true, up: true })
  })
})

describe('anchorStyle', () => {
  it('hangs off the glass, from its far corner when flipped', () => {
    expect(anchorStyle({ x: 100, y: 50 }, frame, { left: false, up: false }, 0, 52)).toEqual({ left: 100, top: 102 })
    // Glass at 2400 (48 wide): right edge 2448, so 112 px from the window's right edge.
    expect(anchorStyle({ x: 2400, y: 1300 }, frame, { left: true, up: true })).toEqual({ right: 112, bottom: 52 })
  })
})

describe('clampPos', () => {
  it('keeps the move bar on the screen and sizes in range', () => {
    expect(clampPos({ x: 5000, y: -50, w: 100, h: 99999 }, frame)).toEqual({ x: 2470, y: 0, w: 220, h: 1400 })
    expect(clampPos({ x: 300, y: 200 }, frame)).toEqual({ x: 300, y: 200 })
  })
})

describe('cleanBoxes', () => {
  it('keeps sane boxes only', () => {
    expect(cleanBoxes({ card: { x: 10, y: 20, w: 400, h: 300 }, 'panel:quest#1': { x: 1, y: 2, w: 10 }, bad: { x: 'a', y: 1 }, '<script>': { x: 1, y: 1 } })).toEqual({
      card: { x: 10, y: 20, w: 400, h: 300 },
      'panel:quest#1': { x: 1, y: 2 },
    })
    expect(cleanBoxes(null)).toEqual({})
  })
})

describe('shapeRects', () => {
  it('rounds outwards, adds the shadow margin and drops what is off the window', () => {
    expect(shapeRects([{ x: 10.4, y: 20.6, width: 100, height: 40 }, { x: -50, y: -50, width: 10, height: 10 }], 2560, 1400)).toEqual([{ x: 8, y: 18, width: 105, height: 45 }])
  })
})

describe('boxIds', () => {
  it('numbers repeats of one kind', () => {
    expect(boxIds(['panel:quest', 'panel:item', 'panel:quest'])).toEqual(['panel:quest', 'panel:item', 'panel:quest#1'])
  })
})
