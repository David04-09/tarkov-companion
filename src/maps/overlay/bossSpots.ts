import labels from '../../data/mapLabels.json'
import type { MapBoss, Position } from '../../api/types'
import { areaCentre, distanceToArea, insidePolygon, type ReportedArea } from './bossAreas'

/**
 * Spawn spots for one boss on one map, from the game data checked against where players report it.
 *
 * Chances come from the game data per zone (listing chance × zone chance). A zone's chance goes to
 * the reported area that stands for it (ReportedArea.zones), else to the areas its points are next
 * to. Its listed points are trusted only next to a reported area: the rest are "data" spots, drawn
 * faded (Shturman's "Lumber Mill" zone lists points at USEC camp and Scav town; players only ever
 * meet him at the sawmill). Bosses with no reported area on the map keep the game data as it is,
 * one spot per zone.
 */
export interface BossSpot {
  key: string
  /** The reported area's name, the zone's name, or the nearest place ("Near Scav Town"). */
  name: string
  centre: Position
  points: Position[]
  /** Share of this boss's spawn chance on this map that goes here (0–1); 0 = none from the data. */
  share: number
  /**
   * reported: an area players report (EFT Wiki map), with the game-data points next to it.
   * data: game-data points away from every reported area of this boss.
   * listed: game data, with no reported area to compare it with.
   */
  kind: 'reported' | 'data' | 'listed'
  area: ReportedArea | null
  /** The game data's zone names behind this spot ("Stronghold", "Dorms"). */
  zones: string[]
  /** The spot has no game-data points: it is the reported area itself. */
  noPoints: boolean
}

/** Points closer than this belong to one spot. */
export const CLUSTER_M = 60
/** A point this close to a reported area counts as that area (the pictures are fitted to ~7–18 m). */
export const NEAR_M = 50
const LABEL_M = 160

const LABELS = (labels as { maps: Record<string, { text: string; x: number; z: number }[]> }).maps
const LABEL_ALIASES: Record<string, string> = { 'night-factory': 'factory', 'ground-zero-21': 'ground-zero' }

function placeName(mapKey: string, p: Position): string | null {
  let best: string | null = null
  let bestD = LABEL_M
  for (const l of LABELS[LABEL_ALIASES[mapKey] ?? mapKey] ?? []) {
    const d = Math.hypot(l.x - p.x, l.z - p.z)
    if (d < bestD) {
      bestD = d
      best = l.text
    }
  }
  return best
}

/** Zone names worth showing ("Water Treatment"), not internal ones ("1BD1PortAmbush1", "GreenOffice"). */
const readableZone = (name: string) => Boolean(name) && !/\d|[a-z][A-Z]|^Zone/.test(name)

function medoid(points: Position[]): Position {
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length
  const cz = points.reduce((a, p) => a + p.z, 0) / points.length
  let best = points[0]
  let bestD = Infinity
  for (const p of points) {
    const d = (p.x - cx) ** 2 + (p.z - cz) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** Single-link groups of points within CLUSTER_M. */
function clusters<T extends { p: Position }>(items: T[]): T[][] {
  const parent = items.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) if (Math.hypot(items[i].p.x - items[j].p.x, items[i].p.z - items[j].p.z) <= CLUSTER_M) parent[find(i)] = find(j)
  const groups = new Map<number, T[]>()
  items.forEach((e, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), e]))
  return [...groups.values()]
}

interface Pt {
  p: Position
  /** Spawn-chance mass this point carries when its zone went to no area (data / listed). */
  w: number
  zones: Set<string>
}

export function buildSpots(spawns: MapBoss[], areas: ReportedArea[], mapKey: string): BossSpot[] {
  const nearestArea = (p: Position): ReportedArea | null => {
    let best: ReportedArea | null = null
    let bestD = NEAR_M
    for (const a of areas) {
      const d = distanceToArea(p.x, p.z, a.polygon)
      if (d <= bestD) {
        bestD = d
        best = a
      }
    }
    return best
  }

  // Every listed point once (the same point can come from several listings, e.g. the Rogues).
  const points = new Map<string, Pt>()
  const pointOf = (p: Position) => {
    const k = `${Math.round(p.x)}:${Math.round(p.z)}`
    let e = points.get(k)
    if (!e) points.set(k, (e = { p, w: 0, zones: new Set() }))
    return e
  }
  const areaMass = new Map<ReportedArea, number>()
  const areaZones = new Map<ReportedArea, Set<string>>()
  const listedZones = new Map<string, { w: number; pts: Pt[] }>()
  let total = 0

  for (const s of spawns) {
    const p = Math.min(1, Math.max(0, s.spawnChance))
    const locSum = s.locations.reduce((a, l) => a + Math.max(0, l.chance), 0) || 1
    for (const loc of s.locations) {
      const mass = (p * Math.max(0, loc.chance)) / locSum
      total += mass
      const pts = loc.positions.map(pointOf)
      for (const e of pts) e.zones.add(loc.name)
      if (!areas.length) {
        const z = listedZones.get(loc.name) ?? { w: 0, pts: [] }
        z.w += mass
        for (const e of pts) if (!z.pts.includes(e)) z.pts.push(e)
        listedZones.set(loc.name, z)
        continue
      }
      // Which areas get this zone's chance, and in what proportion.
      const named = areas.filter((a) => a.zones.includes(loc.name))
      const near = new Map<ReportedArea, number>()
      for (const e of pts) {
        const a = nearestArea(e.p)
        if (a && (!named.length || named.includes(a))) near.set(a, (near.get(a) ?? 0) + 1)
      }
      const targets = named.length ? named : [...near.keys()]
      if (!targets.length) {
        // Away from everything players report: the points carry the chance themselves.
        for (const e of pts) e.w += mass / pts.length
        continue
      }
      const counts = targets.map((a) => near.get(a) ?? 0)
      const sum = counts.reduce((a, b) => a + b, 0)
      targets.forEach((a, i) => {
        areaMass.set(a, (areaMass.get(a) ?? 0) + (sum ? (mass * counts[i]) / sum : mass / targets.length))
        areaZones.set(a, (areaZones.get(a) ?? new Set()).add(loc.name))
      })
    }
  }

  const spots: BossSpot[] = []
  if (!areas.length) {
    // No reported areas: the game data as it is, one spot per zone.
    for (const [zone, z] of listedZones) {
      if (!z.pts.length) continue
      const centre = medoid(z.pts.map((e) => e.p))
      const place = placeName(mapKey, centre)
      // A zone named after the boss ("Tagilla") says nothing about the place.
      const useZone = readableZone(zone) && !spawns.some((s) => s.name === zone)
      spots.push({ key: `zone:${zone}`, name: useZone ? zone : place ? `Near ${place}` : 'Spawn spot', centre, points: z.pts.map((e) => e.p), share: z.w, kind: 'listed', area: null, zones: [zone], noPoints: false })
    }
  } else {
    const byArea = new Map<ReportedArea, Pt[]>()
    const away: Pt[] = []
    for (const e of points.values()) {
      const a = nearestArea(e.p)
      if (a) byArea.set(a, [...(byArea.get(a) ?? []), e])
      else away.push(e)
    }
    for (const a of areas) {
      const pts = (byArea.get(a) ?? []).map((e) => e.p)
      const inside = pts.filter((p) => insidePolygon(p.x, p.z, a.polygon))
      // The portrait goes where players report the boss: on a point inside the area, else its middle.
      const c = areaCentre(a.polygon)
      const centre = inside.length ? medoid(inside) : { x: c.x, y: pts[0]?.y ?? 0, z: c.z }
      spots.push({ key: `area:${a.name}`, name: a.name, centre, points: pts, share: areaMass.get(a) ?? 0, kind: 'reported', area: a, zones: [...(areaZones.get(a) ?? [])], noPoints: pts.length === 0 })
    }
    for (const g of clusters(away)) {
      const centre = medoid(g.map((e) => e.p))
      const place = placeName(mapKey, centre)
      spots.push({
        key: `data:${Math.round(centre.x)}:${Math.round(centre.z)}`,
        name: place ? `Near ${place}` : 'Spawn spot',
        centre,
        points: g.map((e) => e.p),
        share: g.reduce((a, e) => a + e.w, 0),
        kind: 'data',
        area: null,
        zones: [...new Set(g.flatMap((e) => [...e.zones]))],
        noPoints: false,
      })
    }
  }

  for (const s of spots) s.share = total > 0 ? s.share / total : 0
  const rank = { reported: 0, listed: 1, data: 2 }
  return spots.sort((a, b) => rank[a.kind] - rank[b.kind] || b.share - a.share || a.name.localeCompare(b.name))
}

/** Text for one spot's source, shared by the map pop-up, the Maps tab list and the search bar. */
export function spotSource(s: BossSpot, bossName: string): string {
  const n = (k: number) => `${k} spawn point${k === 1 ? '' : 's'}`
  if (s.kind === 'listed') return `Game data: zone ${s.zones.join(', ')}, ${n(s.points.length)}.`
  if (s.kind === 'data') return `Only the game data lists this (${n(s.points.length)} in zone ${s.zones.join(', ')}). Players report ${bossName} elsewhere on this map, so treat it as unconfirmed.`
  const wiki = s.area ? `Players report ${bossName} here (EFT Wiki map, ${s.area.pictureDate.slice(0, 7)}).` : ''
  const zone = s.zones.length ? ` The game data's zone ${s.zones.join(' and ')} counts here.` : ' No game-data zone counts here.'
  if (s.noPoints) return `${wiki}${zone} No exact points in the data.`
  const area = s.area
  const inside = area ? s.points.filter((p) => insidePolygon(p.x, p.z, area.polygon)).length : s.points.length
  const away = area ? s.points.map((p) => Math.round(distanceToArea(p.x, p.z, area.polygon))).filter((d) => d > 0) : []
  const range = away.length ? (Math.min(...away) === Math.max(...away) ? `${away[0]} m` : `${Math.min(...away)}–${Math.max(...away)} m`) : ''
  const parts = [inside ? `${inside} inside the area` : '', away.length ? `${away.length} next to it (${range} away)` : ''].filter(Boolean)
  return `${wiki}${zone} ${n(s.points.length)} in the data: ${parts.join(', ')}.`
}
