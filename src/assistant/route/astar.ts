/**
 * Shortest walking path on a grid (A*), pure so it can be tested. Each cell has a cost:
 * 0 = cannot walk there (water, fence, rocks, minefield, building, outside the map),
 * otherwise the effort to cross it (roads are cheapest).
 */

export interface WalkGrid {
  width: number
  height: number
  /** Row-major, 0 = blocked, 1..255 = cost of entering the cell. */
  cost: Uint8Array
}

export type Cell = [number, number]

const SQRT2 = Math.SQRT2

/** Smallest cost in the grid, for an admissible heuristic. */
function minCost(grid: WalkGrid): number {
  let m = 255
  for (let i = 0; i < grid.cost.length; i++) if (grid.cost[i] && grid.cost[i] < m) m = grid.cost[i]
  return m
}

/** Binary heap of cell indexes ordered by f score. */
class Heap {
  private items: number[] = []
  private score: Float64Array
  constructor(score: Float64Array) {
    this.score = score
  }
  get size() {
    return this.items.length
  }
  push(i: number) {
    const a = this.items
    a.push(i)
    let n = a.length - 1
    while (n > 0) {
      const p = (n - 1) >> 1
      if (this.score[a[p]] <= this.score[a[n]]) break
      ;[a[p], a[n]] = [a[n], a[p]]
      n = p
    }
  }
  pop(): number {
    const a = this.items
    const top = a[0]
    const last = a.pop() as number
    if (a.length) {
      a[0] = last
      let n = 0
      for (;;) {
        const l = 2 * n + 1
        const r = l + 1
        let m = n
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r
        if (m === n) break
        ;[a[m], a[n]] = [a[n], a[m]]
        n = m
      }
    }
    return top
  }
}

/**
 * Connected walkable areas (4-neighbour, which equals what A* can reach since it never cuts a
 * blocked corner). Returns each cell's area id (-1 = blocked) and the id of the largest area.
 */
export function walkableAreas(grid: WalkGrid): { area: Int32Array; largest: number } {
  const { width: W, height: H, cost } = grid
  const area = new Int32Array(W * H).fill(-1)
  const stack: number[] = []
  let next = 0
  let largest = -1
  let largestSize = 0
  for (let s = 0; s < cost.length; s++) {
    if (!cost[s] || area[s] !== -1) continue
    let size = 0
    area[s] = next
    stack.push(s)
    while (stack.length) {
      const i = stack.pop() as number
      size++
      const x = i % W
      const y = (i / W) | 0
      for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (n < 0 || !cost[n] || area[n] !== -1) continue
        area[n] = next
        stack.push(n)
      }
    }
    if (size > largestSize) {
      largestSize = size
      largest = next
    }
    next++
  }
  return { area, largest }
}

/** Nearest walkable cell within `maxCells` (square rings), optionally only cells where `allow` says yes; or null. */
export function nearestOpen(grid: WalkGrid, [cx, cy]: Cell, maxCells: number, allow?: (i: number) => boolean): Cell | null {
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return false
    const i = y * grid.width + x
    return grid.cost[i] > 0 && (!allow || allow(i))
  }
  if (ok(cx, cy)) return [cx, cy]
  for (let r = 1; r <= maxCells; r++) {
    let best: Cell | null = null
    let bestD = Infinity
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(cx + dx, cy + dy)) continue
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = [cx + dx, cy + dy]
        }
      }
    }
    if (best) return best
  }
  return null
}

/** A* with 8 neighbours; diagonal steps may not cut a blocked corner. Null when there is no way. */
export function findPath(grid: WalkGrid, start: Cell, goal: Cell): Cell[] | null {
  const { width: W, height: H, cost } = grid
  const s = start[1] * W + start[0]
  const t = goal[1] * W + goal[0]
  if (!cost[s] || !cost[t]) return null
  const h0 = minCost(grid)
  const g = new Float64Array(W * H).fill(Infinity)
  const f = new Float64Array(W * H).fill(Infinity)
  const from = new Int32Array(W * H).fill(-1)
  const closed = new Uint8Array(W * H)
  const gx = goal[0]
  const gy = goal[1]
  const heuristic = (i: number) => {
    const dx = Math.abs((i % W) - gx)
    const dy = Math.abs(((i / W) | 0) - gy)
    return h0 * (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy))
  }
  const open = new Heap(f)
  g[s] = 0
  f[s] = heuristic(s)
  open.push(s)
  while (open.size) {
    const cur = open.pop()
    if (cur === t) break
    if (closed[cur]) continue
    closed[cur] = 1
    const x = cur % W
    const y = (cur / W) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const n = ny * W + nx
        if (!cost[n] || closed[n]) continue
        if (dx && dy && (!cost[y * W + nx] || !cost[ny * W + x])) continue
        const step = (dx && dy ? SQRT2 : 1) * cost[n]
        const ng = g[cur] + step
        if (ng < g[n]) {
          g[n] = ng
          from[n] = cur
          f[n] = ng + heuristic(n)
          open.push(n)
        }
      }
    }
  }
  if (from[t] === -1 && s !== t) return null
  const path: Cell[] = []
  for (let i = t; i !== -1; i = from[i]) path.push([i % W, (i / W) | 0])
  return path.reverse()
}

/** True when the straight line between two cells crosses only walkable cells no costlier than `maxCost`. */
function clearLine(grid: WalkGrid, [x0, y0]: Cell, [x1, y1]: Cell, maxCost: number): boolean {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / steps)
    const y = Math.round(y0 + ((y1 - y0) * k) / steps)
    const c = grid.cost[y * grid.width + x]
    if (!c || c > maxCost) return false
  }
  return true
}

/** Fewer corners: drop points the path can skip in a straight line without leaving cheap ground. */
export function simplifyPath(grid: WalkGrid, path: Cell[]): Cell[] {
  if (path.length <= 2) return path
  const out: Cell[] = [path[0]]
  let anchor = 0
  while (anchor < path.length - 1) {
    let maxCost = 0
    let next = anchor + 1
    for (let j = anchor + 1; j < path.length; j++) {
      maxCost = Math.max(maxCost, grid.cost[path[j][1] * grid.width + path[j][0]])
      if (clearLine(grid, path[anchor], path[j], maxCost)) next = j
    }
    out.push(path[next])
    anchor = next
  }
  return out
}
