import type { GameMap, Position } from '../../api/types'
import { findMapConfig } from '../../maps/mapConfig'
import { findPath, nearestOpen, simplifyPath, walkableAreas } from './astar'
import { terrainGrid, type TerrainGrid } from './terrainGrid'

export interface WalkRoute {
  /** Points along the way, start to end (game coordinates). */
  path: Position[]
  /** Walking length in metres (cell steps, not the smoothed corners). */
  metres: number
  /** How far the start / end had to move to reach walkable ground (inside a building, on an island, in water). */
  startMovedM: number
  endMovedM: number
}

/** How far to look for walkable ground around a start or end. */
const SNAP_M = 150

const areasOf = new WeakMap<TerrainGrid, ReturnType<typeof walkableAreas>>()

/**
 * A walking route over the map's terrain, or null when the map has no drawing to work from.
 * Start and end are joined to the map's main walkable area (small closed-off pockets in the
 * drawing, like a courtyard drawn without its gate, would otherwise have no way out).
 * Runs only when asked; the map's grid is built once and reused.
 */
export async function walkRoute(map: GameMap, from: Position, to: Position): Promise<WalkRoute | null> {
  const cfg = findMapConfig(map.normalizedName)
  if (!cfg) return null
  const grid = await terrainGrid(cfg)
  if (!grid) return null
  let areas = areasOf.get(grid)
  if (!areas) areasOf.set(grid, (areas = walkableAreas(grid)))
  const { area, largest } = areas
  const inMain = (i: number) => area[i] === largest
  const snap = Math.ceil(SNAP_M / grid.metresPerCell)
  const a0 = grid.toCell(from)
  const b0 = grid.toCell(to)
  const a = nearestOpen(grid, a0, snap, inMain)
  const b = nearestOpen(grid, b0, snap, inMain)
  if (!a || !b) return null
  const cells = findPath(grid, a, b)
  if (!cells) return null
  let steps = 0
  for (let i = 1; i < cells.length; i++) steps += cells[i][0] !== cells[i - 1][0] && cells[i][1] !== cells[i - 1][1] ? Math.SQRT2 : 1
  const movedM = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) * grid.metresPerCell
  const startMovedM = movedM(a, a0)
  const endMovedM = movedM(b, b0)
  const corners = simplifyPath(grid, cells).map((c) => grid.toGame(c))
  // Start and end exactly where they were asked for; a moved end gets a short last leg to the spot itself.
  const path = [from, ...corners.slice(startMovedM > 0 ? 0 : 1, endMovedM > 0 ? corners.length : -1), to]
  return { path, metres: steps * grid.metresPerCell, startMovedM, endMovedM }
}
