import { describe, expect, it } from 'vitest'
import { cellCorners, cellOf, parseMapView } from './grid'
import type { Affine, GameBounds } from './projection'

// 1 px per metre, picture x = game x, picture y = -game z (north up).
const affine: Affine = [1, 0, 0, 0, -1, 0]
const bounds: GameBounds = [[0, 0], [600, 600]]

describe('map grid', () => {
  it('puts spots in A1–F6 as the picture is shown', () => {
    expect(cellOf(affine, bounds, { x: 10, z: 590 })).toBe('A1')
    expect(cellOf(affine, bounds, { x: 590, z: 10 })).toBe('F6')
    expect(cellOf(affine, bounds, { x: 350, z: 450 })).toBe('D2')
    expect(cellOf(affine, bounds, { x: 700, z: 10 })).toBeNull()
  })

  it('gives a cell back in game coordinates', () => {
    const c = cellCorners(affine, bounds, 'D2')!
    const xs = c.map((p) => Math.round(p.x))
    const zs = c.map((p) => Math.round(p.z))
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([300, 400])
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([400, 500])
  })

  it('understands spoken views', () => {
    expect(parseMapView('zoom in on d3')).toEqual({ kind: 'cell', cell: 'D3' })
    expect(parseMapView('dee three')).toEqual({ kind: 'cell', cell: 'D3' })
    expect(parseMapView('show me square b 6')).toEqual({ kind: 'cell', cell: 'B6' })
    expect(parseMapView('zoom in')).toEqual({ kind: 'zoom', delta: 1 })
    expect(parseMapView('zoom out')).toEqual({ kind: 'zoom', delta: -1 })
    expect(parseMapView('whole map')).toEqual({ kind: 'all' })
    expect(parseMapView('zoom in on the bottom left corner')).toMatchObject({ kind: 'area', fx0: 0, fy0: 0.5, fx1: 0.5, fy1: 1, label: 'the bottom left' })
    expect(parseMapView('top right')).toMatchObject({ kind: 'area', label: 'the top right' })
    for (const s of ['push left', 'how much is a gpu', 'g7', 'd9', 'extracts on customs']) expect(parseMapView(s), s).toBeNull()
  })
})
