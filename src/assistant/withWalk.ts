import type { Position } from '../api/types'
import { STRAIGHT_NOTE, type Reply } from './engine'
import { headingOnMap } from './heading'
import { walkRoute } from './route/walk'
import { sayDistance } from './text'

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)

/** The first point at least `m` metres along the path, to say which way to start walking. */
function pointAlong(path: Position[], m: number): Position {
  let left = m
  for (let i = 1; i < path.length; i++) {
    const d = dist(path[i - 1], path[i])
    if (d >= left) {
      const t = left / d
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: 0, z: path[i - 1].z + (path[i].z - path[i - 1].z) * t }
    }
    left -= d
  }
  return path[path.length - 1]
}

/**
 * Replaces an answer's straight lines by a walking route over the map's terrain (around water,
 * fences, rocks, minefields and buildings), leg by leg through every stop, and says how far it
 * is on foot and which way to go.
 */
export async function withWalk(reply: Reply): Promise<Reply> {
  const card = reply.map
  if (!card?.route || card.route.length < 2) return reply
  const stops = card.route
  const legs: { metres: number; walked: boolean; startMovedM: number; endMovedM: number }[] = []
  const path: Position[] = []
  for (let i = 1; i < stops.length; i++) {
    const r = await walkRoute(card.map, stops[i - 1], stops[i]).catch(() => null)
    if (!r && !legs.length && stops.length === 2) {
      if (!reply.walk) return reply
      return { ...reply, text: `${reply.text} ${sayDistance(dist(stops[0], stops[1]))} in a straight line; there is no terrain drawing for ${card.map.name}.`, lines: [...(reply.lines ?? []), STRAIGHT_NOTE] }
    }
    // A leg with no way over the terrain stays a straight line.
    const legPath = r?.path ?? [stops[i - 1], stops[i]]
    path.push(...(path.length ? legPath.slice(1) : legPath))
    legs.push({ metres: r?.metres ?? dist(stops[i - 1], stops[i]), walked: !!r, startMovedM: r?.startMovedM ?? 0, endMovedM: r?.endMovedM ?? 0 })
  }
  const metres = legs.reduce((sum, l) => sum + l.metres, 0)
  const dir = headingOnMap(card.map.normalizedName, path[0], pointAlong(path, 40))
  const notes: string[] = []
  const fromName = reply.walk?.fromName ?? 'Your spot'
  const toName = reply.walk?.toName ?? card.points[1]?.label ?? 'The target'
  if (legs[0].startMovedM > 20) notes.push(`${fromName} is inside a building or off the walkable ground in the map drawing; the route starts at the nearest open spot, about ${Math.round(legs[0].startMovedM / 5) * 5} m away.`)
  if (stops.length === 2 && legs[0].endMovedM > 20) notes.push(`${toName} is inside a building or off the walkable ground; the route ends at the nearest open spot, about ${Math.round(legs[0].endMovedM / 5) * 5} m from it.`)
  if (legs.some((l) => !l.walked)) notes.push('Some legs have no way over the map drawing and are drawn as straight lines.')
  // Several stops: how far each leg is, next to the stop it leads to.
  const legLines = stops.length > 2 ? card.points.slice(1).map((p, i) => `${p.label}: ${sayDistance(legs[i]?.metres ?? 0)}`) : []
  const stopLabels = new Set(card.points.slice(1).map((p) => p.label))
  return {
    ...reply,
    text: reply.walk ? `${reply.text} It's ${sayDistance(metres)} on foot${dir ? `; head ${dir} to start` : ''}.` : `${reply.text} It's ${sayDistance(metres)} on foot.`,
    lines: [...legLines, ...(reply.lines ?? []).filter((l) => l !== STRAIGHT_NOTE && !stopLabels.has(l)), ...notes, 'Route goes around water, fences, rocks, minefields and buildings in the map drawing (ground level; doors and stairs are not in the data).'],
    map: { ...card, path },
    actions: [
      ...(reply.actions ?? []),
      { kind: 'routeOnMap', mapKey: card.map.normalizedName, path, fromLabel: reply.walk?.fromName ?? card.points[0]?.label.replace(/^You: /, '') ?? 'Start', toLabel: toName, label: `Show the route on the ${card.map.name} map` },
    ],
  }
}
