/**
 * Named places on the maps ("Dorms", "Crackhouse", "Big Red"), from tarkov.dev's map labels
 * (src/data/mapLabels.json, refreshed with `node scripts/fetch-map-labels.mjs`).
 */
import labels from '../data/mapLabels.json'
import type { Position } from '../api/types'
import { compact, type NameEntry } from './text'

export interface Place {
  /** Label key in mapLabels.json (Factory and Night Factory share one). */
  mapKey: string
  name: string
  position: Position
  /** A map label, or an extract from the game data (also where PMCs spawn: "I spawned at Crossroads"). */
  kind?: 'place' | 'extract'
}

const LABELS = (labels as { maps: Record<string, { text: string; x: number; z: number }[]> }).maps

/** The label set a game map uses (normalizedName from the game data). */
export function labelKey(normalizedName: string): string {
  if (normalizedName === 'night-factory') return 'factory'
  if (normalizedName.startsWith('ground-zero')) return 'ground-zero'
  return normalizedName
}

/** Players' own names for some places, pointing at the label they mean. */
const NICKNAMES: Record<string, Record<string, string>> = {
  customs: { dormitory: 'Dorms', 'new gas station': 'New Gas', 'old gas station': 'Old Gas' },
}

export const ALL_PLACES: Place[] = Object.entries(LABELS).flatMap(([mapKey, list]) =>
  list.map((l) => ({ mapKey, name: l.text, position: { x: l.x, y: 0, z: l.z } })),
)

export function placeEntries(): NameEntry<Place>[] {
  const out: NameEntry<Place>[] = ALL_PLACES.map((p) => ({ key: compact(p.name), value: p }))
  for (const [mapKey, nick] of Object.entries(NICKNAMES)) {
    for (const [said, label] of Object.entries(nick)) {
      const p = ALL_PLACES.find((x) => x.mapKey === mapKey && x.name.toLowerCase() === label.toLowerCase())
      if (p) out.push({ key: compact(said), value: p })
    }
  }
  return out.filter((e) => e.key.length >= 3)
}

export function placesOn(mapKey: string): Place[] {
  return ALL_PLACES.filter((p) => p.mapKey === mapKey)
}

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)

/** The named place closest to a spot ("near Old Gas"), if one is within `maxM` metres. */
export function nearestPlace(mapKey: string, pos: Position, maxM = 120): { place: Place; m: number } | null {
  let best: { place: Place; m: number } | null = null
  for (const p of placesOn(mapKey)) {
    const m = dist(p.position, pos)
    if (m <= maxM && (!best || m < best.m)) best = { place: p, m }
  }
  return best
}
