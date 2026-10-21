/**
 * The raid briefing: what to tell you the moment the game loads a map. Pure, so it is tested
 * without the app; RaidBriefingHost feeds it the live data and shows / speaks the result.
 *
 * Which quests: the ones you ticked for this map on the Maps tab, else the ones you have started
 * in the game (from its logs), else none (it only says how many available quests have objectives
 * here, since listing 20 quests you have not picked up helps nobody).
 */
import type { TaskStatus } from '../lib/taskStatus'
import { buildBringList, type BringEntry } from '../maps/overlay/bringList'
import type { MapTask } from '../maps/overlay/mapTasks'

export type BriefingSource = 'ticked' | 'started' | 'none'

export interface RaidBriefing {
  mapId: string
  mapKey: string
  mapName: string
  source: BriefingSource
  quests: { id: string; name: string }[]
  /** Available quests with objectives on this map (whatever the source). */
  availableCount: number
  bring: BringEntry[]
  /** Display line per bring entry, same order as `bring`. */
  bringLabels: string[]
  /** What is read out loud. */
  spoken: string
}

export interface BriefingInput {
  map: { id: string; name: string; normalizedName: string }
  /** Quests with objectives on this map (faction already filtered). */
  mapTasks: MapTask[]
  statuses: Record<string, TaskStatus>
  startedIds: ReadonlySet<string>
  tickedIds: ReadonlySet<string>
  /** Full item name, when the item list is loaded. */
  itemName: (id: string) => string | undefined
  /** Short in-game name ("DVL-10"), easier to listen to than the full one. */
  itemShortName?: (id: string) => string | undefined
}

const SPOKEN_QUESTS = 5
const SPOKEN_BRING = 5
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

/** "A", "A and B", "A, B and C". */
export function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function bringLabel(e: BringEntry, itemName: (id: string) => string | undefined): string {
  const name = e.questItemName ?? (e.kind === 'wear' ? e.itemIds.map((id) => itemName(id) ?? 'an item').join(' + ') : (e.itemIds[0] && itemName(e.itemIds[0])) || 'an item')
  const count = e.count > 1 ? `${e.count}× ` : ''
  const more = e.kind === 'weapon' && e.itemIds.length > 1 ? ` (or ${e.itemIds.length - 1} other gun${e.itemIds.length === 2 ? '' : 's'})` : e.otherOutfits ? ` (or ${e.otherOutfits} other outfit${e.otherOutfits === 1 ? '' : 's'})` : ''
  return `${count}${name}${more}`
}

export function buildBriefing(input: BriefingInput): RaidBriefing {
  const { map, mapTasks, statuses, startedIds, tickedIds, itemName, itemShortName } = input
  const open = mapTasks.filter((mt) => statuses[mt.task.id] === 'available')
  const ticked = open.filter((mt) => tickedIds.has(mt.task.id))
  const started = open.filter((mt) => startedIds.has(mt.task.id))
  const source: BriefingSource = ticked.length ? 'ticked' : started.length ? 'started' : 'none'
  const chosen = source === 'ticked' ? ticked : source === 'started' ? started : []
  const quests = chosen.map((mt) => ({ id: mt.task.id, name: mt.task.name }))
  const bring = buildBringList(chosen)
  const bringLabels = bring.map((e) => bringLabel(e, itemName))

  let spoken: string
  if (quests.length) {
    const names = quests.slice(0, SPOKEN_QUESTS).map((q) => q.name)
    const rest = quests.length - names.length
    const list = rest > 0 ? `${names.join(', ')} and ${countWord(rest)} more` : joinAnd(names)
    spoken = `${map.name}. ${quests.length === 1 ? 'One quest' : `${capitalise(countWord(quests.length))} quests`} here: ${list}.`
    // Only what is needed: optional objectives' items and gear are on the card, not read out.
    // Short names are easier to listen to ("DVL-10"), but a key's ("314 marked") means nothing alone.
    const spokenName = (id: string) => itemShortName?.(id) || itemName(id)
    const say = bring
      .map((e, i) => ({ e, full: bringLabels[i], label: bringLabel(e, e.kind === 'key' ? itemName : spokenName) }))
      .filter(({ e }) => !e.optional && e.kind !== 'wear' && e.kind !== 'weapon')
    // Two items with one short name (a DVL-10 rifle and its DVL-10 magazine): full names for those.
    const clashes = new Set(say.filter((x, i) => say.findIndex((y) => y.label === x.label) !== i).map((x) => x.label))
    for (const x of say) if (clashes.has(x.label)) x.label = x.full
    if (say.length) {
      const items = say.slice(0, SPOKEN_BRING).map((x) => x.label.replace(/^(\d+)× /, '$1 '))
      const more = say.length - items.length
      spoken += ` You need ${more > 0 ? `${items.join(', ')} and ${countWord(more)} more` : joinAnd(items)}.`
    }
  } else if (open.length) {
    spoken = `${map.name}. None of your started quests are here. ${capitalise(countWord(open.length))} available quest${open.length === 1 ? ' has' : 's have'} objectives on this map.`
  } else {
    spoken = `${map.name}. No open quests on this map.`
  }
  return { mapId: map.id, mapKey: map.normalizedName, mapName: map.name, source, quests, availableCount: open.length, bring, bringLabels, spoken }
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** mapLoading and raidMatched both announce the same raid: brief once per map per this many ms. */
export const BRIEFING_REPEAT_MS = 10 * 60_000

export function isRepeat(last: { mapKey: string; at: number } | null, mapKey: string, at: number, ended: boolean): boolean {
  return !!last && !ended && last.mapKey === mapKey && at - last.at < BRIEFING_REPEAT_MS
}
