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
 * Replaces an answer's straight line by a walking route over the map's terrain (around water,
 * fences, rocks, minefields and buildings), and says how far it is on foot and which way to go.
 */
export async function withWalk(reply: Reply): Promise<Reply> {
  const card = reply.map
  if (!card?.route) return reply
  const [from, to] = card.route
  const r = await walkRoute(card.map, from, to).catch(() => null)
  if (!r) {
    if (!reply.walk) return reply
    return { ...reply, text: `${reply.text} ${sayDistance(dist(from, to))} in a straight line; there is no terrain drawing for ${card.map.name}.`, lines: [...(reply.lines ?? []), STRAIGHT_NOTE] }
  }
  const dir = headingOnMap(card.map.normalizedName, r.path[0], pointAlong(r.path, 40))
  const notes: string[] = []
  const fromName = reply.walk?.fromName ?? 'Your spot'
  const toName = reply.walk?.toName ?? card.points[1]?.label ?? 'The target'
  if (r.startMovedM > 20) notes.push(`${fromName} is inside a building or off the walkable ground in the map drawing; the route starts at the nearest open spot, about ${Math.round(r.startMovedM / 5) * 5} m away.`)
  if (r.endMovedM > 20) notes.push(`${toName} is inside a building or off the walkable ground; the route ends at the nearest open spot, about ${Math.round(r.endMovedM / 5) * 5} m from it.`)
  const onFoot = `${sayDistance(r.metres)} on foot${dir ? `, start heading ${dir}` : ''}`
  return {
    ...reply,
    text: reply.walk ? `${reply.text.replace(/\.$/, '')}: ${onFoot}.` : `${reply.text} Walking: ${sayDistance(r.metres)}.`,
    lines: [...(reply.lines ?? []).filter((l) => l !== STRAIGHT_NOTE), ...notes, 'Route goes around water, fences, rocks, minefields and buildings in the map drawing (ground level; doors and stairs are not in the data).'],
    map: { ...card, path: r.path },
    actions: [
      ...(reply.actions ?? []),
      { kind: 'routeOnMap', mapKey: card.map.normalizedName, path: r.path, fromLabel: reply.walk?.fromName ?? card.points[0]?.label.replace(/^You: /, '') ?? 'Start', toLabel: toName, label: `Show the route on the ${card.map.name} map` },
    ],
  }
}
