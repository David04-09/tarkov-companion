/**
 * The assistant's answers. No AI model: it recognises what is asked from a few sentence
 * patterns plus the names it knows (maps, places, quests, items) and answers from the same
 * data the other tabs use. Only real data is used; when something is not in the data it says so.
 */
import type { GameData, GameMap, Item, ItemsById, Position, Task } from '../api/types'
import type { TaskStatus } from '../lib/taskStatus'
import type { MapTask } from '../maps/overlay/mapTasks'
import { labelKey, nearestPlace, placeEntries, type Place } from './places'
import { compact, findNames, sayDistance, words, type NameEntry } from './text'
import { closestTo, orderStops, parseSide, pmcSpawns, spawnOnSide } from './route/routePlan'
import { raidAnswer, type LiveInfo } from './raidAnswers'
import { collectAnswer, expandNicknames, findItem, infoAnswer, itemQuestionKind, needAnswer, nicknameItem, parseCount, priceAnswer, whereAnswer, type ItemContext } from './items'

export interface MapPoint {
  id: string
  position: Position
  label: string
  kind: 'you' | 'quest' | 'place' | 'extract' | 'loot'
}

export interface MapCard {
  map: GameMap
  points: MapPoint[]
  /** Straight lines through these spots in order (start, stops…); with `walk` the page replaces them by a route over the terrain. */
  route: Position[] | null
  /** Walking route over the terrain, filled in by the page (see route/walk.ts). */
  path?: Position[]
}

export interface Reply {
  /** Said out loud and shown first. */
  text: string
  /** Extra lines shown under it (not spoken). */
  lines?: string[]
  map?: MapCard
  /** App pages to open, e.g. the quest in the Quests tab. */
  links?: { label: string; to: string }[]
  /** The map this answer was about, remembered for the next question ("and the extracts?"). */
  mapId?: string
  /** The answer needs the item list, which is loaded only on demand (it is large). */
  needsItems?: boolean
  /** Work out a walking route for map.route over the terrain before showing / saying the answer. */
  walk?: { fromName: string; toName: string }
  /** Where the player said they are, remembered for "how do I get to …" without a start. */
  youAt?: Place
  /** A guess: the question named something but did not clearly ask about it (the plain-English helper may know better). */
  weak?: boolean
  /** Shown but not read out loud (tips asking for more detail). */
  quiet?: boolean
  /** An Item Collection change waiting for "yes" (the page keeps it until the next message). */
  confirm?: { itemId: string; from: number; to: number; doneText: string }
  /** Things the assistant offers to do; each is a button and runs only when clicked. */
  actions?: AssistantAction[]
}

export type AssistantAction =
  | { kind: 'complete'; taskId: string; done: boolean; label: string }
  | { kind: 'showOnMap'; taskId: string; mapKey: string; label: string }
  | { kind: 'openMap'; mapKey: string; label: string }
  | { kind: 'openWeapon'; itemId: string; label: string }
  | { kind: 'setCollected'; itemId: string; count: number; label: string }
  | { kind: 'routeOnMap'; mapKey: string; path: Position[]; fromLabel: string; toLabel: string; label: string }

export interface AssistantContext extends Pick<ItemContext, 'collected' | 'needFor'> {
  data: GameData
  statuses: Record<string, TaskStatus>
  /** Quests that count for this player (faction). */
  tasks: Task[]
  items: ItemsById | undefined
  /** Tasks with resolved objective positions on a map. */
  tasksOnMap: (map: GameMap) => MapTask[]
  /** Compass direction from one spot to another on that map's picture, if known. */
  heading: (map: GameMap, from: Position, to: Position) => string | null
  /** Map of the previous answer. */
  lastMapId: string | null
  /** Where the player last said they were. */
  lastPlace: Place | null
  playerLevel: number
  /** Live facts (raid clock, screenshot position, hand-ins, habits); absent in tests that do not need them. */
  live?: LiveInfo
}

interface Index {
  maps: NameEntry<GameMap>[]
  places: NameEntry<Place>[]
  quests: NameEntry<Task>[]
  items: NameEntry<Item>[] | null
}

let cached: { data: GameData; items: ItemsById | undefined; tasks: Task[]; index: Index } | null = null

/** Name lists, built once per data load (not per question). */
export type Slot = 'item' | 'place' | 'map' | 'quest' | 'boss'

/**
 * The names in a question, each swapped for a plain word ("where does LEDX spawn on Customs" →
 * "where does item spawn on map"), for matching the sentence's meaning (understand.ts).
 */
export function nameSlots(question: string, ctx: AssistantContext): { masked: string; slots: Partial<Record<Slot, string>>; names: number } {
  const q = words(question)
  const index = indexFor(ctx)
  const bosses: NameEntry<string>[] = [...new Set(Object.values(ctx.data.mobNames ?? {}))].filter((n) => compact(n).length >= 4).map((n) => ({ key: compact(n), value: n }))
  type Hit = { start: number; end: number; slot: Slot; name: string; len: number }
  const hits: Hit[] = [
    ...findNames(q, index.maps).map((h) => ({ ...h, slot: 'map' as const, name: h.value.name })),
    ...findNames(q, index.places).map((h) => ({ ...h, slot: 'place' as const, name: h.value.name })),
    ...findNames(q, index.quests).filter((h) => h.len >= 5).map((h) => ({ ...h, slot: 'quest' as const, name: h.value.name })),
    ...findNames(q, bosses).map((h) => ({ ...h, slot: 'boss' as const, name: h.value })),
    ...(index.items ? findNames(q, index.items, 6).filter((h) => h.len >= 3).map((h) => ({ ...h, slot: 'item' as const, name: h.value.name })) : []),
    // Nicknames ("bitcoin" = Physical Bitcoin).
    ...(ctx.items ? q.flatMap((w, i) => { const it = nicknameItem(w, ctx.items!); return it ? [{ start: i, end: i, slot: 'item' as const, name: it.name, len: w.length }] : [] }) : []),
  ]
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || b.len - a.len)
  const used = new Set<number>()
  const chosen: Hit[] = []
  const slots: Partial<Record<Slot, string>> = {}
  for (const h of hits) {
    let free = true
    for (let i = h.start; i <= h.end; i++) if (used.has(i)) free = false
    if (!free || slots[h.slot]) continue
    for (let i = h.start; i <= h.end; i++) used.add(i)
    chosen.push(h)
    slots[h.slot] = h.name
  }
  const out: string[] = []
  for (let i = 0; i < q.length; ) {
    const h = chosen.find((c) => c.start === i)
    if (h) {
      out.push(h.slot)
      i = h.end + 1
    } else out.push(q[i++])
  }
  return { masked: out.join(' '), slots, names: chosen.length + hits.filter((h) => !chosen.includes(h) && !chosen.some((c) => h.start <= c.end && h.end >= c.start)).length }
}

function indexFor(ctx: AssistantContext): Index {
  if (cached && cached.data === ctx.data && cached.items === ctx.items && cached.tasks === ctx.tasks) return cached.index
  const maps: NameEntry<GameMap>[] = []
  for (const m of ctx.data.maps) {
    maps.push({ key: compact(m.name), value: m })
    if (m.normalizedName === 'the-lab') maps.push({ key: 'labs', value: m })
    if (m.normalizedName === 'streets-of-tarkov') maps.push({ key: 'streets', value: m })
    if (m.normalizedName.startsWith('ground-zero')) maps.push({ key: 'gz', value: m })
  }
  const quests = ctx.tasks.map((t) => ({ key: compact(t.name), value: t })).filter((e) => e.key.length >= 4)
  const items = ctx.items
    ? Object.values(ctx.items).flatMap((it) => {
        const out = [{ key: compact(it.name), value: it }]
        const short = compact(it.shortName)
        if (short.length >= 3 && short !== out[0].key) out.push({ key: short, value: it })
        return out
      })
    : null
  // Extracts count as places too ("I spawned at Crossroads", "route to ZB-1013").
  const extracts: NameEntry<Place>[] = []
  for (const m of ctx.data.maps) {
    const mapKey = labelKey(m.normalizedName)
    for (const e of ctx.data.mapDetails[m.id]?.extracts ?? []) {
      if (extracts.some((x) => x.value.mapKey === mapKey && x.value.name === e.name)) continue
      extracts.push({ key: compact(e.name), value: { mapKey, name: e.name, position: e.position, kind: 'extract' } })
    }
  }
  const index = { maps, places: [...placeEntries(), ...extracts.filter((e) => e.key.length >= 3)], quests, items }
  cached = { data: ctx.data, items: ctx.items, tasks: ctx.tasks, index }
  return index
}

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)

function mapByLabelKey(ctx: AssistantContext, key: string, prefer: GameMap | null): GameMap | undefined {
  if (prefer && labelKey(prefer.normalizedName) === key) return prefer
  // Factory and Night Factory share their place names: the day map first.
  return ctx.data.maps.find((m) => m.normalizedName === key) ?? ctx.data.maps.find((m) => labelKey(m.normalizedName) === key)
}

/** The place the question names, settling places that exist on several maps by the map named or last talked about. */
function pickPlace(hits: Place[], map: GameMap | null): { place: Place | null; ambiguous: Place[] } {
  const unique = hits.filter((p, i) => hits.findIndex((q) => q.mapKey === p.mapKey && q.name === p.name) === i)
  if (!unique.length) return { place: null, ambiguous: [] }
  if (map) {
    const here = unique.filter((p) => p.mapKey === labelKey(map.normalizedName))
    if (here.length) return { place: here[0], ambiguous: [] }
  }
  const maps = new Set(unique.map((p) => p.mapKey))
  return maps.size === 1 ? { place: unique[0], ambiguous: [] } : { place: null, ambiguous: unique }
}

/** Shown under answers whose line could not follow the terrain; the page drops it once a walking route is found. */
export const STRAIGHT_NOTE = 'The line is a straight line, not a walking path.'

const STATUS_WORD: Record<TaskStatus, string> = { available: 'available', locked: 'locked', completed: 'done' }

function questLine(t: Task, ctx: AssistantContext): string {
  return `${t.name} (${t.trader.name}, ${STATUS_WORD[ctx.statuses[t.id] ?? 'locked']}${t.minPlayerLevel > 0 ? `, level ${t.minPlayerLevel}` : ''})`
}

const HELP: Reply = {
  text: 'Here is what I can do so far.',
  lines: [
    '"I\'m at Dorms, what\'s the closest quest?" — opens the map with a walking route to the nearest available quest spot.',
    '"I spawned at Crossroads, how do I get to Dorms?" — a walking route around fences, water, rocks and minefields.',
    '"Where is Crackhouse?" — shows a place on its map.',
    '"Extracts on Customs" — lists the map\'s extracts.',
    '"Quests on Woods" — your available quests on a map.',
    '"Debut" or "how do I do Debut" — what a quest needs.',
    '"What is the LEDX for?" or "price of a GPU" — which of your quests need an item, what a key opens, and its flea price.',
    '"My progress" — level, quests done, Kappa.',
    'In raid: "how long is left?", "what time is it in Tarkov?", "where am I?" (from your last screenshot), "bosses on Customs", "where is Killa?", "where are the Goons?"',
    'Loot and danger: "safes on Customs", "loot near Dorms", "minefields on Woods", "locked doors near Dorms", "what keys do I need for Debut?"',
    'Gear: "best ammo for 5.45", "will M995 go through class 5?", "should I keep the LEDX?", "what should I loot on Customs?"',
    'After raid: "what did I hand in today?", "my stats", "what does Debut unlock?", "when does Prapor restock?", "when can I scav?", "what should I play tonight?"',
  ],
}

/** Answers one question. Pure: everything it needs comes in `ctx`. */
export function answer(question: string, ctx: AssistantContext): Reply {
  const q = words(question)
  const said = ` ${q.join(' ')} `
  if (!q.length) return HELP
  if (/^ (help|hi|hello|hey|what can you do)\b/.test(said)) return HELP
  // Small talk gets a short answer, not "I don't know 'thanks'".
  if (/^ (thanks|thank you|thank u|thx|ty|cheers|nice|great|cool|awesome|perfect|good job|well done|ok|okay)( very much| a lot| mate| sir| bro)? $/.test(said)) return { text: 'Anytime, sir.' }

  const index = indexFor(ctx)
  const mapHits = findNames(q, index.maps)
  const namedMap = mapHits[0]?.value ?? null
  const lastMap = ctx.data.maps.find((m) => m.id === ctx.lastMapId) ?? null
  // The map you are in a raid on (game log / last screenshot) beats the one talked about last.
  const raidMap = ctx.live?.currentMapId ? (ctx.data.maps.find((m) => m.id === ctx.live!.currentMapId) ?? null) : null
  const contextMap = namedMap ?? raidMap ?? lastMap
  // Map names are not places too ("Customs" the map, not a label called Customs).
  const mapWords = new Set(mapHits.flatMap((h) => Array.from({ length: h.end - h.start + 1 }, (_, i) => h.start + i)))
  const placeHits = findNames(q, index.places).filter((h) => !mapWords.has(h.start))
  const places = placeHits.map((h) => h.value)

  const wantsNearest = /\b(closest|nearest|next|near me|close by|nearby)\b/.test(said) && /\b(quest|quests|task|tasks|objective|objectives|mission)\b/.test(said)
  const saysWhereIAm = /\b(i m|im|i am|iam|standing|currently)\b.*\b(at|in|near|by|on|inside|around)\b/.test(said)
  const wantsRoute = /\b(get to|go to|route|path|way to|take me|guide me|walk to|head to|directions|navigate|get from|run to|draw me|route for|path for)\b/.test(said) || /\bfrom\b.*\bto\b/.test(said)

  // 0. "I spawned at Crossroads, how do I get to Dorms?" — a walking route over the terrain.
  if (wantsRoute && !wantsNearest) {
    const routed = route(q, placeHits, contextMap, ctx, index)
    if (routed) return routed
  }

  // 1. "I'm at Dorms, what's the next closest task?"
  if (wantsNearest || (saysWhereIAm && places.length)) {
    const { place, ambiguous } = pickPlace(places, contextMap)
    if (ambiguous.length) return { text: `${ambiguous[0].name} is on more than one map. Which one?`, lines: [...new Set(ambiguous.map((p) => mapByLabelKey(ctx, p.mapKey, null)?.name ?? p.mapKey))] }
    // No place in the question: the place the player named last, if any (asking every time got annoying).
    const known = !place && !ambiguous.length && ctx.lastPlace && (!namedMap || ctx.lastPlace.mapKey === labelKey(namedMap.normalizedName)) ? ctx.lastPlace : null
    if (known) {
      const map = mapByLabelKey(ctx, known.mapKey, contextMap)
      if (map) return { ...nearestQuest(known, map, ctx), youAt: known }
    }
    if (!place) return { text: contextMap ? `Tip: name a place on ${contextMap.name}, like "I'm at ${exampleFor(contextMap)}".` : 'Tip: name a place and the map, like "I\'m at Dorms on Customs".', quiet: true }
    const map = mapByLabelKey(ctx, place.mapKey, contextMap)
    if (!map) return { text: `I know ${place.name}, but not which map it belongs to.` }
    return { ...nearestQuest(place, map, ctx), youAt: place }
  }

  // In and after a raid: time left, Tarkov time, where am I, bosses, loot, hazards, keys, ammo, keep or sell, stats… (raidAnswers.ts).
  if (!wantsRoute && !wantsNearest) {
    const quest = findNames(q, index.quests).find((h) => h.len >= 5)?.value ?? null
    const { place } = pickPlace(places, contextMap)
    const raid = raidAnswer(ctx, ctx.live, { said, q, map: contextMap, place, quest, mapOf: (key) => mapByLabelKey(ctx, key, contextMap) ?? ctx.data.maps.find((m) => m.normalizedName === key) })
    if (raid) return raid
  }

  // 2a. Item Collection: "collected 5 wires", "used 2 wires", "how many wires do I still need".
  const asking = /\b(where|how do|how can|how to)\b/.test(said)
  const collecting = !asking && /\b(collected|picked up|grabbed|looted|got|found|add|added|have another)\b/.test(said)
  const using = !asking && /\b(used|sold|handed in|turned in|lost|gave|removed|remove|take away|took away|minus)\b/.test(said)
  const howMany = /\bhow many\b/.test(said) && /\b(need|needed|left|still|have|got)\b/.test(said)
  // "What is a GPU I found worth?" is a price question, not "add one".
  const asksPrice = /\b(price|prices|cost|costs|worth|value|how much)\b/.test(said) && !/\b(add|added|collected|picked up|used|sold|handed in)\b/.test(said)
  if ((collecting || using || howMany) && !wantsRoute && !(asksPrice && !howMany)) {
    if (!ctx.items) return { text: 'Loading the item list…', needsItems: true }
    const { count, at } = parseCount(q)
    const hit = findItem(expandNicknames(q.filter((_, i) => i !== at && !mapWords.has(i))), ctx.items)
    if (hit) {
      const r = howMany ? needAnswer(hit, ctx) : collectAnswer(hit, using ? -count : count, ctx)
      // "Am I lost" / "I got it": no number and a loose verb is a guess, not a clear "add 2 wires".
      const loose = !howMany && at < 0 && !/(collected|picked up|looted|add|added|used|sold|handed in|turned in|removed|remove)/.test(said)
      return loose ? { ...r, weak: true } : r
    }
    if (!howMany) return { text: 'Which item? Say its name, like "collected 5 wires".', quiet: true }
  }

  // "Signal part 1" when the data has only parts 3 and 4: say so, never show another part.
  const missingPart = missingQuestPart(q, index.quests)
  if (missingPart) return missingPart

  // 2. Items: where to find one, what it is worth, what it is for. The item list is large, so it is
  // loaded only when a question needs it; places and quests are answered without it.
  const priceWords = /\b(price|prices|cost|costs|worth|value|sell|sells|selling|buy|key|keys|keycard|how much)\b/.test(said)
  const itemCue = priceWords || /\b(find|spawn|spawns|loot|need|needed|for|used)\b/.test(said)
  if (itemCue && !wantsRoute) {
    if (!ctx.items) {
      if (priceWords || !places.length) return { text: 'Loading the item list…', needsItems: true }
    } else {
      const neededIds = new Set(ctx.tasks.filter((t) => ctx.statuses[t.id] !== 'completed').flatMap((t) => t.objectives.flatMap((o) => o.itemIds)))
      const hit = findItem(expandNicknames(q.filter((_, i) => !mapWords.has(i))), ctx.items, undefined, (it) => (neededIds.has(it.id) ? 1 : 0))
      if (hit) {
        const kind = itemQuestionKind(said)
        return kind === 'where' ? whereAnswer(hit, ctx) : kind === 'price' ? priceAnswer(hit, ctx) : infoAnswer(hit, ctx)
      }
    }
  }

  // 3. Extracts on a map.
  if (/\b(extract|extracts|extraction|extractions|exit|exits)\b/.test(said) && contextMap) {
    const ex = ctx.data.mapDetails[contextMap.id]?.extracts ?? []
    if (!ex.length) return { text: `The data has no extracts for ${contextMap.name}.`, mapId: contextMap.id }
    // The data lists some extracts once for PMCs and again for scavs: one line per name.
    const byName = new Map<string, { pmc: boolean; scav: boolean }>()
    for (const e of ex) {
      const s = byName.get(e.name) ?? { pmc: false, scav: false }
      if (e.faction !== 'scav') s.pmc = true
      if (e.faction !== 'pmc') s.scav = true
      byName.set(e.name, s)
    }
    const all = [...byName.entries()]
    const pmc = all.filter(([, s]) => s.pmc)
    const scavOnly = all.filter(([, s]) => !s.pmc)
    return {
      text: `${contextMap.name} has ${pmc.length} PMC extract${pmc.length === 1 ? '' : 's'}${scavOnly.length ? ` and ${scavOnly.length} scav-only` : ''}.`,
      lines: [...pmc.map(([n, s]) => `${n}${s.scav ? ' (PMC and scav)' : ''}`), ...scavOnly.map(([n]) => `${n} (scav only)`)],
      map: { map: contextMap, points: ex.map((e) => ({ id: e.id, position: e.position, label: e.name, kind: 'extract' as const })), route: null },
      mapId: contextMap.id,
    }
  }

  // 3. "Where is Crackhouse?"
  if (places.length && /\b(where|wheres|show|find|locate|location)\b/.test(said)) {
    if (namedMap && !places.some((p) => p.mapKey === labelKey(namedMap.normalizedName))) {
      const on = [...new Set(places.map((p) => mapByLabelKey(ctx, p.mapKey, null)?.name ?? p.mapKey))]
      return { text: `There is no ${places[0].name} on ${namedMap.name}. It is on ${on.join(' and ')}.` }
    }
    const { place, ambiguous } = pickPlace(places, contextMap)
    if (ambiguous.length) {
      return { text: `There is a ${ambiguous[0].name} on ${[...new Set(ambiguous.map((p) => mapByLabelKey(ctx, p.mapKey, null)?.name ?? p.mapKey))].join(' and ')}. Ask again with the map, like "${ambiguous[0].name} on ${mapByLabelKey(ctx, ambiguous[0].mapKey, null)?.name ?? ''}".` }
    }
    if (place) {
      const map = mapByLabelKey(ctx, place.mapKey, contextMap)
      if (map) return { text: `${place.name} is on ${map.name}. Here it is.`, map: { map, points: [{ id: 'place', position: place.position, label: place.name, kind: 'place' }], route: null }, mapId: map.id }
    }
  }

  // 4. Quests on a map.
  if (/\b(quests|tasks|quest|task)\b/.test(said) && namedMap && !findNames(q, index.quests).length) {
    const here = ctx.tasksOnMap(namedMap).filter((m) => ctx.statuses[m.task.id] === 'available')
    if (!here.length) return { text: `You have no available quests on ${namedMap.name}.`, mapId: namedMap.id }
    return {
      text: `You have ${here.length} available quest${here.length === 1 ? '' : 's'} on ${namedMap.name}.`,
      lines: here.map((m) => questLine(m.task, ctx)),
      links: [{ label: `Open ${namedMap.name} on the map`, to: '/maps' }],
      mapId: namedMap.id,
    }
  }

  // 5. My progress.
  if (/\b(my progress|my level|how many quests|kappa progress|progress)\b/.test(said)) {
    const done = ctx.tasks.filter((t) => ctx.statuses[t.id] === 'completed').length
    const kappa = ctx.tasks.filter((t) => t.kappaRequired)
    const kappaDone = kappa.filter((t) => ctx.statuses[t.id] === 'completed').length
    const available = ctx.tasks.filter((t) => ctx.statuses[t.id] === 'available').length
    return {
      text: `You are level ${ctx.playerLevel} with ${done} of ${ctx.tasks.length} quests done and ${available} available right now.`,
      lines: [`Kappa: ${kappaDone} of ${kappa.length} required quests done (the data marks only ${kappa.length} as required).`],
    }
  }

  // 6. A quest by name: things to do with it, else what it needs.
  const questHit = findNames(q, index.quests)[0]
  if (questHit && questHit.len >= 5) {
    const t = questHit.value
    const done = ctx.statuses[t.id] === 'completed'
    if (/\b(untick|unmark|uncomplete|not done|not finished|undo)\b/.test(said)) {
      return done
        ? { text: `Mark ${t.name} as not done?`, actions: [{ kind: 'complete', taskId: t.id, done: false, label: `Mark ${t.name} not done` }] }
        : { text: `${t.name} is not marked done.` }
    }
    if (/\b(mark|tick|finished|completed|complete|did|done|handed in|hand in|turned in)\b/.test(said)) {
      return done
        ? { text: `${t.name} is already marked done.` }
        : { text: `Mark ${t.name} as done?`, lines: t.taskRequirements.length ? ['Quests it needs first are not changed.'] : undefined, actions: [{ kind: 'complete', taskId: t.id, done: true, label: `Mark ${t.name} done` }] }
    }
    if (/\b(show|track|add|put|pin)\b/.test(said) && /\bmap\b/.test(said)) {
      if (!t.map) return { text: `${t.name} has no single map in the data, so it cannot be shown on one map.` }
      return { text: `Show ${t.name} on the ${t.map.name} map?`, actions: [{ kind: 'showOnMap', taskId: t.id, mapKey: t.map.normalizedName, label: `Show on the ${t.map.name} map` }] }
    }
  }

  // 7. "Build me an M4": open the gun in the Weapon builder.
  if (/\bbuild\b/.test(said)) {
    if (!index.items) return { text: 'Loading the item list…', needsItems: true }
    const gun = findWeapon(q.slice(q.indexOf('build') + 1), ctx)
    if (gun.best) {
      return {
        text: `Open the ${gun.best.shortName} in the Weapon builder?`,
        lines: gun.others.length ? [`Did you mean another one? ${gun.others.map((o) => o.shortName).join(', ')}`] : undefined,
        actions: [{ kind: 'openWeapon', itemId: gun.best.id, label: `Build the ${gun.best.shortName}` }, ...gun.others.slice(0, 3).map((o) => ({ kind: 'openWeapon' as const, itemId: o.id, label: o.shortName }))],
      }
    }
    if (q.length > 1) return { text: 'I could not find that weapon. Try its short name, like "build an AK-74N" or "build an M4".' }
  }

  if (questHit && questHit.len >= 5) return questInfo(questHit.value, ctx)

  // 8. An item named on its own ("LEDX", "dorm 303 key").
  if (ctx.items) {
    const hit = findItem(expandNicknames(q.filter((_, i) => !mapWords.has(i))), ctx.items)
    if (hit) return { ...infoAnswer(hit, ctx), weak: true }
    const itemHit = index.items ? findNames(q, index.items, 6).filter((h) => h.len >= 3)[0] : undefined
    if (itemHit) return { ...infoAnswer({ item: itemHit.value, others: [] }, ctx), weak: true }
  } else if (/\b(item|open|opens)\b/.test(said)) {
    return { text: 'Loading the item list…', needsItems: true }
  }

  if (places.length) {
    const { place } = pickPlace(places, contextMap)
    const map = place ? mapByLabelKey(ctx, place.mapKey, contextMap) : undefined
    if (place && map) return { text: `${place.name} is on ${map.name}. Say "I'm at ${place.name}" and I'll find the closest quest.`, map: { map, points: [{ id: 'place', position: place.position, label: place.name, kind: 'place' }], route: null }, mapId: map.id }
  }
  if (namedMap) return { text: `What about ${namedMap.name}? Try "quests on ${namedMap.name}" or "extracts on ${namedMap.name}".`, mapId: namedMap.id, weak: true }
  return { text: 'Sorry, I did not get that.', lines: HELP.lines }
}

/** A gun by (short) name: exact first, else names that start with what was said ("M4" -> M4A1). */
function findWeapon(said: string[], ctx: AssistantContext): { best: Item | null; others: Item[] } {
  const want = compact(said.filter((w) => !['me', 'a', 'an', 'the', 'my', 'gun', 'weapon', 'build', 'for'].includes(w)).join(' '))
  if (want.length < 2 || !ctx.items) return { best: null, others: [] }
  const guns = Object.values(ctx.items).filter((it) => it.weapon)
  const scored = guns
    .map((it) => {
      const s = compact(it.shortName)
      const n = compact(it.name)
      const score = s === want ? 0 : n === want ? 1 : s.startsWith(want) ? 2 + s.length - want.length : n.includes(want) ? 20 + n.length / 100 : Infinity
      return { it, score }
    })
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => a.score - b.score || a.it.shortName.length - b.it.shortName.length)
  return { best: scored[0]?.it ?? null, others: scored.slice(1, 4).map((x) => x.it) }
}

/** Routes: where to (after the last "to") and where from (before it, or where the player last said they were). */
/** Is the question about the best / safest way (not just a way)? The data cannot say what is safe. */
const SAFEST_NOTE = 'This is the shortest walking route on the map drawing. The data has nothing on cover, sight lines or where players fight, so a "safest" route cannot be worked out honestly.'

function route(q: string[], hits: { value: Place; start: number; end: number }[], contextMap: GameMap | null, ctx: AssistantContext, index: Index): Reply | null {
  const said = ` ${q.join(' ')} `
  // A quest to do ("path for Delivery from the Past"): its name may contain "from", so it is found first.
  const questHit = findNames(q, index.quests).find((h) => h.len >= 5 && q.slice(0, h.start).some((w) => w === 'to' || w === 'for' || w === 'route' || w === 'path' || w === 'do'))
  const inQuest = (i: number) => !!questHit && i >= questHit.start && i <= questHit.end
  const lastIdx = (w: string) => q.reduce((at, x, i) => (x === w && !inQuest(i) ? i : at), -1)
  const toIdx = lastIdx('to')
  // "… to Dorms from Crossroads": the start comes after "from", the destination between "to" and "from".
  const fromIdx = lastIdx('from')
  const destEnd = fromIdx > toIdx ? fromIdx : q.length
  const placeHits = hits.filter((h) => !inQuest(h.start))
  const after = placeHits.filter((h) => h.start > toIdx && h.start < destEnd)
  const before = placeHits.filter((h) => h.start < toIdx || (fromIdx > toIdx && h.start > fromIdx))
  const toExtract = /\b(extract|extracts|extraction|exfil|leave|get out)\b/.test(said)
  const side = parseSide(q)
  const best = /\b(best|safest|safe|safer|quietest)\b/.test(said)
  const quest = questHit?.value
  const placeTargets = (quest ? [] : after).map((h) => h.value)
  if (!quest && !placeTargets.length && !toExtract) return null

  // The map: the quest's, the place's (shared with the start if one was named), else the one talked about.
  let origins = before.map((h) => h.value)
  let map: GameMap | undefined
  if (quest) map = quest.map ?? contextMap ?? undefined
  else if (placeTargets.length) {
    const keys = [...new Set((origins.length ? origins : placeTargets).map((p) => p.mapKey))]
    const preferred = contextMap ? labelKey(contextMap.normalizedName) : null
    const shared = keys.filter((k) => placeTargets.some((t) => t.mapKey === k))
    const mapKey = preferred && shared.includes(preferred) ? preferred : shared[0]
    if (!mapKey) return { text: `${origins[0].name} and ${placeTargets[0].name} are not on the same map.` }
    map = mapByLabelKey(ctx, mapKey, contextMap)
  } else map = (origins[0] && mapByLabelKey(ctx, origins[0].mapKey, contextMap)) ?? contextMap ?? (ctx.lastPlace ? mapByLabelKey(ctx, ctx.lastPlace.mapKey, null) : undefined)
  if (!map) return { text: quest ? `${quest.name} has no single map in the data. Which map?` : 'Which map? Say it in the question, like "path to the closest extract on Customs".', quiet: !quest }
  const key = labelKey(map.normalizedName)
  origins = origins.filter((p) => p.mapKey === key)

  // The stops.
  type Stop = { position: Position; label: string; kind: MapPoint['kind'] }
  let stops: Stop[] = []
  if (quest) {
    const mt = ctx.tasksOnMap(map).find((m) => m.task.id === quest.id)
    const objectives = (mt?.objectives ?? []).filter((o) => !o.anywhere && o.placements.length)
    if (!objectives.length) return { text: `${quest.name} has no spots on ${map.name} in the data.` }
    stops = objectives.map((o) => ({ position: o.placements[0].position, label: o.objective.description, kind: 'quest' as const }))
  } else {
    const target = placeTargets.find((p) => p.mapKey === key)
    if (target) stops = [{ position: target.position, label: target.name, kind: target.kind === 'extract' ? 'extract' : 'place' }]
  }
  const firstAim = stops[0]?.position ?? origins[0]?.position ?? ctx.lastPlace?.position

  // Where it starts: a named place, a side of the map, where the player said they are, else the closest PMC spawn.
  const spawns = pmcSpawns(ctx.data.mapDetails[map.id])
  let start: { position: Position; name: string; place?: Place } | null = null
  const notes: string[] = []
  if (origins.length) start = { position: origins[0].position, name: origins[0].name, place: origins[0] }
  else if (side) {
    const p = firstAim ? spawnOnSide(spawns, side, firstAim, (a, b) => ctx.heading(map, a, b)) : null
    if (!p) return { text: `The data has no PMC spawn on the ${side} side of ${map.name}.` }
    start = { position: p, name: `the ${side} spawn` }
    notes.push(`Starts at the PMC spawn on the ${side} side closest to where you are going.`)
  } else if (ctx.lastPlace && ctx.lastPlace.mapKey === key) start = { position: ctx.lastPlace.position, name: ctx.lastPlace.name, place: ctx.lastPlace }
  else if (firstAim) {
    const p = closestTo(spawns, firstAim)
    if (!p) return { text: `Where do you start? Say a place or a side, like "from Crossroads" or "from the west side".`, quiet: true }
    start = { position: p, name: 'the closest PMC spawn' }
    notes.push('You did not say where you start, so this starts at the PMC spawn closest to the first stop. Say "from Crossroads" or "from the west side" for another start.')
  }
  if (!start) return { text: 'Where do you start? Say a place or a side, like "from Crossroads" or "from the west side".', quiet: true }

  // Quest stops in a short order from the start (one spot per objective; some have several possible spots).
  if (quest) {
    const mt = ctx.tasksOnMap(map).find((m) => m.task.id === quest.id)!
    const objectives = mt.objectives.filter((o) => !o.anywhere && o.placements.length)
    stops = orderStops(start.position, objectives.map((o) => ({ item: o, spots: o.placements.map((p) => p.position) }))).map((s, i) => ({
      position: s.position,
      label: `${i + 1}. ${s.item.objective.optional ? '(optional) ' : ''}${s.item.objective.description}`,
      kind: 'quest' as const,
    }))
  }
  // Ending at an extract: the closest PMC one to the last stop (or to the start, when it is the only goal).
  if (toExtract && !(stops.length && stops[stops.length - 1].kind === 'extract')) {
    const from = stops.length ? stops[stops.length - 1].position : start.position
    const ex = (ctx.data.mapDetails[map.id]?.extracts ?? []).filter((e) => e.faction !== 'scav')
    const out = ex.length ? ex.reduce((a, b) => (dist(a.position, from) <= dist(b.position, from) ? a : b)) : null
    if (out) stops.push({ position: out.position, label: `${out.name} (extract)`, kind: 'extract' })
    else notes.push(`The data has no PMC extracts for ${map.name}.`)
  }
  if (!stops.length) return null
  if (best) notes.push(SAFEST_NOTE)
  const last = stops[stops.length - 1]
  const lastName = last.label.replace(/^\d+\. /, '')
  return {
    text: quest
      ? `${quest.name} on ${map.name}: ${stops.filter((s) => s.kind === 'quest').length} stop${stops.filter((s) => s.kind === 'quest').length === 1 ? '' : 's'}${last.kind === 'extract' ? `, then out at ${lastName.replace(/ \(extract\)$/, '')}` : ''}, from ${start.name}.`
      : `From ${start.name} to ${lastName}.`,
    lines: [...(stops.length > 1 ? stops.map((s) => s.label) : []), ...notes],
    map: {
      map,
      points: [{ id: 'you', position: start.position, label: `You: ${start.name}`, kind: 'you' }, ...stops.map((s, i) => ({ id: `stop${i}`, position: s.position, label: s.label, kind: s.kind }))],
      route: [start.position, ...stops.map((s) => s.position)],
    },
    walk: { fromName: start.name.replace(/^the /, 'The '), toName: lastName },
    youAt: start.place,
    mapId: map.id,
  }
}

function exampleFor(map: GameMap): string {
  const key = labelKey(map.normalizedName)
  return placeEntries().find((e) => e.value.mapKey === key)?.value.name ?? 'a building'
}

/** Closest spot of an available quest to a named place, with a line to it. */
function nearestQuest(place: Place, map: GameMap, ctx: AssistantContext): Reply {
  const options: { mt: MapTask; position: Position; text: string; m: number }[] = []
  const anywhere: string[] = []
  for (const mt of ctx.tasksOnMap(map)) {
    if (ctx.statuses[mt.task.id] !== 'available') continue
    for (const o of mt.objectives) {
      for (const p of o.placements) options.push({ mt, position: p.position, text: o.objective.description, m: dist(place.position, p.position) })
      if (o.anywhere && !anywhere.includes(mt.task.name)) anywhere.push(mt.task.name)
    }
  }
  if (!options.length) {
    return {
      text: anywhere.length ? `None of your available quests on ${map.name} has a fixed spot. These can be done anywhere on the map:` : `You have no available quests with a spot on ${map.name}.`,
      lines: anywhere,
      map: { map, points: [{ id: 'you', position: place.position, label: `You: ${place.name}`, kind: 'you' }], route: null },
      mapId: map.id,
    }
  }
  options.sort((a, b) => a.m - b.m)
  const best = options[0]
  const dir = best.m < 15 ? null : ctx.heading(map, place.position, best.position)
  const near = nearestPlace(labelKey(map.normalizedName), best.position)
  const nearText = near && near.place.name !== place.name ? `, near ${near.place.name}` : ''
  const others = options.filter((o) => o.mt.task.id !== best.mt.task.id).filter((o, i, all) => all.findIndex((x) => x.mt.task.id === o.mt.task.id) === i).slice(0, 3)
  return {
    text: `Closest from ${place.name}: ${best.mt.task.name}, ${sayDistance(best.m)}${dir ? ` ${dir}` : ''}${nearText}.`,
    lines: [
      `Objective: ${best.text}`,
      ...others.map((o) => `Next: ${o.mt.task.name}, ${sayDistance(o.m)}`),
      ...(anywhere.length ? [`Anywhere on the map: ${anywhere.slice(0, 4).join(', ')}${anywhere.length > 4 ? '…' : ''}`] : []),
      STRAIGHT_NOTE,
    ],
    map: {
      map,
      points: [
        { id: 'you', position: place.position, label: `You: ${place.name}`, kind: 'you' },
        { id: 'quest', position: best.position, label: best.mt.task.name, kind: 'quest' },
      ],
      route: [place.position, best.position],
    },
    links: [{ label: `${best.mt.task.name} in Quests`, to: `/quests?q=${encodeURIComponent(best.mt.task.name)}` }],
    mapId: map.id,
  }
}

/** A quest part the game data does not have ("Signal part 1"), when other parts of it exist. */
function missingQuestPart(q: string[], quests: NameEntry<Task>[]): Reply | null {
  const at = q.indexOf('part')
  const n = q[at + 1]
  if (at < 1 || !n || !/^\d+$/.test(n)) return null
  const base = q.slice(0, at).filter((w) => !['show', 'me', 'the', 'quest', 'task', 'what', 'is', 'about', 'how', 'do', 'i', 'open', 'tell'].includes(w))
  if (!base.length) return null
  const stem = `${base.join('')}part`
  const parts = quests.filter((e) => e.key.startsWith(stem)).map((e) => e.value)
  if (!parts.length || parts.some((t) => compact(t.name) === `${stem}${n}`)) return null
  const name = parts[0].name.replace(/\d+\s*$/, n)
  return { text: `There is no ${name} in the game data, sir. It has ${parts.map((t) => t.name).join(' and ')}.`, lines: ['tarkov.dev lists every quest the game has right now; older parts that were removed or renamed are not in it.'] }
}

function questInfo(t: Task, ctx: AssistantContext): Reply {
  const status = ctx.statuses[t.id] ?? 'locked'
  const objectives = t.objectives.map((o) => `${o.optional ? '(optional) ' : ''}${o.description}`)
  const prereq = t.taskRequirements.map((r) => ctx.data.tasksById[r.taskId]?.name).filter(Boolean)
  let map: MapCard | undefined
  if (t.map) {
    const spots = ctx.tasksOnMap(t.map).find((m) => m.task.id === t.id)?.placements ?? []
    if (spots.length) map = { map: t.map, points: spots.slice(0, 12).map((p, i) => ({ id: `q${i}`, position: p.position, label: t.name, kind: 'quest' as const })), route: null }
  }
  return {
    text: `${t.name} is from ${t.trader.name}${t.map ? ` on ${t.map.name}` : ''}. It is ${STATUS_WORD[status]} for you${t.minPlayerLevel > 0 ? ` and needs level ${t.minPlayerLevel}` : ''}.`,
    lines: [...objectives, ...(prereq.length ? [`Needs first: ${prereq.join(', ')}`] : []), ...(t.kappaRequired ? ['Required for Kappa.'] : [])],
    map,
    links: [{ label: 'Open in Quests', to: `/quests?q=${encodeURIComponent(t.name)}` }],
    mapId: t.map?.id,
  }
}

