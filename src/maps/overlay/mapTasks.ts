import type { GameData, Position, Task, TaskObjective } from '../../api/types'
import type { BaseLayerConfig } from '../mapConfig'
import { floorForPosition } from './floors'

/** One place on the map where an objective can be done. */
export interface Placement {
  id: string
  position: Position
  /** Zone polygon (game coords) or null for a point. */
  outline: Position[] | null
  /** 0-based index among this objective's placements, and the total. */
  index: number
  total: number
  /** Floor name from the map config, or null for ground level. */
  floor: string | null
}

export interface MapObjective {
  objective: TaskObjective
  placements: Placement[]
  /** True for "do this anywhere on the map" objectives (no coordinates). */
  anywhere: boolean
  /**
   * Key item ids the quest data lists for this objective (requiredKeys). Keys are never guessed
   * from locked doors near the objective: a nearby door is not proof that you need its key.
   */
  keyIds: string[]
  keySource: 'explicit' | null
}

export interface MapTask {
  task: Task
  objectives: MapObjective[]
  /** All placements across objectives (for focusing / counting). */
  placements: Placement[]
  /** Task-level keys for this map (neededKeys). */
  keyIds: string[]
}

/**
 * Tasks with at least one objective on `mapId`, with every objective's
 * positions resolved (zones, item spawn points, named extracts) and keys
 * derived. Pure function so the result can be memoised per map/layer.
 */
export function buildMapTasks(data: GameData, mapId: string, layer: BaseLayerConfig): MapTask[] {
  const details = data.mapDetails[mapId]
  const extractsByName = new Map<string, (typeof details.extracts)[number]>()
  for (const e of details?.extracts ?? []) extractsByName.set(e.name.toLowerCase(), e)

  const out: MapTask[] = []
  for (const task of data.tasks) {
    const objectives: MapObjective[] = []
    for (const o of task.objectives) {
      const placements: Placement[] = []
      const onThisMap = o.maps.some((m) => m.id === mapId)

      // Zones (centre + outline) and item spawn points.
      const raw: { position: Position; outline: Position[] | null; key: string }[] = []
      for (const loc of o.locations) {
        if (loc.mapId !== mapId) continue
        loc.positions.forEach((p, i) =>
          raw.push({ position: p, outline: loc.outline, key: `${loc.zoneId ?? 'p'}:${i}` }),
        )
      }
      // Extract objectives: place at the named extract.
      if (raw.length === 0 && o.type === 'extract' && o.exitName && onThisMap) {
        const ex = extractsByName.get(o.exitName.toLowerCase())
        if (ex) raw.push({ position: ex.position, outline: ex.outline.length > 2 ? ex.outline : null, key: `exit:${ex.id}` })
      }
      // The data sometimes lists the same zone twice (one per map variant); keep one marker per spot.
      const seen = new Set<string>()
      const unique = raw.filter((r) => {
        const k = `${r.position.x.toFixed(1)},${r.position.y.toFixed(1)},${r.position.z.toFixed(1)}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      raw.length = 0
      raw.push(...unique)
      raw.forEach((r, i) =>
        placements.push({
          // Index-based: zone ids are not unique in the data (duplicates per map variant).
          id: `${o.id}:${i}`,
          position: r.position,
          outline: r.outline,
          index: i,
          total: raw.length,
          floor: floorForPosition(layer, r.position),
        }),
      )

      // Objectives without a map in the data (e.g. hand-ins, quest items) count for the task's own map.
      const taskOnThisMap = task.map?.id === mapId
      const unlocated = placements.length === 0 && o.maps.length === 0 && taskOnThisMap
      const anywhere = placements.length === 0 && (onThisMap || unlocated)
      if (placements.length === 0 && !anywhere) continue

      const keyIds = [...new Set(o.requiredKeys.flat())]
      const keySource: MapObjective['keySource'] = keyIds.length > 0 ? 'explicit' : null
      objectives.push({ objective: o, placements, anywhere, keyIds, keySource })
    }
    if (objectives.length === 0) continue
    out.push({
      task,
      objectives,
      placements: objectives.flatMap((o) => o.placements),
      keyIds: [...new Set(task.neededKeys.filter((k) => k.mapId === mapId).flatMap((k) => k.keyIds))],
    })
  }
  return out
}
