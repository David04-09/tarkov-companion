import { assertCatalogSupports, getEndpointCatalog } from './catalog'
import { fetchJson, type GameMode } from './client'
import { fetchTranslated, type Translator } from './translate'
import type {
  FactionName,
  GameData,
  GameMap,
  Item,
  ItemsById,
  PricePoint,
  QuestItem,
  RawItemsData,
  RawMapsData,
  RawPriceHistoryDoc,
  RawStatusDoc,
  RawTask,
  RawTaskObjective,
  RawTasksData,
  RawTrader,
  Task,
  TaskObjective,
  Trader,
} from './types'

// ---------------------------------------------------------------------------
// Adapters: raw document + translator -> app-facing objects
// ---------------------------------------------------------------------------

function adaptTrader(raw: RawTrader, t: Translator): Trader {
  return {
    id: raw.id,
    name: t(raw.name, raw.normalizedName),
    normalizedName: raw.normalizedName,
    imageLink: raw.imageLink ?? null,
  }
}

function adaptMaps(data: RawMapsData, t: Translator): GameMap[] {
  return Object.values(data.maps).map((m) => ({
    id: m.id,
    name: t(m.name, m.normalizedName),
    normalizedName: m.normalizedName,
  }))
}

function adaptQuestItems(data: RawTasksData, t: Translator): Record<string, QuestItem> {
  const out: Record<string, QuestItem> = {}
  for (const q of Object.values(data.questItems ?? {})) {
    out[q.id] = {
      id: q.id,
      name: t(q.name, q.id),
      shortName: t(q.shortName, ''),
      iconLink: q.iconLink ?? null,
    }
  }
  return out
}

function adaptObjective(
  raw: RawTaskObjective,
  t: Translator,
  mapsById: Record<string, GameMap>,
  questItems: Record<string, QuestItem>,
): TaskObjective {
  const itemIds = raw.items && raw.items.length > 0 ? raw.items : raw.item ? [raw.item] : []
  return {
    id: raw.id,
    type: raw.type,
    description: t(raw.description, raw.type),
    optional: Boolean(raw.optional),
    maps: (raw.maps ?? []).map((id) => mapsById[id]).filter((m): m is GameMap => Boolean(m)),
    count: typeof raw.count === 'number' ? raw.count : null,
    itemIds,
    questItem: raw.questItem ? (questItems[raw.questItem] ?? null) : null,
    foundInRaid: typeof raw.foundInRaid === 'boolean' ? raw.foundInRaid : null,
    targetNames: (raw.targetNames ?? []).map((n) => t(n, n)),
  }
}

function toFaction(name: string): FactionName {
  return name === 'USEC' || name === 'BEAR' ? name : 'Any'
}

/** Turns trader/dialogue/story gates into short sentences for the detail panel. */
function describeOtherRequirements(raw: RawTask, tradersById: Record<string, Trader>): string[] {
  const traderName = (id: string) => tradersById[id]?.name ?? 'a trader'
  const out: string[] = []
  for (const r of raw.traderRequirements ?? []) {
    const cmp = r.compareMethod === '>=' ? '' : `${r.compareMethod} `
    if (r.requirementType === 'level') out.push(`${traderName(r.trader)} loyalty level ${cmp}${r.value}`)
    else if (r.requirementType === 'reputation') out.push(`${traderName(r.trader)} reputation ${cmp}${r.value}`)
    else out.push(`${traderName(r.trader)} ${r.requirementType} ${cmp}${r.value}`)
  }
  for (const r of raw.otherRequirements ?? []) {
    if (r.type === 'dialogue') {
      const names = (r.traders ?? []).map(traderName).join(', ')
      out.push(names ? `Talk to ${names}` : 'Trader dialogue')
    } else if (r.type === 'globalVariable') {
      out.push(`Story progression (stage ${r.compareMethod ?? '>='} ${r.value ?? '?'})`)
    } else {
      out.push(`Other: ${r.type}`)
    }
  }
  return out
}

function adaptTask(
  raw: RawTask,
  t: Translator,
  tradersById: Record<string, Trader>,
  mapsById: Record<string, GameMap>,
  questItems: Record<string, QuestItem>,
): Task {
  const trader = tradersById[raw.trader] ?? {
    id: raw.trader,
    name: 'Unknown trader',
    normalizedName: 'unknown',
    imageLink: null,
  }
  return {
    id: raw.id,
    name: t(raw.name, raw.normalizedName),
    normalizedName: raw.normalizedName,
    trader,
    map: raw.map ? (mapsById[raw.map] ?? null) : null,
    minPlayerLevel: raw.minPlayerLevel ?? 1,
    experience: raw.experience ?? 0,
    factionName: toFaction(raw.factionName),
    kappaRequired: Boolean(raw.kappaRequired),
    lightkeeperRequired: Boolean(raw.lightkeeperRequired),
    wikiLink: raw.wikiLink ?? null,
    taskImageLink: raw.taskImageLink ?? null,
    taskRequirements: (raw.taskRequirements ?? []).map((r) => ({
      taskId: r.task,
      status: r.status ?? [],
    })),
    otherRequirements: describeOtherRequirements(raw, tradersById),
    objectives: (raw.objectives ?? []).map((o) => adaptObjective(o, t, mapsById, questItems)),
  }
}

function indexById<T extends { id: string }>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const x of list) out[x.id] = x
  return out
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** Tasks + traders + maps (with English names) for one game mode. */
export async function fetchGameData(gameMode: GameMode, signal?: AbortSignal): Promise<GameData> {
  // Read the catalog first so we fail with a clear message if the API changed.
  assertCatalogSupports(await getEndpointCatalog(), gameMode)

  const [tasksRes, tradersRes, mapsRes] = await Promise.all([
    fetchTranslated<RawTasksData>(gameMode, 'tasks', signal),
    fetchTranslated<Record<string, RawTrader>>(gameMode, 'traders', signal),
    fetchTranslated<RawMapsData>(gameMode, 'maps', signal),
  ])

  const traders = Object.values(tradersRes.doc.data).map((tr) => adaptTrader(tr, tradersRes.t))
  const maps = adaptMaps(mapsRes.doc.data, mapsRes.t).sort((a, b) => a.name.localeCompare(b.name))
  const tradersById = indexById(traders)
  const mapsById = indexById(maps)
  const questItems = adaptQuestItems(tasksRes.doc.data, tasksRes.t)

  const tasks = Object.values(tasksRes.doc.data.tasks).map((raw) =>
    adaptTask(raw, tasksRes.t, tradersById, mapsById, questItems),
  )

  return {
    gameMode,
    tasks,
    tasksById: indexById(tasks),
    traders,
    maps,
    fetchedAt: Date.now(),
  }
}

/** All items (name, short name, icon, prices) for one game mode. ~1.4 MB compressed. */
export async function fetchItems(gameMode: GameMode, signal?: AbortSignal): Promise<ItemsById> {
  const { doc, t } = await fetchTranslated<RawItemsData>(gameMode, 'items', signal)
  const out: ItemsById = {}
  for (const raw of Object.values(doc.data.items)) {
    const item: Item = {
      id: raw.id,
      name: t(raw.name, raw.normalizedName),
      shortName: t(raw.shortName, raw.normalizedName),
      normalizedName: raw.normalizedName,
      iconLink: raw.iconLink ?? null,
      wikiLink: raw.wikiLink ?? null,
      avg24hPrice: raw.avg24hPrice ?? null,
      basePrice: raw.basePrice ?? 0,
      lastLowPrice: raw.lastLowPrice ?? null,
      types: raw.types ?? [],
      updated: raw.updated ?? null,
    }
    out[item.id] = item
  }
  return out
}

/** Flea-market price history for one item (cached for 5 minutes by the hook). */
export async function fetchPriceHistory(
  gameMode: GameMode,
  itemId: string,
  signal?: AbortSignal,
): Promise<PricePoint[]> {
  const doc = await fetchJson<RawPriceHistoryDoc>(`/${gameMode}/prices/${itemId}`, signal)
  return doc.data ?? []
}

/** EFT server status. */
export async function fetchServerStatus(signal?: AbortSignal): Promise<RawStatusDoc['data']> {
  const doc = await fetchJson<RawStatusDoc>('/status', signal)
  return doc.data
}
