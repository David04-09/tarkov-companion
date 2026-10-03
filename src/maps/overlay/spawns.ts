import type { GameData, MapBoss, MapDetails, Position } from '../../api/types'

export type SpawnGroup = 'boss' | 'goons' | 'cultists' | 'raiders' | 'rogues'

export interface BossEntry {
  /** Stable key for toggles: the mob's normalizedName. */
  key: string
  name: string
  group: SpawnGroup
  portrait: string | null
  /** Combined spawn chance when a map lists the same mob several times (1 - Π(1 - p)). */
  spawnChance: number
  /** One entry per listed spawn (a mob can appear several times with different locations). */
  spawns: MapBoss[]
  escorts: { name: string; counts: number[] }[]
  conditions: string[]
}

export interface SpawnModel {
  bosses: BossEntry[]
  pmc: Position[]
  scav: Position[]
  sniper: Position[]
  /** True when the goon report names this map. */
  goonsHere: boolean
  goonReportAt: number | null
}

const GOONS = new Set(['knight', 'big-pipe', 'birdeye'])
/** PvE lists AI PMC squads as "bosses" (bear/usec, 50 %); they are not bosses and have no positions. */
const AI_PMC = new Set(['bear', 'usec'])

function groupOf(normalizedName: string): SpawnGroup {
  if (GOONS.has(normalizedName)) return 'goons'
  if (normalizedName.startsWith('cultist')) return 'cultists'
  if (normalizedName === 'raider') return 'raiders'
  if (normalizedName === 'rogue') return 'rogues'
  return 'boss'
}

function conditionsFor(b: MapBoss, group: SpawnGroup): string[] {
  const out: string[] = []
  if (group === 'cultists') out.push('Night raids only (not stated in the data; from game knowledge)')
  if (b.trigger) out.push(`Needs a switch/lever (${b.trigger})`)
  if (b.spawnTime > 0) out.push(`Spawns ${Math.round(b.spawnTime / 60)} min after raid start${b.spawnTimeRandom ? ' (random)' : ''}`)
  return out
}

/** Everything the Spawns panel and layer need for one map. */
export function buildSpawnModel(data: GameData, mapId: string): SpawnModel {
  const details: MapDetails | undefined = data.mapDetails[mapId]
  const byKey = new Map<string, BossEntry>()
  for (const b of details?.bosses ?? []) {
    const key = b.normalizedName ?? b.mobId ?? 'boss'
    if (AI_PMC.has(key)) continue
    const group = groupOf(key)
    let e = byKey.get(key)
    if (!e) {
      e = { key, name: b.name ?? (b.mobId && data.mobNames[b.mobId]) ?? 'Boss', group, portrait: (b.mobId && data.mobPortraits[b.mobId]) || null, spawnChance: 0, spawns: [], escorts: [], conditions: [] }
      byKey.set(key, e)
    }
    e.spawns.push(b)
    for (const esc of b.escorts) {
      const existing = e.escorts.find((x) => x.name === esc.name)
      if (existing) existing.counts = [...new Set([...existing.counts, ...esc.counts])].sort((a, c) => a - c)
      else e.escorts.push({ name: esc.name, counts: [...esc.counts] })
    }
    for (const c of conditionsFor(b, group)) if (!e.conditions.includes(c)) e.conditions.push(c)
  }
  for (const e of byKey.values()) {
    // Independent listings: chance that at least one spawns.
    e.spawnChance = 1 - e.spawns.reduce((p, s) => p * (1 - Math.min(1, Math.max(0, s.spawnChance))), 1)
  }
  const bosses = [...byKey.values()].sort((a, b) => Number(a.group !== 'boss') - Number(b.group !== 'boss') || b.spawnChance - a.spawnChance || a.name.localeCompare(b.name))

  const pmc: Position[] = []
  const scav: Position[] = []
  const sniper: Position[] = []
  for (const s of details?.spawns ?? []) {
    if (s.categories.includes('sniper')) sniper.push(s.position)
    if (!s.categories.includes('player')) continue
    const sides = new Set(s.sides)
    if (sides.has('pmc') || sides.has('all')) pmc.push(s.position)
    if (sides.has('scav') || sides.has('all')) scav.push(s.position)
  }
  return {
    bosses,
    pmc,
    scav,
    sniper,
    goonsHere: data.goonReport?.mapId === mapId,
    goonReportAt: data.goonReport?.at ?? null,
  }
}

export const spawnKey = {
  boss: (key: string) => `boss:${key}`,
  guards: (key: string) => `guards:${key}`,
}

/** Which toggle switches a boss entry on (group toggles cover goons/cultists/raiders/rogues). */
export function toggleKeyFor(entry: BossEntry): string {
  return entry.group === 'boss' ? spawnKey.boss(entry.key) : entry.group
}
