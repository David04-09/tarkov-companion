/**
 * Loose-loot spots where a key can appear, from the game's loot data via tarkov.dev (each spot
 * lists the items that may spawn there; the data does not give chances). Containers such as
 * jackets, drawers and key cabinets are not part of this data.
 */
import type { GameData, Position } from '../api/types'

export interface KeySpawnMap {
  configKey: string
  mapName: string
  normalizedName: string
  points: Position[]
}

/** Spots per map picture (Factory and Night Factory share one), identical spots merged. */
export function keySpawnsByMap(
  data: Pick<GameData, 'maps' | 'mapDetails'>,
  keyId: string,
  /** Map picture key for an API map (findMapConfig(name)?.key); null when the app has no picture. */
  pictureKey: (normalizedName: string) => string | null | undefined,
): KeySpawnMap[] {
  const out: KeySpawnMap[] = []
  for (const m of data.maps) {
    const loose = data.mapDetails[m.id]?.lootLoose ?? []
    const points = loose.filter((l) => l.itemIds.includes(keyId)).map((l) => l.position)
    if (!points.length) continue
    const key = pictureKey(m.normalizedName)
    if (!key) continue
    let entry = out.find((o) => o.configKey === key)
    if (!entry) out.push((entry = { configKey: key, mapName: m.name, normalizedName: m.normalizedName, points: [] }))
    for (const p of points) {
      if (!entry.points.some((q) => Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5 && Math.abs(q.z - p.z) < 0.5)) entry.points.push(p)
    }
  }
  return out.sort((a, b) => b.points.length - a.points.length)
}
