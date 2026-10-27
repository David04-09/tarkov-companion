/**
 * The Hideout tab's bunker: which room each station is drawn in and which small animation it
 * gets once built. Rooms group stations by what they do; they are not the game's floor plan.
 * Stations are matched by tarkov.dev's normalizedName; anything new lands in "Other stations".
 */
import type { HideoutStation } from '../api/types'

export type Effect =
  | 'power' | 'fan' | 'heat' | 'water' | 'btc' | 'booze' | 'scan' | 'ritual' | 'med' | 'cam'
  | 'light' | 'sun' | 'food' | 'rest' | 'tools' | 'range' | 'gym' | 'trophy' | 'none'

export interface Room {
  id: string
  name: string
  note: string
  /** normalizedName of each station, in drawing order. */
  stations: string[]
  /** Spans the whole width of the bunker. */
  wide?: boolean
}

export const WALL_STATION = 'defective-wall'

export const ROOMS: Room[] = [
  { id: 'entrance', name: 'Entrance & storage', note: 'Door, lights and your stash', stations: ['security', 'illumination', 'stash', 'scav-case'] },
  { id: 'power', name: 'Power & air', note: 'Keeps the bunker running', stations: ['generator', 'vents', 'heating', 'air-filtering-unit', 'solar-power'] },
  { id: 'water', name: 'Water & food', note: 'Supplies and the still', stations: ['water-collector', 'nutrition-unit', 'booze-generator', 'lavatory'] },
  { id: 'workshop', name: 'Workshop', note: 'Tools, guns and the range', stations: ['workbench', 'weapon-rack', 'shooting-range'] },
  { id: 'living', name: 'Med & living', note: 'Heal, rest and read', stations: ['medstation', 'rest-space', 'library'] },
  { id: 'intel', name: 'Intel & the circle', note: 'Information, crypto and rituals', stations: ['intelligence-center', 'bitcoin-farm', 'cultist-circle'] },
  { id: 'wall', name: 'Behind the wall', note: 'Opens once the Defective Wall is fully rebuilt', stations: [WALL_STATION, 'gym', 'hall-of-fame', 'gear-rack'], wide: true },
]

export const EFFECTS: Record<string, Effect> = {
  generator: 'power',
  vents: 'fan',
  'air-filtering-unit': 'fan',
  heating: 'heat',
  'water-collector': 'water',
  lavatory: 'water',
  'bitcoin-farm': 'btc',
  'booze-generator': 'booze',
  'intelligence-center': 'scan',
  'cultist-circle': 'ritual',
  medstation: 'med',
  security: 'cam',
  illumination: 'light',
  'solar-power': 'sun',
  'nutrition-unit': 'food',
  'rest-space': 'rest',
  workbench: 'tools',
  'shooting-range': 'range',
  gym: 'gym',
  'hall-of-fame': 'trophy',
}

export interface PlacedRoom {
  room: Room
  stations: HideoutStation[]
}

export function roomsFor(stations: HideoutStation[]): PlacedRoom[] {
  const byName = new Map(stations.map((s) => [s.normalizedName, s]))
  const used = new Set<string>()
  const out: PlacedRoom[] = ROOMS.map((room) => ({
    room,
    stations: room.stations.flatMap((n) => {
      const s = byName.get(n)
      if (!s) return []
      used.add(s.id)
      return [s]
    }),
  }))
  const other = stations.filter((s) => !used.has(s.id))
  if (other.length) out.push({ room: { id: 'other', name: 'Other stations', note: 'New in the game data', stations: other.map((s) => s.normalizedName) }, stations: other })
  return out.filter((r) => r.stations.length > 0)
}

/** How dark the bunker is drawn for an Illumination level (0 = candles not even lit). */
export function darkness(illumination: number, max: number): number {
  if (max <= 0) return 0
  return Math.round(Math.max(0, 1 - illumination / max) * 0.45 * 100) / 100
}
