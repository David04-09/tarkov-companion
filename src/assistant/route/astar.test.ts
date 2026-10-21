import { describe, expect, it } from 'vitest'
import { findPath, nearestOpen, simplifyPath, type WalkGrid } from './astar'

/** '#' blocked, '.' ground (cost 2), '=' road (cost 1). */
function grid(rows: string[]): WalkGrid {
  const height = rows.length
  const width = rows[0].length
  const cost = new Uint8Array(width * height)
  rows.forEach((r, y) => [...r].forEach((ch, x) => (cost[y * width + x] = ch === '#' ? 0 : ch === '=' ? 1 : 2)))
  return { width, height, cost }
}

describe('findPath', () => {
  it('goes around a wall', () => {
    const g = grid(['.....', '.###.', '.#...', '.#.#.', '...#.'])
    const p = findPath(g, [2, 2], [0, 0])
    expect(p?.[0]).toEqual([2, 2])
    expect(p?.[p.length - 1]).toEqual([0, 0])
    for (const [x, y] of p ?? []) expect(g.cost[y * 5 + x]).toBeGreaterThan(0)
  })

  it('does not squeeze diagonally between two blocked corners', () => {
    const g = grid(['.#', '#.'])
    expect(findPath(g, [0, 0], [1, 1])).toBeNull()
  })

  it('prefers a road when it is not much longer', () => {
    const g = grid(['=====', '.....', '.....'])
    const p = findPath(g, [0, 1], [4, 1]) ?? []
    // Straight across the ground costs 8; up onto the road, along it and back down is cheaper.
    expect(p.some(([, y]) => y === 0)).toBe(true)
  })
})

describe('nearestOpen and simplifyPath', () => {
  it('moves a blocked start to the closest walkable cell', () => {
    const g = grid(['###', '#.#', '###'])
    expect(nearestOpen(g, [0, 0], 3)).toEqual([1, 1])
  })

  it('keeps only the corners', () => {
    const g = grid(['.....', '.....', '.....'])
    const p = findPath(g, [0, 0], [4, 2]) ?? []
    expect(simplifyPath(g, p)).toEqual([[0, 0], [4, 2]])
  })
})
