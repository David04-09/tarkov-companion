/**
 * Planning a route the player asked for: where it starts (a place, a side of the map, the
 * closest PMC spawn) and which stops it visits (every objective of a quest, in a short order,
 * optionally ending at an extract). Pure; the walking itself is done by walk.ts.
 */
import type { MapDetails, Position } from '../../api/types'

export type Side = 'north' | 'south' | 'east' | 'west' | 'north-east' | 'north-west' | 'south-east' | 'south-west'

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)

/** "from the west side", "spawned on the north east", "coming from the south end" → the side. */
export function parseSide(q: string[]): Side | null {
  const s = ` ${q.join(' ')} `
  const m = / (?:from|on|at|of) (?:the )?(north|south|east|west)(?: ?(east|west))?(?: (?:side|end|edge|part|spawn|spawns))?(?= |$)/.exec(s) ?? / (north|south|east|west)(?: ?(east|west))? (?:side|end|edge|part|spawn)(?= |$)/.exec(s)
  if (!m) return null
  const [a, b] = [m[1], m[2]]
  if (b && (a === 'north' || a === 'south')) return `${a}-${b}` as Side
  return a as Side
}

/** Where PMCs can spawn on a map (the data has positions, no names). */
export function pmcSpawns(details: MapDetails | undefined): Position[] {
  return (details?.spawns ?? []).filter((s) => (s.sides.includes('pmc') || s.sides.includes('all')) && s.categories.includes('player')).map((s) => s.position)
}

const centre = (ps: Position[]): Position => ({ x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: 0, z: ps.reduce((a, p) => a + p.z, 0) / ps.length })

/** How far out a spawn must be (share of the furthest one) to count as "on the west side". */
const EDGE_SHARE = 0.6

/**
 * The PMC spawn out on that side of the map closest to where the player is going. "West" is the
 * compass direction on the map picture (`compass` = heading.ts), seen from the middle of all
 * spawns; only spawns well out on that side count, not ones just past the middle.
 */
export function spawnOnSide(spawns: Position[], side: Side, toward: Position, compass: (from: Position, to: Position) => string | null): Position | null {
  if (!spawns.length) return null
  const mid = centre(spawns)
  // The game-coordinate direction that the map picture calls `side` (the middle of the angles that read as it).
  const angles: number[] = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * 2 * Math.PI
    if (compass(mid, { x: mid.x + Math.cos(a), y: 0, z: mid.z + Math.sin(a) }) === side) angles.push(a)
  }
  if (!angles.length) return null
  const ux = angles.reduce((s, a) => s + Math.cos(a), 0)
  const uz = angles.reduce((s, a) => s + Math.sin(a), 0)
  const len = Math.hypot(ux, uz) || 1
  const out = (p: Position) => ((p.x - mid.x) * ux + (p.z - mid.z) * uz) / len
  const furthest = Math.max(...spawns.map(out))
  if (furthest <= 0) return null
  const onSide = spawns.filter((p) => out(p) >= furthest * EDGE_SHARE)
  return onSide.reduce((a, b) => (dist(a, toward) <= dist(b, toward) ? a : b))
}

export function closestTo(points: Position[], toward: Position): Position | null {
  return points.length ? points.reduce((a, b) => (dist(a, toward) <= dist(b, toward) ? a : b)) : null
}

/**
 * Stops for a quest: one spot per objective (an objective may have several possible spots), in
 * the order that keeps each next leg short (nearest first, from where the player starts).
 */
export function orderStops<T>(start: Position, objectives: { item: T; spots: Position[] }[]): { item: T; position: Position }[] {
  const left = objectives.filter((o) => o.spots.length)
  const out: { item: T; position: Position }[] = []
  let here = start
  while (left.length) {
    let best = { i: 0, p: left[0].spots[0], d: Infinity }
    left.forEach((o, i) => {
      for (const p of o.spots) {
        const d = dist(here, p)
        if (d < best.d) best = { i, p, d }
      }
    })
    out.push({ item: left[best.i].item, position: best.p })
    here = best.p
    left.splice(best.i, 1)
  }
  return out
}
