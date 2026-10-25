/**
 * Quests the EFT Wiki has but tarkov.dev's game data does not (new quests it has not picked up yet,
 * current event and Seasonal-mode quests, Arena quests, and past/removed ones), read from the
 * wiki pages (CC BY-SA) and turned into the app's Task shape so the Quests tab can list them.
 * They have no map positions and are never ticked from the game log (their game ids are unknown).
 *
 * Cost: the category lists (~4 small requests) plus the pages of the missing current quests in
 * batches of 50 (~120 pages, ~0.5 MB) once a day at most; past quests only when asked for.
 */
import type { GameData, GameMap, MapTransit, ObjectiveLocation, Position, Task, TaskObjective, Trader } from './types'
import { WIKI_QUEST_SPOTS, type WikiSpot } from './wikiQuestSpots'

const API = 'https://escapefromtarkov.fandom.com/api.php'
export const WIKI_PAGE = 'https://escapefromtarkov.fandom.com/wiki/'
const BATCH = 50
/** Part of the query keys: bump when parsing changes so cached pages are read again. */
export const WIKI_QUESTS_VERSION = 1

export type WikiQuestKind = 'regular' | 'event' | 'seasonal' | 'arena' | 'past'

export interface WikiQuestPage {
  title: string
  giver: string | null
  locations: string[]
  previous: string[]
  leadsTo: string[]
  kappa: boolean
  /** Infobox "LL requirement": loyalty level needed with the quest giver (0 = none given). */
  loyalty: number
  requirements: string[]
  objectives: string[]
  rewards: string[]
  kind: WikiQuestKind
}

export interface WikiQuestIndex {
  /** Every page in Category:Quests. */
  all: string[]
  historical: string[]
  event: string[]
}

/** Quest names compared across the wiki and tarkov.dev (quotes, "(quest)", "[PVE ZONE]", spacing). */
export function normQuestName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘'`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s*\(quest\)\s*$/i, '')
    .replace(/\s*\[pv[ep] zone\]\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Wiki markup to plain text: links, templates, bold/italic, html tags, entities. */
export function wikiText(s: string): string {
  return s
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[https?:[^\s\]]+\s+([^\]]+)\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'''?/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function infoField(text: string, name: string): string {
  const m = new RegExp(`\\|\\s*${name}\\s*=([^\\n]*)`, 'i').exec(text)
  return m ? m[1].trim() : ''
}

/** The [[links]] in a field, or its comma-separated plain parts when it has none. */
function fieldList(raw: string): string[] {
  const links = [...raw.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim())
  if (links.length) return links
  const plain = wikiText(raw)
  return plain ? plain.split(/,|\bor\b/).map((p) => p.trim()).filter(Boolean) : []
}

function section(text: string, name: string): string {
  const m = new RegExp(`\\n==\\s*${name}\\s*==\\s*\\n([\\s\\S]*?)(?=\\n==[^=]|$)`, 'i').exec(`\n${text}`)
  return m ? m[1] : ''
}

/** Top-level "* " bullets of a section ("** " sub-bullets are dropped: reward variants). */
function bullets(sec: string, keepSub = false): string[] {
  return sec
    .split('\n')
    .filter((l) => (keepSub ? /^\*+/.test(l) : /^\*(?!\*)/.test(l)))
    .map((l) => wikiText(l.replace(/^\*+\s*/, '')))
    .filter(Boolean)
}

export function parseWikiQuest(title: string, text: string, flags: { historical: boolean; event: boolean }): WikiQuestPage {
  const locations = fieldList(infoField(text, 'location'))
  const requirements = bullets(section(text, 'Requirements'))
  // Removed first: a past Arena quest is past, not a current Arena one.
  const kind: WikiQuestKind = flags.historical
    ? 'past'
    : locations.some((l) => /arena/i.test(l))
      ? 'arena'
      : requirements.some((r) => /seasonal/i.test(r))
        ? 'seasonal'
        : flags.event
          ? 'event'
          : 'regular'
  return {
    title,
    giver: fieldList(infoField(text, 'given by'))[0] ?? null,
    locations,
    previous: fieldList(infoField(text, 'previous')),
    leadsTo: fieldList(infoField(text, 'leads to')),
    kappa: /yes/i.test(wikiText(infoField(text, 'reqkappa'))),
    loyalty: Number(/^\d+$/.exec(wikiText(infoField(text, 'LL requirement')))?.[0] ?? 0),
    requirements,
    objectives: bullets(section(text, 'Objectives'), true),
    rewards: bullets(section(text, 'Rewards')),
    kind,
  }
}

async function api(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const r = await fetch(`${API}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`, { signal })
  if (!r.ok) throw new Error(`EFT Wiki: HTTP ${r.status}`)
  return r.json()
}

async function members(category: string, signal?: AbortSignal): Promise<string[]> {
  const out: string[] = []
  let cont: Record<string, string> | null = {}
  while (cont) {
    const j = (await api({ action: 'query', list: 'categorymembers', cmtitle: category, cmlimit: '500', cmtype: 'page', ...cont }, signal)) as {
      query?: { categorymembers?: { title: string }[] }
      continue?: Record<string, string>
    }
    out.push(...(j.query?.categorymembers ?? []).map((m) => m.title))
    cont = j.continue ?? null
  }
  return out
}

export async function fetchWikiQuestIndex(signal?: AbortSignal): Promise<WikiQuestIndex> {
  const [all, historical, event] = await Promise.all([members('Category:Quests', signal), members('Category:Historical content', signal), members('Category:Event content', signal)])
  return { all: all.filter((t) => t !== 'Quests'), historical, event }
}

export async function fetchWikiQuestPages(titles: string[], index: WikiQuestIndex, signal?: AbortSignal): Promise<WikiQuestPage[]> {
  const historical = new Set(index.historical)
  const event = new Set(index.event)
  const out: WikiQuestPage[] = []
  for (let i = 0; i < titles.length; i += BATCH) {
    const j = (await api({ action: 'query', titles: titles.slice(i, i + BATCH).join('|'), prop: 'revisions', rvprop: 'content', rvslots: 'main' }, signal)) as {
      query?: { pages?: { title: string; revisions?: { slots?: { main?: { content?: string } } }[] }[] }
    }
    for (const p of j.query?.pages ?? []) {
      const text = p.revisions?.[0]?.slots?.main?.content
      if (text) out.push(parseWikiQuest(p.title, text, { historical: historical.has(p.title), event: event.has(p.title) }))
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title))
}

/** Wiki pages whose quest is not in this mode's game data. */
export function missingTitles(index: WikiQuestIndex, tasks: Pick<Task, 'name'>[], past: boolean): string[] {
  const known = new Set(tasks.map((t) => normQuestName(t.name)))
  const historical = new Set(index.historical)
  return index.all.filter((t) => !known.has(normQuestName(t)) && (past || !historical.has(t)))
}

export const wikiTaskId = (title: string) => `wiki:${title}`
export const isWikiTaskId = (id: string) => id.startsWith('wiki:')

export type GameModeName = 'regular' | 'pve'

/** False when the wiki says the quest belongs to the other mode ("Must be playing the PvP game mode"). */
export function questInMode(page: WikiQuestPage, mode: GameModeName): boolean {
  const pvpOnly = page.requirements.some((r) => /playing (?:in )?the pvp (?:game )?mode/i.test(r))
  const pveOnly = page.requirements.some((r) => /playing (?:in )?the pve (?:game )?mode/i.test(r))
  return mode === 'pve' ? !pvpOnly : !pveOnly
}

/** "Must be level 30 to start this quest (20 in the PvE mode)": the level for this mode, or 0. */
export function levelFor(requirements: string[], mode: GameModeName): number {
  for (const r of requirements) {
    const m = /\bbe level (\d+)/i.exec(r)
    if (!m) continue
    const pve = /\((\d+) in the pve mode\)/i.exec(r)
    return Number(mode === 'pve' && pve ? pve[1] : m[1])
  }
  return 0
}

function stubTrader(name: string): Trader {
  return { id: `wiki-trader:${name}`, name, normalizedName: name.toLowerCase().replace(/\s+/g, '-'), imageLink: null, currency: 'RUB', resetTime: null, maxLevel: 1, levels: [] }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const plainText = (s: string) => s.toLowerCase().replace(/[’‘`]/g, "'")

/** Night Factory and Ground Zero 21+ are the same places as their day / low-level maps. */
const MAP_TWINS: Record<string, string[]> = { factory: ['night-factory'], 'ground-zero': ['ground-zero-21', 'ground-zero-high'] }

/** A circle of `r` metres around a spot, for places only known to the building or area. */
function circle(s: WikiSpot): Position[] {
  return Array.from({ length: 12 }, (_, i) => ({ x: s.x + s.r! * Math.cos((i * Math.PI) / 6), y: s.y, z: s.z + s.r! * Math.sin((i * Math.PI) / 6) }))
}

/**
 * Where a wiki objective happens: the spots in WIKI_QUEST_SPOTS for that quest and objective,
 * else, from the game data, the transit ("Use the transit from Woods to Customs", "at the
 * Shoreline transit on Customs") or the named extract ("Extract … through the Armored Train",
 * "through the Nakatani Basement Stairs or Emercom Checkpoint exfil").
 */
export function objectiveLocations(title: string, text: string, maps: GameMap[], data: Pick<GameData, 'maps' | 'mapDetails'>): ObjectiveLocation[] {
  const t = plainText(text)
  const out: ObjectiveLocation[] = []
  for (const entry of WIKI_QUEST_SPOTS) {
    if (normQuestName(entry.quest) !== normQuestName(title) || !t.includes(entry.objective)) continue
    const keys = [entry.map, ...(MAP_TWINS[entry.map] ?? [])]
    for (const m of data.maps.filter((x) => keys.includes(x.normalizedName))) {
      for (const s of entry.spots) out.push({ mapId: m.id, positions: [{ x: s.x, y: s.y, z: s.z }], outline: s.r ? circle(s) : null, zoneId: null })
    }
  }
  if (out.length) return out

  const mapNamed = (name: string) => data.maps.find((m) => m.name.toLowerCase() === name.trim().toLowerCase() && !/night/i.test(m.normalizedName))
  // By target map, else by its name ("Transit to The Lab" may point at a variant of the map).
  const transitTo = (from: GameMap, to: GameMap) =>
    data.mapDetails[from.id]?.transits.find((tr) => tr.targetMapId === to.id) ?? data.mapDetails[from.id]?.transits.find((tr) => tr.name.toLowerCase() === `transit to ${to.name.toLowerCase()}`)
  const transitLoc = (from: GameMap, tr: MapTransit): ObjectiveLocation => ({ mapId: from.id, positions: [tr.position], outline: tr.outline.length > 2 ? tr.outline : null, zoneId: null })
  const use = /transit from (.+?) to (.+?)(?:\s*\(|$)/i.exec(text)
  if (use) {
    const from = mapNamed(use[1])
    const to = mapNamed(use[2])
    const tr = from && to ? transitTo(from, to) : undefined
    return from && tr ? [transitLoc(from, tr)] : []
  }
  // "at the Shoreline transit on Customs", "Locate the transit to The Lab on Factory"
  const at = /at the (.+?) transit on (.+?)(?:\s*\(|$)/i.exec(text) ?? /\btransit to (.+?) on (.+?)(?:\s*\(|$)/i.exec(text)
  if (at) {
    const from = mapNamed(at[2])
    const to = mapNamed(at[1])
    const tr = from && to ? transitTo(from, to) : undefined
    return from && tr ? [transitLoc(from, tr)] : []
  }
  const through = /\bextract\b.*?\bthrough the (.+)$/i.exec(text)
  if (through) {
    const names = through[1]
      .split(/\s+(?:while|in one raid)\b|\s*\(|\s+(?:exfil|extraction)\b/i)[0]
      .split(/\s+or\s+/i)
      .map((n) => n.trim().toLowerCase())
    for (const m of maps) {
      const seen = new Set<string>()
      for (const e of data.mapDetails[m.id]?.extracts ?? []) {
        if (!names.includes(e.name.toLowerCase()) || seen.has(e.name)) continue
        seen.add(e.name)
        out.push({ mapId: m.id, positions: [e.position], outline: e.outline.length > 2 ? e.outline : null, zoneId: null })
      }
    }
  }
  return out
}

/**
 * A wiki page as an app Task. Prerequisites point at the real task when tarkov.dev has one with
 * the same name, else at the other wiki quest; a previous step that is neither (a story chapter
 * such as Tour) stays a line of text. The trader is the real one when the names match.
 */
export function toWikiTask(page: WikiQuestPage, data: Pick<GameData, 'tasks' | 'traders' | 'maps' | 'mapDetails'>, wikiTitles: Set<string>, mode: GameModeName): Task {
  const realByName = new Map(data.tasks.map((t) => [normQuestName(t.name), t]))
  const wikiByName = new Map([...wikiTitles].map((t) => [normQuestName(t), t]))
  const mapByName = new Map(data.maps.filter((m) => !/night/i.test(m.normalizedName)).map((m) => [m.name.toLowerCase(), m]))
  const traderByName = new Map(data.traders.map((t) => [t.name.toLowerCase(), t]))
  const mapsIn = (s: string): GameMap[] => [...mapByName.entries()].filter(([n]) => new RegExp(`\\b${escapeRe(n)}\\b`, 'i').test(s)).map(([, m]) => m)
  const id = wikiTaskId(page.title)
  const arena = page.kind === 'arena'
  const trader = (page.giver && traderByName.get(page.giver.toLowerCase())) || stubTrader(page.giver ?? 'Unknown trader')
  const locMaps = page.locations.map((l) => mapByName.get(l.toLowerCase())).filter((m): m is GameMap => Boolean(m))
  const exp = page.rewards.map((r) => /^\+?\s*([\d,]+)\s*EXP\b/i.exec(r)).find(Boolean)

  const taskRequirements: Task['taskRequirements'] = []
  const unresolved: string[] = []
  for (const p of page.previous) {
    if (normQuestName(p) === normQuestName(page.title)) continue // a page naming itself (wiki slip)
    const taskId = realByName.get(normQuestName(p))?.id ?? (wikiByName.has(normQuestName(p)) ? wikiTaskId(wikiByName.get(normQuestName(p))!) : null)
    // "Must accept Prapor's quest Debut to obtain this quest": started is enough.
    const accept = page.requirements.some((r) => r.includes(p) && /\baccept|\bstart(?:ed)?\b/i.test(r) && !/complet/i.test(r))
    if (taskId) taskRequirements.push({ taskId, status: accept ? ['active'] : ['complete'] })
    else unresolved.push(`${accept ? 'Start' : 'Finish'} ${p} first`)
  }

  // "Must reach Loyalty Level 2 with Prapor", "Reach Loyalty Level 3 with Therapist, Skier … and Jaeger."
  const traderRequirements: Task['traderRequirements'] = []
  const loyaltyLines = new Set<string>()
  for (const r of page.requirements) {
    const m = /loyalty level (\d+) with (.+?)(?:\s+to\b|\.|$)/i.exec(r)
    if (!m) continue
    const found = m[2].split(/,|\band\b/).map((n) => traderByName.get(n.trim().toLowerCase())).filter((t): t is Trader => Boolean(t))
    if (!found.length) continue
    loyaltyLines.add(r)
    for (const t of found) traderRequirements.push({ traderId: t.id, type: 'level', compare: '>=', value: Number(m[1]) })
  }
  // Infobox "LL requirement = 2": loyalty with the quest giver.
  if (page.loyalty > 1 && !trader.id.startsWith('wiki-trader:') && !traderRequirements.some((r) => r.traderId === trader.id)) {
    traderRequirements.push({ traderId: trader.id, type: 'level', compare: '>=', value: page.loyalty })
  }

  const level = arena ? 0 : levelFor(page.requirements, mode)
  const otherRequirements = [
    ...unresolved,
    ...page.requirements.filter((r) => {
      if (loyaltyLines.has(r)) return false
      if (!arena && /\bbe level \d+/i.test(r)) return false
      // Plain "complete/accept quest X" lines are the prerequisites above.
      if (page.previous.some((p) => r.includes(p)) && /^(?:must )?(?:complete|finish|accept)\b/i.test(r)) return false
      return true
    }),
  ]

  const objectives: TaskObjective[] = page.objectives.map((text, i) => {
    const named = mapsIn(text)
    const locations = objectiveLocations(page.title, text, named.length ? named : locMaps, data)
    const maps = [...named]
    for (const l of locations) {
      const m = data.maps.find((x) => x.id === l.mapId)
      if (m && !maps.includes(m)) maps.push(m)
    }
    return { ...wikiObjective(`${id}#${i}`, text), maps, locations }
  })
  return {
    id,
    name: page.title.replace(/\s*\(quest\)\s*$/i, ''),
    normalizedName: normQuestName(page.title).replace(/[^a-z0-9]+/g, '-'),
    trader,
    map: locMaps.length === 1 ? locMaps[0] : null,
    minPlayerLevel: level,
    experience: exp ? Number(exp[1].replace(/,/g, '')) : 0,
    factionName: 'Any',
    kappaRequired: page.kappa,
    lightkeeperRequired: false,
    wikiLink: WIKI_PAGE + encodeURIComponent(page.title.replace(/ /g, '_')),
    taskImageLink: null,
    taskRequirements,
    otherRequirements,
    availableDelay: null,
    storyGates: [],
    dialogueTraderIds: [],
    objectives,
    neededKeys: [],
    traderRequirements,
    standing: [],
    wiki: { kind: page.kind, rewards: page.rewards, requirements: page.requirements, locations: page.locations },
  }
}

function wikiObjective(id: string, text: string): TaskObjective {
  return {
    id,
    type: 'wiki',
    description: text,
    optional: /\boptional\b/i.test(text),
    maps: [],
    count: null,
    itemIds: [],
    questItem: null,
    foundInRaid: /found in raid/i.test(text) ? true : null,
    targetNames: [],
    locations: [],
    requiredKeys: [],
    exitName: null,
    build: null,
    markerItemId: null,
    usingWeaponIds: [],
    wearingIds: [],
    usingWeaponModIds: [],
    shotType: null,
    bodyParts: [],
    distance: null,
    hours: null,
  }
}

/** The game data with the wiki-only quests added (Quests tab, maps). */
export function withWiki(data: GameData, wiki: Task[]): GameData {
  if (!wiki.length) return data
  const tasksById = { ...data.tasksById }
  for (const t of wiki) tasksById[t.id] ??= t
  return { ...data, tasks: [...data.tasks, ...wiki], tasksById }
}

/**
 * Marks on wiki quests ("wiki:Honest Review") that the game data now has under a real id, as
 * { wikiId: realId }. `tasks` should be the ones your faction can take (BEAR/USEC twins share names).
 */
export function wikiRenames(ids: Iterable<string>, tasks: Pick<Task, 'id' | 'name'>[]): Record<string, string> {
  const byName = new Map<string, string>()
  for (const t of tasks) if (!byName.has(normQuestName(t.name))) byName.set(normQuestName(t.name), t.id)
  const out: Record<string, string> = {}
  for (const id of ids) {
    if (!isWikiTaskId(id)) continue
    const real = byName.get(normQuestName(id.slice(5)))
    if (real) out[id] = real
  }
  return out
}

/** Short stable key for a list of titles (query keys). */
export function titlesKey(titles: string[]): string {
  let h = 5381
  for (const t of titles) for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0
  return `${titles.length}-${h.toString(36)}`
}
