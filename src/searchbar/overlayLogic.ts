/**
 * Pure helpers for the search bar over the game: in-game time, the raid you are in (from the game
 * log's events), questlines, valuable/needed loose loot, and indexes of bosses and extracts across
 * maps. No React, no stores, so they are cheap to test.
 */
import type { GameData, Item, ItemsById, MapDetails, Position, Task } from '../api/types'
import type { GameEvent } from '../shared/desktop-api'
import { bossName, bossSearchWords } from '../maps/overlay/bossNames'

// ---------------------------------------------------------------------------
// Tarkov time
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The in-game clock: Tarkov runs 7× real time, offset to Moscow time; the "right" side of the
 * raid selection screen is 12 hours ahead. Same formula as tarkov.dev.
 */
export function tarkovTime(now: number, right: boolean): string {
  const offset = 3 * 60 * 60 * 1000 + (right ? 12 * 60 * 60 * 1000 : 0)
  const t = new Date((offset + now * 7) % DAY_MS)
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`
}

/** Night in Tarkov (roughly 22:00–05:00), for a moon icon. */
export function isTarkovNight(now: number, right: boolean): boolean {
  const h = Number(tarkovTime(now, right).slice(0, 2))
  return h >= 22 || h < 5
}

// ---------------------------------------------------------------------------
// The raid you are in, from the game log
// ---------------------------------------------------------------------------

export interface RaidState {
  /** "Location:" value from the log (GameMap.nameId), when matched. */
  nameId: string | null
  /** Scene path from the map load (GameMap.scenePath). */
  scenePath: string | null
  /** When the map started loading or the raid was matched. */
  since: number
  /** When the raid itself started (GameStarted), else null while loading. */
  startedAt: number | null
}

type RaidEvent = Pick<GameEvent, 'kind' | 'at'> & { scenePath?: string; location?: string }

/** A raid that went this long without an end in the log is treated as over. */
export const RAID_STALE_MS = 3 * 60 * 60 * 1000

/** Walks events in time order; returns the raid in progress after the last one (or null). */
export function reduceRaid(events: readonly RaidEvent[], now: number, prev: RaidState | null = null): RaidState | null {
  let raid = prev
  for (const e of events) {
    switch (e.kind) {
      case 'mapLoading':
        raid = { nameId: null, scenePath: e.scenePath ?? null, since: e.at, startedAt: null }
        break
      case 'raidMatched':
        raid = raid && !raid.startedAt && e.at - raid.since < 15 * 60_000 ? { ...raid, nameId: e.location ?? raid.nameId } : { nameId: e.location ?? null, scenePath: null, since: e.at, startedAt: null }
        break
      case 'raidStarted':
        if (raid && !raid.startedAt) raid = { ...raid, startedAt: e.at }
        break
      case 'raidEnded':
      case 'matchingAborted':
        raid = null
        break
      default:
        break
    }
  }
  if (raid && now - (raid.startedAt ?? raid.since) > RAID_STALE_MS) return null
  return raid
}

/** The small map table the search bar keeps between starts (so the raid chip can name the map before the data loads). */
export interface MapRow {
  key: string
  name: string
  nameId: string
  scenePath: string | null
  raidDuration: number
}

export function mapRows(data: GameData): MapRow[] {
  return data.maps.map((m) => ({ key: m.normalizedName, name: m.name, nameId: m.nameId, scenePath: m.scenePath, raidDuration: m.raidDuration }))
}

/** The map of a raid, by its log location, else its scene path. */
export function raidMap(raid: RaidState | null, rows: readonly MapRow[]): MapRow | null {
  if (!raid) return null
  const byName = raid.nameId ? rows.find((r) => r.nameId.toLowerCase() === raid.nameId!.toLowerCase()) : undefined
  if (byName) return byName
  const scene = raid.scenePath?.toLowerCase()
  return scene ? (rows.find((r) => r.scenePath && scene.includes(r.scenePath.toLowerCase())) ?? rows.find((r) => r.scenePath && r.scenePath.toLowerCase().includes(scene)) ?? null) : null
}

/**
 * When a raid can be called over even without an end line in the log (the game often writes
 * none): 10 minutes after its time ran out, or 3 hours after it began when its length is unknown.
 */
export function raidOverAt(raid: RaidState, row: MapRow | null): number {
  if (raid.startedAt && row?.raidDuration) return raid.startedAt + (row.raidDuration + 10) * 60_000
  return (raid.startedAt ?? raid.since) + RAID_STALE_MS
}

/** Seconds left in the raid, or null before it starts / when the length is unknown. */
export function raidSecondsLeft(raid: RaidState | null, row: MapRow | null, now: number): number | null {
  if (!raid?.startedAt || !row?.raidDuration) return null
  return Math.round((raid.startedAt + row.raidDuration * 60_000 - now) / 1000)
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Questlines
// ---------------------------------------------------------------------------

export interface QuestlineStep {
  task: Task
  /** Steps away from the quest (1 = directly before/after). */
  depth: number
}

/**
 * The whole line around a quest: everything that must be done before it (transitively, nearest
 * first) and everything it opens up (transitively). "Complete" prerequisites only, as the status
 * rules use; walks are cycle-safe.
 */
export function questline(taskId: string, tasksById: Record<string, Task | undefined>, unlocks: ReadonlyMap<string, string[]>, max = 60): { before: QuestlineStep[]; after: QuestlineStep[] } {
  const walk = (start: string, next: (id: string) => string[]) => {
    const seen = new Map<string, number>()
    let frontier = [start]
    for (let depth = 1; frontier.length && seen.size < max; depth++) {
      const nextFrontier: string[] = []
      for (const id of frontier) {
        for (const n of next(id)) {
          if (n === taskId || seen.has(n) || !tasksById[n]) continue
          seen.set(n, depth)
          nextFrontier.push(n)
        }
      }
      frontier = nextFrontier
    }
    return [...seen.entries()].map(([id, depth]) => ({ task: tasksById[id]!, depth })).sort((a, b) => a.depth - b.depth || a.task.name.localeCompare(b.task.name))
  }
  const prereqs = (id: string) => (tasksById[id]?.taskRequirements ?? []).filter((r) => r.status.includes('complete')).map((r) => r.taskId)
  const follows = (id: string) => (unlocks.get(id) ?? []).filter((n) => tasksById[n]?.taskRequirements.some((r) => r.taskId === id && r.status.includes('complete')))
  return { before: walk(taskId, prereqs), after: walk(taskId, follows) }
}

// ---------------------------------------------------------------------------
// Loose loot worth picking up
// ---------------------------------------------------------------------------

/** What an item is worth to you: the better of the flea average and the best trader offer. */
export function itemValue(item: Item | undefined): number {
  if (!item) return 0
  const trader = item.sellToTrader.reduce((m, t) => Math.max(m, t.priceRUB), 0)
  const flea = item.types.includes('noFlea') ? 0 : (item.avg24hPrice ?? item.lastLowPrice ?? 0)
  return Math.max(trader, flea)
}

export interface LootSpot {
  position: Position
  /** Item ids at this spot that pass the filter, best first. */
  itemIds: string[]
  /** Value of the best item (for colour). */
  best: number
}

/**
 * Loose-loot spots with at least one item worth `min` roubles or more (per inventory slot when
 * `perSlot`). The spots and their item lists are tarkov.dev's; spawn chances are not in the data.
 */
export function valuableSpots(details: MapDetails | undefined, items: ItemsById | undefined, min: number, perSlot: boolean): LootSpot[] {
  if (!details || !items) return []
  const cache = new Map<string, number>()
  const worth = (id: string) => {
    let v = cache.get(id)
    if (v === undefined) {
      const it = items[id]
      v = itemValue(it)
      if (perSlot && it) v /= Math.max(1, it.width * it.height)
      cache.set(id, v)
    }
    return v
  }
  const out: LootSpot[] = []
  for (const spot of details.lootLoose) {
    const ids = spot.itemIds.filter((id) => worth(id) >= min).sort((a, b) => worth(b) - worth(a))
    if (ids.length) out.push({ position: spot.position, itemIds: ids, best: worth(ids[0]) })
  }
  return out
}

/** Loose-loot spots holding items you still need (quests, hideout), with the needed ids first. */
export function neededSpots(details: MapDetails | undefined, needed: ReadonlySet<string>): LootSpot[] {
  if (!details || needed.size === 0) return []
  const out: LootSpot[] = []
  for (const spot of details.lootLoose) {
    const ids = spot.itemIds.filter((id) => needed.has(id))
    if (ids.length) out.push({ position: spot.position, itemIds: ids, best: 0 })
  }
  return out
}

/** Needed items lying around on a map: how many spots each has. */
export function neededOnMap(details: MapDetails | undefined, needed: ReadonlySet<string>): { itemId: string; spots: Position[] }[] {
  const by = new Map<string, Position[]>()
  for (const spot of neededSpots(details, needed)) for (const id of spot.itemIds) (by.get(id) ?? by.set(id, []).get(id)!).push(spot.position)
  return [...by.entries()].map(([itemId, spots]) => ({ itemId, spots })).sort((a, b) => b.spots.length - a.spots.length)
}

// ---------------------------------------------------------------------------
// Indexes across maps (for search)
// ---------------------------------------------------------------------------

export interface BossRef {
  key: string
  name: string
  portrait: string | null
  /** More words search finds it by (the Goons: Knight, Big Pipe, Birdeye). */
  aka?: string
  /** Per map: chance that at least one listing spawns. */
  maps: { mapId: string; chance: number }[]
}

/** AI PMC squads are listed as "bosses" in PvE; they are not. */
const NOT_BOSSES = new Set(['bear', 'usec'])

export function bossIndex(data: GameData): BossRef[] {
  const by = new Map<string, BossRef>()
  for (const m of data.maps) {
    if (/night/i.test(m.normalizedName)) continue
    const perMap = new Map<string, number>()
    for (const b of data.mapDetails[m.id]?.bosses ?? []) {
      const key = b.normalizedName || b.mobId || 'boss'
      if (NOT_BOSSES.has(key)) continue
      perMap.set(key, 1 - (1 - (perMap.get(key) ?? 0)) * (1 - Math.min(1, Math.max(0, b.spawnChance))))
      if (!by.has(key)) {
        const dataName = b.name || (b.mobId && data.mobNames[b.mobId]) || 'Boss'
        by.set(key, { key, name: bossName(key, dataName), aka: bossSearchWords(key, dataName), portrait: (b.mobId && data.mobPortraits[b.mobId]) || null, maps: [] })
      }
    }
    for (const [key, chance] of perMap) by.get(key)!.maps.push({ mapId: m.id, chance })
  }
  for (const b of by.values()) b.maps.sort((a, c) => c.chance - a.chance)
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export interface ExtractRef {
  name: string
  faction: 'pmc' | 'scav' | 'shared'
  mapId: string
  position: Position
}

export function extractIndex(data: GameData): ExtractRef[] {
  const out: ExtractRef[] = []
  const seen = new Set<string>()
  for (const m of data.maps) {
    for (const e of data.mapDetails[m.id]?.extracts ?? []) {
      const k = `${m.id}:${e.faction}:${e.name}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ name: e.name, faction: e.faction, mapId: m.id, position: e.position })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Story wait timers and trader restocks (for the pills)
// ---------------------------------------------------------------------------

export interface StoryTimerInfo {
  label: string
  /** Earliest and latest time the wait can end (ms). */
  minAt: number
  maxAt: number
}

/** The running story wait that ends first, from the Story tab's saved timers (any shape is checked). */
export function nextStoryTimer(byMode: unknown, mode: string, now: number): StoryTimerInfo | null {
  const chapters = byMode && typeof byMode === 'object' ? (byMode as Record<string, unknown>)[mode] : null
  if (!chapters || typeof chapters !== 'object') return null
  let best: StoryTimerInfo | null = null
  for (const ch of Object.values(chapters as Record<string, { timers?: Record<string, unknown> }>)) {
    for (const t of Object.values(ch?.timers ?? {})) {
      const timer = t as { startedAt?: unknown; minH?: unknown; maxH?: unknown; label?: unknown }
      if (typeof timer.startedAt !== 'number' || typeof timer.minH !== 'number' || typeof timer.maxH !== 'number') continue
      const minAt = timer.startedAt + timer.minH * 3600_000
      const maxAt = timer.startedAt + Math.max(timer.minH, timer.maxH) * 3600_000
      if (maxAt <= now) continue
      if (!best || minAt < best.minAt) best = { label: typeof timer.label === 'string' ? timer.label : 'Story wait', minAt, maxAt }
    }
  }
  return best
}

export interface RestockRow {
  name: string
  at: number
}

/** The next trader restock still ahead. */
export function nextRestock(rows: readonly RestockRow[], now: number): RestockRow | null {
  return rows.filter((r) => r.at > now).sort((a, b) => a.at - b.at)[0] ?? null
}

/** Colour of a loot dot by what the best item there is worth. */
export function valueColor(v: number): string {
  if (v >= 500_000) return '#f43f5e'
  if (v >= 200_000) return '#fb923c'
  if (v >= 100_000) return '#facc15'
  return '#2dd4bf'
}

/** Distance across the map picture in metres (height left out: the ruler's clicks have none). */
export function distance2d(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Straight-line distance in metres (game units are metres; height counts too). */
export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
