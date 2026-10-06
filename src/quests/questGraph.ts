/**
 * Pure quest-graph logic for the Quest tree view: prerequisite lookups,
 * a simple layered (left-to-right) layout with barycentre crossing reduction,
 * and the "path to Kappa / Lightkeeper" closure in a valid order.
 *
 * Everything here works on a small structural subset of `Task` so tests can use
 * tiny fixtures. All walks are cycle-safe (the data should be acyclic, but a bad
 * wipe update must never hang the page).
 */

export interface GraphTask {
  id: string
  name: string
  minPlayerLevel: number
  trader: { id: string; name: string }
  taskRequirements: { taskId: string; status: string[] }[]
}

/** Prerequisites that must be completed (status list contains "complete"), as in taskStatus.ts. */
export function completePrereqIds(task: GraphTask): string[] {
  return task.taskRequirements.filter((r) => r.status.includes('complete')).map((r) => r.taskId)
}

/** Every prerequisite id (any required status), used for drawing the tree. */
export function allPrereqIds(task: GraphTask): string[] {
  return task.taskRequirements.map((r) => r.taskId)
}

/** taskId -> ids of tasks that list it as a prerequisite. */
export function buildUnlocks(tasks: GraphTask[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const t of tasks) {
    for (const p of allPrereqIds(t)) {
      const list = out.get(p)
      if (list) {
        if (!list.includes(t.id)) list.push(t.id)
      } else out.set(p, [t.id])
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Layered layout
// ---------------------------------------------------------------------------

/**
 * Longest-path depth from a root for every node in `ids`, following only edges
 * to nodes inside `ids`. A back edge (cycle) is ignored, so it always ends.
 */
export function computeDepths(ids: string[], prereqsOf: (id: string) => string[]): Map<string, number> {
  const inSet = new Set(ids)
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  const visit = (id: string): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return -1 // cycle: treat this edge as absent
    visiting.add(id)
    let d = 0
    for (const p of prereqsOf(id)) {
      if (!inSet.has(p) || p === id) continue
      const pd = visit(p)
      if (pd >= 0) d = Math.max(d, pd + 1)
    }
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  for (const id of ids) visit(id)
  return depth
}

export interface LayoutEdge {
  from: string
  to: string
}

export interface Layout {
  /** Node ids per layer (column), top to bottom. */
  layers: string[][]
  /** Edges between nodes of the layout (prerequisite -> task), only forward ones. */
  edges: LayoutEdge[]
  /** Column index of each node. */
  layerOf: Map<string, number>
}

/**
 * Layers nodes by depth and orders each layer by barycentre sweeps (forwards
 * using prerequisites, backwards using dependents) to reduce edge crossings.
 */
export function layeredLayout(ids: string[], prereqsOf: (id: string) => string[], sweeps = 4): Layout {
  const depth = computeDepths(ids, prereqsOf)
  const inSet = new Set(ids)
  const edges: LayoutEdge[] = []
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const id of ids) {
    preds.set(id, [])
    succs.set(id, [])
  }
  for (const id of ids) {
    for (const p of new Set(prereqsOf(id))) {
      if (!inSet.has(p) || p === id) continue
      // Only edges that go strictly left to right (a cycle's back edge is dropped).
      if ((depth.get(p) ?? 0) >= (depth.get(id) ?? 0)) continue
      edges.push({ from: p, to: id })
      preds.get(id)!.push(p)
      succs.get(p)!.push(id)
    }
  }

  const layerCount = ids.length === 0 ? 0 : Math.max(...ids.map((id) => depth.get(id) ?? 0)) + 1
  const layers: string[][] = Array.from({ length: layerCount }, () => [])
  for (const id of ids) layers[depth.get(id) ?? 0].push(id)

  const pos = new Map<string, number>()
  const setPositions = (layer: string[]) => layer.forEach((id, i) => pos.set(id, i))
  layers.forEach(setPositions)

  const reorder = (layer: string[], neighbours: Map<string, string[]>) => {
    const keyed = layer.map((id, i) => {
      const ns = neighbours.get(id) ?? []
      const placed = ns.filter((n) => pos.has(n))
      // Nodes without neighbours keep their current slot.
      const bary = placed.length ? placed.reduce((s, n) => s + pos.get(n)!, 0) / placed.length : i
      return { id, bary, i }
    })
    keyed.sort((a, b) => a.bary - b.bary || a.i - b.i)
    layer.splice(0, layer.length, ...keyed.map((k) => k.id))
    setPositions(layer)
  }

  for (let s = 0; s < sweeps; s++) {
    for (let l = 1; l < layers.length; l++) reorder(layers[l], preds)
    for (let l = layers.length - 2; l >= 0; l--) reorder(layers[l], succs)
  }

  return { layers, edges, layerOf: depth }
}

/** Number of edge crossings between consecutive layers (for tests and tuning). */
export function countCrossings(layout: Layout): number {
  const pos = new Map<string, number>()
  layout.layers.forEach((layer) => layer.forEach((id, i) => pos.set(id, i)))
  let crossings = 0
  const byLayer = new Map<number, LayoutEdge[]>()
  for (const e of layout.edges) {
    // Long edges are counted against their source layer only (an approximation).
    const l = layout.layerOf.get(e.from) ?? 0
    const list = byLayer.get(l) ?? []
    list.push(e)
    byLayer.set(l, list)
  }
  for (const list of byLayer.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        const d1 = pos.get(a.from)! - pos.get(b.from)!
        const d2 = pos.get(a.to)! - pos.get(b.to)!
        if (d1 * d2 < 0) crossings++
      }
    }
  }
  return crossings
}

// ---------------------------------------------------------------------------
// Path to Kappa / Lightkeeper
// ---------------------------------------------------------------------------

/**
 * Targets plus every prerequisite (transitively, "complete" requirements only)
 * that is not done yet. `include` filters out tasks the player cannot take
 * (other faction); walks stop at completed or excluded tasks.
 */
export function requiredClosure(
  targetIds: string[],
  tasksById: Record<string, GraphTask | undefined>,
  completed: ReadonlySet<string>,
  include: (task: GraphTask) => boolean = () => true,
): Set<string> {
  const out = new Set<string>()
  const stack = [...targetIds]
  while (stack.length) {
    const id = stack.pop()!
    if (out.has(id) || completed.has(id)) continue
    const task = tasksById[id]
    if (!task || !include(task)) continue
    out.add(id)
    for (const p of completePrereqIds(task)) stack.push(p)
  }
  return out
}

/**
 * Topological order of `ids` (prerequisites first, edges outside the set
 * ignored); among the tasks that are ready, lower min level first, then name.
 * If a cycle blocks progress, the best-ranked blocked task is released.
 */
export function topoOrder(ids: Iterable<string>, tasksById: Record<string, GraphTask | undefined>): string[] {
  const set = new Set(ids)
  const indeg = new Map<string, number>()
  const succ = new Map<string, string[]>()
  for (const id of set) {
    indeg.set(id, 0)
    succ.set(id, [])
  }
  for (const id of set) {
    const t = tasksById[id]
    if (!t) continue
    for (const p of new Set(completePrereqIds(t))) {
      if (!set.has(p) || p === id) continue
      indeg.set(id, indeg.get(id)! + 1)
      succ.get(p)!.push(id)
    }
  }

  const rank = (a: string, b: string) => {
    const ta = tasksById[a]
    const tb = tasksById[b]
    return (
      (ta?.minPlayerLevel ?? 0) - (tb?.minPlayerLevel ?? 0) ||
      (ta?.name ?? a).localeCompare(tb?.name ?? b) ||
      a.localeCompare(b)
    )
  }

  const out: string[] = []
  const done = new Set<string>()
  const ready = [...set].filter((id) => indeg.get(id) === 0)
  while (out.length < set.size) {
    if (ready.length === 0) {
      // Cycle: release the best remaining task.
      const rest = [...set].filter((id) => !done.has(id)).sort(rank)
      ready.push(rest[0])
    }
    ready.sort(rank)
    const id = ready.shift()!
    if (done.has(id)) continue
    done.add(id)
    out.push(id)
    for (const s of succ.get(id) ?? []) {
      const d = indeg.get(s)! - 1
      indeg.set(s, d)
      if (d === 0 && !done.has(s)) ready.push(s)
    }
  }
  return out
}
