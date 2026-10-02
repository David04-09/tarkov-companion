/**
 * Types for the tarkov.dev JSON API.
 *
 * "Raw*" types mirror the documents exactly as downloaded on 2026-10-02 from
 * https://json.tarkov.dev/regular/{tasks,items,traders,maps}. Only the fields
 * this app reads are listed; the real documents contain many more.
 *
 * The un-prefixed types (Task, Item, Trader, GameMap ...) are the app-facing
 * shapes after English translations have been merged in and id references
 * have been resolved to objects.
 */

import type { GameMode } from './client'

// ---------------------------------------------------------------------------
// Catalog: GET /endpoints
// ---------------------------------------------------------------------------

export interface CatalogEndpoint {
  name: string
  /** e.g. "/{{gameMode}}/tasks" */
  path: string
  description: string
  translations: boolean
}

export interface EndpointCatalog {
  data: {
    endpoints: CatalogEndpoint[]
    gameModes: string[]
    languages: string[]
  }
}

// ---------------------------------------------------------------------------
// Translation documents: GET /{gameMode}/{endpoint}_{lang}
// A flat dictionary: translation key -> localized string.
// ---------------------------------------------------------------------------

export type TranslationDict = Record<string, string>

export interface TranslationDoc {
  data: TranslationDict
}

/** Base documents carry a list of JSONPath expressions naming translated fields. */
export interface TranslatedBaseDoc<TData> {
  data: TData
  translations?: string[]
}

// ---------------------------------------------------------------------------
// Tasks: GET /{gameMode}/tasks   -> data.tasks is keyed by task id
// ---------------------------------------------------------------------------

export interface RawTaskRequirement {
  /** Prerequisite task id. */
  task: string
  /** Required state(s) of that task: "complete" | "active" | "failed". */
  status: string[]
}

export interface RawTraderRequirement {
  id: string
  /** "level" (loyalty level) | "reputation" */
  requirementType: string
  compareMethod: string
  value: number
  trader: string
}

/**
 * Non-task gates observed in the data: "dialogue" (talk to a trader) and
 * "globalVariable" (story progression). Neither can be tracked by this app.
 */
export interface RawOtherRequirement {
  id: string
  type: string
  traders?: string[]
  variableId?: string
  compareMethod?: string
  value?: number
}

export interface RawTaskObjective {
  id: string
  /** Translation key (equals the objective id). */
  description: string
  /** visit | giveItem | shoot | extract | findQuestItem | giveQuestItem | findItem | plantItem | mark | ... */
  type: string
  optional: boolean
  /** Map ids this objective can be done on (empty = anywhere). */
  maps?: string[]
  zones?: unknown[]
  // Item objectives (giveItem / findItem / plantItem / sellItem ...)
  count?: number
  /** Accepted item ids (any one of them satisfies the objective). */
  items?: string[]
  /** Single item id on some objective kinds. */
  item?: string
  foundInRaid?: boolean
  dogTagLevel?: number
  minDurability?: number
  maxDurability?: number
  // Quest-item objectives reference data.questItems
  questItem?: string
  // Shoot objectives
  targetNames?: string[]
  shotType?: string
  // Task-status objectives
  task?: string
  status?: string[]
  // Trader-level objectives
  trader?: string
  level?: number
}

export interface RawTask {
  id: string
  /** Translation key, e.g. "657315ddab5a49b71f098853 name". */
  name: string
  normalizedName: string
  /** Trader id. */
  trader: string
  /** Map id; absent/null when the task is not tied to one map. */
  map?: string | null
  wikiLink: string | null
  taskImageLink?: string | null
  minPlayerLevel: number
  experience: number
  /** "Any" | "USEC" | "BEAR" */
  factionName: string
  kappaRequired: boolean
  lightkeeperRequired: boolean
  restartable: boolean
  taskRequirements: RawTaskRequirement[]
  traderRequirements: RawTraderRequirement[]
  otherRequirements?: RawOtherRequirement[]
  objectives: RawTaskObjective[]
  neededKeys?: unknown[]
  availableDelaySecondsMin?: number
  availableDelaySecondsMax?: number
  /** Present on some tasks, e.g. ["regular"]. */
  gameMode?: string[]
  /** Prestige id when the task needs a prestige level. */
  requiredPrestige?: string
}

export interface RawQuestItem {
  id: string
  /** Translation keys ("<id> Name", "<id> ShortName", "<id> Description"). */
  name: string
  shortName: string
  description: string
  iconLink: string | null
  gridImageLink?: string | null
  width: number
  height: number
}

export interface RawTasksData {
  tasks: Record<string, RawTask>
  questItems: Record<string, RawQuestItem>
  achievements?: Record<string, unknown>
  prestige?: unknown[]
}

export type RawTasksDoc = TranslatedBaseDoc<RawTasksData>

// ---------------------------------------------------------------------------
// Traders: GET /{gameMode}/traders   -> data is keyed by trader id (no wrapper)
// ---------------------------------------------------------------------------

export interface RawTrader {
  id: string
  /** Translation key, e.g. "54cb50c76803fa8b248b4571 Nickname". */
  name: string
  normalizedName: string
  description: string
  currency: string
  imageLink: string | null
}

export type RawTradersDoc = TranslatedBaseDoc<Record<string, RawTrader>>

// ---------------------------------------------------------------------------
// Maps: GET /{gameMode}/maps   -> data.maps is keyed by map id
// ---------------------------------------------------------------------------

export interface RawMap {
  id: string
  /** Translation key, e.g. "55f2d3fd4bdc2d5f408b4567 Name". */
  name: string
  normalizedName: string
  nameId: string
  players: string
  raidDuration: number
  wiki?: string | null
  minPlayerLevel?: number
  maxPlayerLevel?: number
}

export interface RawMapsData {
  maps: Record<string, RawMap>
}

export type RawMapsDoc = TranslatedBaseDoc<RawMapsData>

// ---------------------------------------------------------------------------
// Items: GET /{gameMode}/items   -> data.items is keyed by item id
// ---------------------------------------------------------------------------

export interface RawItem {
  id: string
  /** Translation keys ("<id> Name" / "<id> ShortName"). */
  name: string
  shortName: string
  normalizedName: string
  iconLink: string | null
  gridImageLink?: string | null
  wikiLink?: string | null
  basePrice: number
  avg24hPrice: number | null
  lastLowPrice?: number | null
  low24hPrice?: number | null
  high24hPrice?: number | null
  changeLast48hPercent?: number | null
  /** ISO timestamp of the last price update. */
  updated?: string
  types: string[]
  width: number
  height: number
  weight: number
  categories?: string[]
}

export interface RawItemsData {
  items: Record<string, RawItem>
  itemCategories?: Record<string, unknown>
  fleaMarket?: Record<string, unknown>
  playerLevels?: unknown[]
}

export type RawItemsDoc = TranslatedBaseDoc<RawItemsData>

// ---------------------------------------------------------------------------
// Price history: GET /{gameMode}/prices/{itemId}
// ---------------------------------------------------------------------------

export interface PricePoint {
  price: number
  priceMin: number
  /** Unix epoch milliseconds. */
  timestamp: number
}

export interface RawPriceHistoryDoc {
  data: PricePoint[]
}

// ---------------------------------------------------------------------------
// Status: GET /status
// ---------------------------------------------------------------------------

export interface ServiceStatus {
  name: string
  message?: string
  status: number
  statusCode: string
}

export interface RawStatusDoc {
  data: {
    generalStatus: ServiceStatus
    currentStatuses: ServiceStatus[]
  }
}

// ---------------------------------------------------------------------------
// App-facing (translated, resolved) types
// ---------------------------------------------------------------------------

export interface Trader {
  id: string
  name: string
  normalizedName: string
  imageLink: string | null
}

export interface GameMap {
  id: string
  name: string
  normalizedName: string
}

export interface QuestItem {
  id: string
  name: string
  shortName: string
  iconLink: string | null
}

export interface Item {
  id: string
  name: string
  shortName: string
  normalizedName: string
  iconLink: string | null
  wikiLink: string | null
  avg24hPrice: number | null
  basePrice: number
  lastLowPrice: number | null
  types: string[]
  updated: string | null
}

export interface TaskRequirement {
  taskId: string
  status: string[]
}

export interface TaskObjective {
  id: string
  type: string
  description: string
  optional: boolean
  maps: GameMap[]
  count: number | null
  /** Accepted item ids; resolve against the items query for names/icons. */
  itemIds: string[]
  questItem: QuestItem | null
  foundInRaid: boolean | null
  targetNames: string[]
}

export type FactionName = 'Any' | 'USEC' | 'BEAR'

export interface Task {
  id: string
  name: string
  normalizedName: string
  trader: Trader
  map: GameMap | null
  minPlayerLevel: number
  experience: number
  factionName: FactionName
  kappaRequired: boolean
  lightkeeperRequired: boolean
  wikiLink: string | null
  taskImageLink: string | null
  taskRequirements: TaskRequirement[]
  /**
   * Human-readable gates the app cannot track (trader loyalty level, trader
   * dialogue, story progression). Shown for information only.
   */
  otherRequirements: string[]
  objectives: TaskObjective[]
}

/** Everything the Quests/Dashboard tabs need, loaded for one game mode. */
export interface GameData {
  gameMode: GameMode
  tasks: Task[]
  tasksById: Record<string, Task>
  traders: Trader[]
  maps: GameMap[]
  /** When the data was fetched (for the "updated" hint in the UI). */
  fetchedAt: number
}

export type ItemsById = Record<string, Item>
