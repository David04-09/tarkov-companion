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

export interface MapPoint {
  id: string
  position: Position
  label: string
  kind: 'you' | 'quest' | 'place' | 'extract'
}

export interface MapCard {
  map: GameMap
  points: MapPoint[]
  /** A straight line from the first to the second spot; with `walk` the page replaces it by a route over the terrain. */
  route: [Position, Position] | null
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
  /** Things the assistant offers to do; each is a button and runs only when clicked. */
  actions?: AssistantAction[]
}

export type AssistantAction =
  | { kind: 'complete'; taskId: string; done: boolean; label: string }
  | { kind: 'showOnMap'; taskId: string; mapKey: string; label: string }
  | { kind: 'openMap'; mapKey: string; label: string }
  | { kind: 'openWeapon'; itemId: string; label: string }
  | { kind: 'routeOnMap'; mapKey: string; path: Position[]; fromLabel: string; toLabel: string; label: string }

export interface AssistantContext {
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
}

interface Index {
  maps: NameEntry<GameMap>[]
  places: NameEntry<Place>[]
  quests: NameEntry<Task>[]
  items: NameEntry<Item>[] | null
}

let cached: { data: GameData; items: ItemsById | undefined; tasks: Task[]; index: Index } | null = null

/** Name lists, built once per data load (not per question). */
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
  ],
}

/** Answers one question. Pure: everything it needs comes in `ctx`. */
export function answer(question: string, ctx: AssistantContext): Reply {
  const q = words(question)
  const said = ` ${q.join(' ')} `
  if (!q.length) return HELP
  if (/^ (help|hi|hello|hey|what can you do)\b/.test(said)) return HELP

  const index = indexFor(ctx)
  const mapHits = findNames(q, index.maps)
  const namedMap = mapHits[0]?.value ?? null
  const lastMap = ctx.data.maps.find((m) => m.id === ctx.lastMapId) ?? null
  const contextMap = namedMap ?? lastMap
  // Map names are not places too ("Customs" the map, not a label called Customs).
  const mapWords = new Set(mapHits.flatMap((h) => Array.from({ length: h.end - h.start + 1 }, (_, i) => h.start + i)))
  const placeHits = findNames(q, index.places).filter((h) => !mapWords.has(h.start))
  const places = placeHits.map((h) => h.value)

  const wantsNearest = /\b(closest|nearest|next|near me|close by|nearby)\b/.test(said) && /\b(quest|quests|task|tasks|objective|objectives|mission)\b/.test(said)
  const saysWhereIAm = /\b(i m|im|i am|iam|standing|currently)\b.*\b(at|in|near|by|on|inside|around)\b/.test(said)
  const wantsRoute = /\b(get to|go to|route|path|way to|take me|guide me|walk to|head to|directions|navigate|get from|run to)\b/.test(said) || /\bfrom\b.*\bto\b/.test(said)

  // 0. "I spawned at Crossroads, how do I get to Dorms?" — a walking route over the terrain.
  if (wantsRoute && !wantsNearest) {
    const routed = route(q, placeHits, contextMap, ctx, index)
    if (routed) return routed
  }

  // 1. "I'm at Dorms, what's the next closest task?"
  if (wantsNearest || (saysWhereIAm && places.length)) {
    const { place, ambiguous } = pickPlace(places, contextMap)
    if (ambiguous.length) return { text: `${ambiguous[0].name} is on more than one map. Which one?`, lines: [...new Set(ambiguous.map((p) => mapByLabelKey(ctx, p.mapKey, null)?.name ?? p.mapKey))] }
    if (!place) return { text: contextMap ? `Where on ${contextMap.name} are you? Name a place, like ${exampleFor(contextMap)}.` : 'Where are you? Name a place and the map, like "I\'m at Dorms on Customs".' }
    const map = mapByLabelKey(ctx, place.mapKey, contextMap)
    if (!map) return { text: `I know ${place.name}, but not which map it belongs to.` }
    return { ...nearestQuest(place, map, ctx), youAt: place }
  }

  // 2. Extracts on a map.
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

  // 7. An item by name (the item list is large, so it loads only when a question needs it).
  if (index.items) {
    const itemHit = findNames(q, index.items, 6).filter((h) => h.len >= 3)[0]
    if (itemHit) return itemInfo(itemHit.value, ctx)
  } else if (/\b(item|price|worth|cost|sell|buy|for|need|needed|key|open|opens)\b/.test(said)) {
    return { text: 'Loading the item list…', needsItems: true }
  }

  if (places.length) {
    const { place } = pickPlace(places, contextMap)
    const map = place ? mapByLabelKey(ctx, place.mapKey, contextMap) : undefined
    if (place && map) return { text: `${place.name} is on ${map.name}. Say "I'm at ${place.name}" and I'll find the closest quest.`, map: { map, points: [{ id: 'place', position: place.position, label: place.name, kind: 'place' }], route: null }, mapId: map.id }
  }
  if (namedMap) return { text: `What about ${namedMap.name}? Try "quests on ${namedMap.name}" or "extracts on ${namedMap.name}".`, mapId: namedMap.id }
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
function route(q: string[], hits: { value: Place; start: number }[], contextMap: GameMap | null, ctx: AssistantContext, index: Index): Reply | null {
  const toIdx = q.lastIndexOf('to')
  // "… to Dorms from Crossroads": the start comes after "from", the destination between "to" and "from".
  const fromIdx = q.lastIndexOf('from')
  const destEnd = fromIdx > toIdx ? fromIdx : q.length
  const after = hits.filter((h) => h.start > toIdx && h.start < destEnd)
  const before = hits.filter((h) => h.start < toIdx || (fromIdx > toIdx && h.start > fromIdx))
  const questHit = toIdx >= 0 ? findNames(q.slice(toIdx + 1, destEnd), index.quests)[0] : undefined
  if (!after.length && !questHit) return null
  let origins = before.map((h) => h.value)
  if (!origins.length && ctx.lastPlace) origins = [ctx.lastPlace]
  if (!origins.length) {
    const to = after[0]?.value.name ?? questHit?.value.name
    return { text: `Where are you now? Say for example "I spawned at Crossroads, how do I get to ${to}?"` }
  }
  const targets = after.map((h) => h.value)
  // Both ends on one map: the map named or talked about, else any map they share.
  const keys = [...new Set(origins.map((p) => p.mapKey))]
  const preferred = contextMap ? labelKey(contextMap.normalizedName) : null
  const shared = keys.filter((k) => !targets.length || targets.some((t) => t.mapKey === k))
  const mapKey = preferred && shared.includes(preferred) ? preferred : shared[0]
  if (!mapKey) return { text: `${origins[0].name} and ${targets[0].name} are not on the same map.` }
  const map = mapByLabelKey(ctx, mapKey, contextMap)
  if (!map) return null
  const from = origins.find((p) => p.mapKey === mapKey) as Place
  let to = targets.find((p) => p.mapKey === mapKey)
  let kind: MapPoint['kind'] = to?.kind === 'extract' ? 'extract' : 'place'
  if (!to && questHit) {
    const spots = ctx.tasksOnMap(map).find((m) => m.task.id === questHit.value.id)?.placements ?? []
    if (!spots.length) return { text: `${questHit.value.name} has no spot on ${map.name} in the data.` }
    const best = spots.reduce((a, b) => (dist(a.position, from.position) <= dist(b.position, from.position) ? a : b))
    to = { mapKey, name: questHit.value.name, position: best.position }
    kind = 'quest'
  }
  if (!to) return null
  return {
    text: `From ${from.name} to ${to.name}.`,
    map: {
      map,
      points: [
        { id: 'you', position: from.position, label: `You: ${from.name}`, kind: 'you' },
        { id: 'target', position: to.position, label: to.name, kind },
      ],
      route: [from.position, to.position],
    },
    walk: { fromName: from.name, toName: to.name },
    youAt: from,
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

function itemInfo(it: Item, ctx: AssistantContext): Reply {
  const quests = ctx.tasks.filter((t) => ctx.statuses[t.id] !== 'completed' && t.objectives.some((o) => o.itemIds.includes(it.id) && /give|hand|find/i.test(o.type)))
  const keyQuests = ctx.tasks.filter((t) => ctx.statuses[t.id] !== 'completed' && t.objectives.some((o) => o.requiredKeys.some((alt) => alt.includes(it.id))))
  const locks = ctx.data.maps.flatMap((m) => ((ctx.data.mapDetails[m.id]?.locks ?? []).some((l) => l.keyId === it.id) ? [m.name] : []))
  const price = it.avg24hPrice ?? it.lastLowPrice
  const lines: string[] = []
  if (quests.length) lines.push(`Still needed for: ${quests.map((t) => t.name).join(', ')}`)
  if (keyQuests.length) lines.push(`Key for quests: ${keyQuests.map((t) => t.name).join(', ')}`)
  if (locks.length) lines.push(`Opens locks on: ${[...new Set(locks)].join(', ')}`)
  if (price) lines.push(`Flea: about ${price.toLocaleString()} ₽ (24 h average)`)
  else lines.push('No flea price in the data (it may not be sellable on the flea).')
  const uses = quests.length + keyQuests.length
  return {
    text: uses ? `${it.name}: you still need it for ${uses} quest${uses === 1 ? '' : 's'}.` : `${it.name}: none of your open quests need it.`,
    lines,
    links: locks.length ? [{ label: 'Open in Keys', to: '/keys' }] : [],
  }
}
