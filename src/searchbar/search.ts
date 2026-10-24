/**
 * One search over everything the bar knows: maps, items, quests, traders, bosses, extracts,
 * hideout stations, story chapters and a few words that open pages ("kappa", "traders", …).
 * Every typed word must appear (any order); the best matches of each kind come first.
 */
import type { HideoutStation, Item, Task, Trader } from '../api/types'
import { matchesSearch, rankMatch, searchWords } from '../lib/fleaSearch'
import type { MapOption } from '../maps/useMapOptions'
import type { View } from './detailsContext'
import type { BossRef, ExtractRef } from './overlayLogic'

export type Hit =
  | { kind: 'map'; map: MapOption }
  | { kind: 'item'; item: Item }
  | { kind: 'quest'; task: Task }
  | { kind: 'trader'; trader: Trader }
  | { kind: 'boss'; boss: BossRef }
  | { kind: 'extract'; extract: ExtractRef; mapName: string }
  | { kind: 'station'; station: HideoutStation }
  | { kind: 'story'; slug: string; title: string }
  | { kind: 'ammo'; id: string; label: string }
  | { kind: 'special'; view: View; label: string; hint: string }

export const hitKey = (h: Hit): string => {
  switch (h.kind) {
    case 'map':
      return `map:${h.map.key}`
    case 'item':
      return `item:${h.item.id}`
    case 'quest':
      return `quest:${h.task.id}`
    case 'trader':
      return `trader:${h.trader.id}`
    case 'boss':
      return `boss:${h.boss.key}`
    case 'extract':
      return `extract:${h.extract.mapId}:${h.extract.faction}:${h.extract.name}`
    case 'station':
      return `station:${h.station.id}`
    case 'story':
      return `story:${h.slug}`
    case 'ammo':
      return `ammo:${h.id}`
    case 'special':
      return `special:${h.view.kind}`
  }
}

/** Other names people use for maps. */
export const MAP_NICKNAMES: Record<string, string> = { 'the-lab': 'labs lab', 'streets-of-tarkov': 'streets', 'ground-zero': 'gz', 'ground-zero-21': 'gz', 'night-factory': 'night', 'the-labyrinth': 'labyrinth', interchange: 'ultra mall' }

const SPECIALS: { words: string[]; view: View; label: string; hint: string }[] = [
  { words: ['kappa', 'collector', 'container'], view: { kind: 'kappa' }, label: 'Kappa path', hint: 'quests still to do' },
  { words: ['lightkeeper', 'lk'], view: { kind: 'lightkeeper' }, label: 'Lightkeeper path', hint: 'quests still to do' },
  { words: ['traders', 'restock', 'restocks', 'reset'], view: { kind: 'traders' }, label: 'Trader restocks', hint: 'countdowns' },
  { words: ['hideout', 'stations', 'upgrade', 'upgrades', 'build'], view: { kind: 'hideout' }, label: 'Hideout', hint: 'what you can build' },
  { words: ['story', 'chapters', 'chapter'], view: { kind: 'story', id: null }, label: 'Story chapters', hint: 'tick the steps' },
  { words: ['settings', 'options', 'opacity', 'hotkey', 'hotkeys', 'size', 'resize'], view: { kind: 'settings' }, label: 'Search bar settings', hint: 'look, size, hotkeys' },
  { words: ['help', 'what', 'how'], view: { kind: 'help' }, label: 'What it can do', hint: 'help' },
]

export interface SearchSource {
  maps: MapOption[]
  items: Item[]
  /** `${name}\n${shortName}` lower case, per item id (built once). */
  itemText: Map<string, string>
  tasks: Task[]
  traders: Trader[]
  bosses: BossRef[]
  extracts: ExtractRef[]
  mapNameById: Map<string, string>
  stations: HideoutStation[]
  story: { slug: string; title: string }[]
  /** Ammo calibres with their readable names ("5.45x39 mm"). */
  calibers: { id: string; label: string }[]
}

const LIMITS = { special: 2, ammo: 2, map: 3, trader: 2, boss: 3, station: 2, extract: 3, item: 6, quest: 5, story: 2 } as const
const MAX_HITS = 18

export function searchAll(query: string, src: SearchSource): Hit[] {
  const w = searchWords(query)
  if (w.join('').length < 2) return []
  const byRank = <T,>(list: T[], name: (t: T) => string, short: (t: T) => string = () => '') => list.sort((a, b) => rankMatch(name(a), short(a), w) - rankMatch(name(b), short(b), w) || name(a).length - name(b).length)
  const has = (text: string) => matchesSearch(text.toLowerCase(), w)

  const specials = SPECIALS.filter((s) => w.some((q) => s.words.some((word) => word === q || (q.length >= 3 && word.startsWith(q))))).slice(0, LIMITS.special)
  const maps = src.maps.filter((m) => !/night/.test(m.key) && has(`${m.name} ${MAP_NICKNAMES[m.key] ?? ''}`)).slice(0, LIMITS.map)
  const traders = byRank(src.traders.filter((t) => has(t.name)), (t) => t.name).slice(0, LIMITS.trader)
  const bosses = byRank(src.bosses.filter((b) => b.maps.length && has(b.name)), (b) => b.name).slice(0, LIMITS.boss)
  const stations = byRank(src.stations.filter((s) => has(s.name)), (s) => s.name).slice(0, LIMITS.station)
  const extracts = byRank(src.extracts.filter((e) => has(e.name)), (e) => e.name).slice(0, LIMITS.extract)
  const items = byRank(src.items.filter((it) => matchesSearch(src.itemText.get(it.id) ?? '', w)), (it) => it.name, (it) => it.shortName).slice(0, LIMITS.item)
  const quests = byRank(src.tasks.filter((t) => has(t.name)), (t) => t.name).slice(0, LIMITS.quest)
  const story = byRank(src.story.filter((s) => has(s.title)), (s) => s.title).slice(0, LIMITS.story)
  // A calibre only for queries with a number in them ("5.45", "7.62x39", "12 gauge").
  const ammo = /\d/.test(query) ? byRank(src.calibers.filter((c) => has(c.label.replace(/\s+mm\b/, '') + ' ' + c.label)), (c) => c.label).slice(0, LIMITS.ammo) : []

  const hits: Hit[] = [
    ...specials.map((s) => ({ kind: 'special' as const, view: s.view, label: s.label, hint: s.hint })),
    ...ammo.map((c) => ({ kind: 'ammo' as const, id: c.id, label: c.label })),
    ...maps.map((map) => ({ kind: 'map' as const, map })),
    ...traders.map((trader) => ({ kind: 'trader' as const, trader })),
    ...bosses.map((boss) => ({ kind: 'boss' as const, boss })),
    ...stations.map((station) => ({ kind: 'station' as const, station })),
    ...extracts.map((extract) => ({ kind: 'extract' as const, extract, mapName: src.mapNameById.get(extract.mapId) ?? '' })),
    ...items.map((item) => ({ kind: 'item' as const, item })),
    ...quests.map((task) => ({ kind: 'quest' as const, task })),
    ...story.map((s) => ({ kind: 'story' as const, slug: s.slug, title: s.title })),
  ]
  return hits.slice(0, MAX_HITS)
}
