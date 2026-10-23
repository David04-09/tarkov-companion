/**
 * Changes the player asks for by voice or text: tick or untick a quest, "Debut should be
 * available", "zoom to Debut", "I'm level 30", "I'm BEAR", "switch to PvE", "workbench level 2",
 * "Prapor is level 3". Pure: the assistant host applies a change and offers Undo.
 * A question about the same thing ("is Debut available?") is not a change.
 */
import type { Task } from '../api/types'
import { compact, findNames, words, type NameEntry } from './text'

export type Change =
  | { kind: 'questDone'; task: Task; done: boolean }
  | { kind: 'questAvailable'; task: Task }
  | { kind: 'zoomQuest'; task: Task }
  | { kind: 'playerLevel'; level: number }
  | { kind: 'faction'; faction: 'USEC' | 'BEAR' }
  | { kind: 'gameMode'; mode: 'regular' | 'pve' }
  | { kind: 'station'; id: string; name: string; level: number; maxLevel: number }
  | { kind: 'trader'; id: string; name: string; level: number; maxLevel: number }
  | { kind: 'undo' }

export interface ChangeContext {
  quests: Task[]
  stations: { id: string; name: string; maxLevel: number }[]
  traders: { id: string; name: string; maxLevel: number }[]
  /** Current levels, for "upgraded the workbench" without a number. */
  stationLevel: (id: string) => number
}

const POLITE = /^(?:(?:please|ok|okay|hey|so|now|and|just|can you|could you|would you|will you|i want you to|go ahead and) )*/
const QUESTION = /^(is|are|was|what|whats|where|how|hows|can i|do|does|did i|which|why|when|who|should|will)\b/
const NUMBER_WORDS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Hideout station nicknames people use. */
const STATION_NICKNAMES: Record<string, string[]> = {
  lavatory: ['lav', 'toilet', 'bathroom'],
  medstation: ['med station', 'medical station', 'meds station'],
  'intelligence center': ['intel', 'intel center', 'intelligence'],
  'nutrition unit': ['nutrition', 'kitchen', 'nutrition station'],
  'air filtering unit': ['air filter', 'air filtering', 'afu'],
  'booze generator': ['booze', 'moonshine station', 'booze gen'],
  'bitcoin farm': ['bitcoin', 'btc farm', 'bitcoin miner'],
  'water collector': ['water'],
  'solar power': ['solar', 'solar panel', 'solar panels'],
  'shooting range': ['range'],
  'scav case': ['scav box'],
  'rest space': ['rest', 'rest room'],
  generator: ['gen', 'power'],
  workbench: ['work bench', 'bench'],
  heating: ['heater'],
  illumination: ['lights', 'lighting'],
}

function levelIn(said: string): number | null {
  const m = /\b(?:level|lvl|loyalty|ll|tier) (\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/.exec(said) ?? /\b(?:to|at) (\d{1,2}|one|two|three|four|five|six)$/.exec(said)
  if (!m) return null
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]]
}

export function parseChange(text: string, ctx: ChangeContext): Change | null {
  const said = words(text).join(' ').replace(POLITE, '')
  if (!said) return null
  if (/^(undo|undo that|undo it|take that back|revert that|put it back)$/.test(said)) return { kind: 'undo' }
  if (QUESTION.test(said)) return null

  // Player level: "I'm level 30", "set my level to 30", "I just hit level 31".
  const lvl = /^(?:set )?(?:my )?(?:player |character |pmc )?level (?:to |is |is now )?(\d{1,2})$|^i(?: am|m)(?: now)? level (\d{1,2})$|^(?:i )?(?:just )?(?:hit|reached|got to|am now) level (\d{1,2})$|^(?:set )?my level (?:to )?(\d{1,2})$/.exec(said)
  if (lvl) {
    const level = Number(lvl[1] ?? lvl[2] ?? lvl[3] ?? lvl[4])
    if (level >= 1 && level <= 79) return { kind: 'playerLevel', level }
  }
  // Faction: "I'm BEAR", "set my faction to USEC", "switch to bear".
  const fac = /^(?:i(?: am|m)(?: a| playing)?|set (?:my )?faction (?:to )?|switch (?:my faction )?to|change (?:my )?faction to|my faction is|i play) (bear|usec)$/.exec(said)
  if (fac) return { kind: 'faction', faction: fac[1] === 'bear' ? 'BEAR' : 'USEC' }
  // Game mode: "switch to PvE", "I play PvP".
  const mode = /^(?:switch (?:to|mode to)|set (?:the )?(?:game )?mode (?:to )?|change (?:the )?mode to|i(?: am|m) (?:playing |on )?|i play|use) (pve|pvp|p v e|p v p|player versus environment|regular)$/.exec(said)
  if (mode) return { kind: 'gameMode', mode: /e$|environment/.test(mode[1]) ? 'pve' : 'regular' }

  // Traders and hideout stations with a level: "Prapor is level 3", "set the workbench to level 2", "I built the lavatory".
  const level = levelIn(said)
  const built = /\b(built|build|upgraded|upgrade|finished building|constructed)\b/.test(said)
  if (level !== null || built) {
    for (const t of ctx.traders) {
      if (level !== null && words(t.name).every((w) => said.split(' ').includes(w))) return { kind: 'trader', id: t.id, name: t.name, level: Math.max(1, Math.min(t.maxLevel, level)), maxLevel: t.maxLevel }
    }
    const entries: NameEntry<ChangeContext['stations'][number]>[] = []
    for (const s of ctx.stations) {
      entries.push({ key: compact(s.name), value: s })
      for (const n of STATION_NICKNAMES[s.name.toLowerCase()] ?? []) entries.push({ key: compact(n), value: s })
    }
    const hit = findNames(said.split(' '), entries).filter((h) => h.len >= 3).sort((a, b) => b.len - a.len)[0]
    if (hit) {
      const s = hit.value
      const to = level ?? ctx.stationLevel(s.id) + 1
      return { kind: 'station', id: s.id, name: s.name, level: Math.max(0, Math.min(s.maxLevel, to)), maxLevel: s.maxLevel }
    }
  }

  // Quests by name, with what to do with them.
  const questEntries: NameEntry<Task>[] = ctx.quests.map((q) => ({ key: compact(q.name), value: q }))
  const hit = findNames(said.split(' '), questEntries).filter((h) => h.len >= 4).sort((a, b) => b.len - a.len)[0]
  if (!hit) return null
  const task = hit.value
  const rest = said.split(' ').filter((_, i) => i < hit.start || i > hit.end).join(' ')
  if (/\b(untick|unmark|uncheck|uncomplete|not done|not finished|not completed|reopen|undone)\b/.test(rest)) return { kind: 'questDone', task, done: false }
  if (/\b(available|unlock|unlocked|not locked|is open|should be open|unlock it|can do)\b/.test(rest)) return { kind: 'questAvailable', task }
  if (/\b(zoom|focus|center|centre|go to|show me where|where on the map)\b/.test(rest) || (/\b(show|put|pin|track)\b/.test(rest) && /\bmap\b/.test(rest))) return { kind: 'zoomQuest', task }
  if (/\b(mark|tick|check off|check|finished|finish|completed|complete|did|done|handed in|hand in|turned in|turn in)\b/.test(rest)) return { kind: 'questDone', task, done: true }
  return null
}

/**
 * What makes a locked quest available: every quest it needs done first (all the way back), and
 * the player level it needs. Only "complete" requirements count, as in the status rule.
 */
export function planAvailable(task: Task, quests: Task[], completed: ReadonlySet<string>, playerLevel: number): { complete: Task[]; level: number | null } {
  const byId = new Map(quests.map((q) => [q.id, q]))
  const need: Task[] = []
  const seen = new Set<string>()
  const visit = (t: Task) => {
    for (const r of t.taskRequirements) {
      if (!r.status.includes('complete') || completed.has(r.taskId) || seen.has(r.taskId)) continue
      seen.add(r.taskId)
      const pre = byId.get(r.taskId)
      if (!pre) continue
      visit(pre)
      need.push(pre)
    }
  }
  visit(task)
  return { complete: need, level: task.minPlayerLevel > playerLevel ? task.minPlayerLevel : null }
}
