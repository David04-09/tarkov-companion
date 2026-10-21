/**
 * The assistant's answers that use what it has learned (memory.ts): what it knows about you,
 * which map to play, the daily greeting, and habits read from old game logs.
 */
import type { GameData, GameMap, ItemsById, Task } from '../api/types'
import { expandNicknames, findItem } from './items'
import { ALL_PLACES } from './places'
import { compact, words } from './text'
import type { GameEvent } from '../shared/desktop-api'
import { pairRaids } from '../lib/logStats'
import type { TaskStatus } from '../lib/taskStatus'
import type { MapTask } from '../maps/overlay/mapTasks'
import { requiredClosure } from '../quests/questGraph'
import { raidKey, type RaidEntry } from '../store/raidLog'
import type { Reply } from './engine'
import { emptyHabits, recordRaid, recordResult, survivalText, topMaps, wantsShort, whenYouPlay, type Habits, type LearnedWord, type MemoryNote, type Style } from './memory'

const mapName = (data: GameData, key: string) => data.maps.find((m) => m.normalizedName === key)?.name ?? key
const dateText = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function noteReply(note: MemoryNote): Reply {
  return { text: `You told me on ${dateText(note.at)}: ${note.text}` }
}

/** "What do you know about me?" */
export function knowReply(data: GameData, m: { learning: boolean; notes: MemoryNote[]; words: LearnedWord[]; habits: Habits; style: Style }): Reply {
  const lines: string[] = []
  for (const n of m.notes.slice(-10).reverse()) lines.push(`Note (${dateText(n.at)}): ${n.text}`)
  if (m.notes.length > 10) lines.push(`… and ${m.notes.length - 10} older notes (all on the Neural network tab).`)
  for (const w of m.words.slice(-10)) lines.push(`When you say "${w.phrase}" you mean ${w.means}.`)
  const maps = topMaps(m.habits)
  if (maps.length) lines.push(`Most played: ${maps.map(([key, h]) => `${mapName(data, key)} ${h.raids} raids${survivalText(h) ? ` (${survivalText(h)})` : ''}`).join(', ')}.`)
  const when = whenYouPlay(m.habits)
  if (when) lines.push(`You play ${when}.`)
  const asks = Object.entries(m.habits.asks).filter(([k]) => k !== 'other').sort((a, b) => b[1] - a[1])
  if (asks.length) lines.push(`You ask me most about ${asks[0][0]}.`)
  if (wantsShort(m.style)) lines.push(m.style.pref === 'short' ? 'You asked for short answers: I read out only the first sentence.' : 'You often cut my answers off, so I read out only the first sentence.')
  if (!m.learning) lines.push('Learning is switched off: I use what I know but learn nothing new.')
  if (!lines.length) return { text: "I don't know much about you yet, sir. Tell me things with \"remember that…\", and I learn your maps from your raids.", links: [{ label: 'Memory', to: '/neural' }] }
  return { text: 'Here is what I know about you, sir. Everything stays on this PC.', lines, links: [{ label: 'Memory', to: '/neural' }] }
}

/** Open quests with objectives on a map. */
const openOn = (map: GameMap, tasksOnMap: (m: GameMap) => MapTask[], statuses: Record<string, TaskStatus>) => tasksOnMap(map).filter((mt) => statuses[mt.task.id] === 'available').length

/** "What should I play tonight?": your favourite map if it has work for you, else the one with the most. */
export function recommendReply(data: GameData, statuses: Record<string, TaskStatus>, tasksOnMap: (m: GameMap) => MapTask[], habits: Habits): Reply {
  const rows = data.maps
    .filter((m) => !/night/i.test(m.normalizedName))
    .map((m) => ({ map: m, open: openOn(m, tasksOnMap, statuses), habit: habits.maps[m.normalizedName] }))
    .filter((r) => r.open > 0)
  if (!rows.length) return { text: 'No open quests on any map right now, sir. Free raid: pick the one you enjoy.' }
  const byOpen = [...rows].sort((a, b) => b.open - a.open)
  const favourite = topMaps(habits, 1)[0]
  const fav = favourite && rows.find((r) => r.map.normalizedName === favourite[0])
  // Your usual map wins when it still has at least half as much to do as the busiest one.
  const pick = fav && fav.open * 2 >= byOpen[0].open ? fav : byOpen[0]
  const why = [`${pick.open} open quest${pick.open === 1 ? '' : 's'} there`]
  if (pick === fav) why.push('it is your most played map')
  const surv = pick.habit ? survivalText(pick.habit) : null
  if (surv) why.push(surv)
  return {
    text: `${pick.map.name}, sir: ${why.join(', ')}.`,
    lines: byOpen.slice(0, 4).map((r) => `${r.map.name}: ${r.open} open quests${r.habit ? `, ${r.habit.raids} raids played` : ''}`),
    mapId: pick.map.id,
    actions: [{ kind: 'openMap', mapKey: pick.map.normalizedName, label: `Open ${pick.map.name}` }],
  }
}

export const RECOMMEND = /\b(what should i (play|run|do)|which map should i|where should i (go|raid|play)|what map (should|to)|suggest a map|plan (my|a|the) raid)\b/

/** Numbers for the daily greeting. */
export function greetingFacts(data: GameData, tasks: Task[], completed: ReadonlySet<string>, statuses: Record<string, TaskStatus>, tasksOnMap: (m: GameMap) => MapTask[], habits: Habits) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
  const kappaIds = tasks.filter((t) => t.kappaRequired).map((t) => t.id)
  const kappaLeft = kappaIds.length ? requiredClosure(kappaIds, byId, completed).size : null
  const favourite = topMaps(habits, 1)[0]
  const favMap = favourite && data.maps.find((m) => m.normalizedName === favourite[0])
  return {
    kappaLeft,
    favourite: favMap ? { name: favMap.name, open: openOn(favMap, tasksOnMap, statuses) } : null,
    openQuests: Object.values(statuses).filter((s) => s === 'available').length,
  }
}

/**
 * The real name a taught word should mean ("xenomorph sealing foam" → "Xenomorph sealing foam"):
 * a map, quest or place written in full, else the item it finds. Null when nothing has that name,
 * so a word is never taught to mean something that does not exist.
 */
export function resolveName(said: string, data: GameData, items: ItemsById | undefined): string | null {
  const c = compact(said)
  const w = words(said)
  if (!c) return null
  const exact = [...data.maps.map((m) => m.name), ...data.tasks.map((t) => t.name), ...ALL_PLACES.map((p) => p.name)].find((n) => compact(n) === c)
  if (exact) return exact
  if (!items) return null
  const named = Object.values(items).find((it) => compact(it.name) === c || compact(it.shortName) === c)
  if (named) return named.name
  return findItem(expandNicknames(w), items)?.item.name ?? null
}

/** Habits from every raid in the old game logs (raid results from the raid log where marked). */
export function habitsFromLogs(events: GameEvent[], maps: GameMap[], raidLog: Record<string, Record<string, RaidEntry>>, keepAsks: Habits['asks']): Habits {
  let h: Habits = { ...emptyHabits(), asks: keepAsks }
  for (const r of pairRaids(events)) {
    const loc = r.location.toLowerCase()
    const map = maps.find((m) => m.nameId.toLowerCase() === loc || m.name.toLowerCase() === loc || (m.scenePath && m.scenePath.toLowerCase() === loc))
    if (!map) continue
    const key = map.normalizedName.replace(/^night-factory$/, 'factory')
    h = recordRaid(h, key, r.start)
    if (r.end !== null) {
      const id = raidKey(r.raidId, r.end)
      const result = Object.values(raidLog).find((byKey) => byKey[id]?.result)?.[id]?.result ?? null
      if (result) h = recordResult(h, key, result, null)
    }
  }
  return h
}
