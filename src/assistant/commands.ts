/**
 * Voice commands that move around the app: "Maps", "open the flea market", "Customs", "show quest
 * Debut", "show key dorm 314", "search GPU on the flea", "go back". A command is the whole
 * sentence, nothing else, so a tab name said in passing ("which maps do you like") does nothing.
 * Pure; the assistant host carries the command out (navigate, pick the map, fill a search).
 */
import { compact, findNames, words, type NameEntry } from './text'

export interface CommandTarget {
  /** Route to open, or 'back'. */
  to: string
  /** What is opened, for the chat ("Maps", "Customs on the Maps tab"). */
  label: string
  /** Maps tab: the map to show (normalizedName). */
  mapKey?: string
  /** Flea Market tab: the search to fill in. */
  flea?: string
  /** URL search parameters the page reads (q = search, key = a key to open). */
  params?: Record<string, string>
}

export interface CommandContext {
  tabs: { path: string; label: string }[]
  maps: { name: string; normalizedName: string }[]
  quests: { id: string; name: string }[]
  /** An item named by these words (keysOnly: keys and keycards only). */
  findItem: (said: string[], keysOnly: boolean) => { id: string; name: string } | null
}

/** Other ways people name each tab. */
const TAB_ALIASES: Record<string, string[]> = {
  '/': ['dashboard', 'home', 'overview', 'main page', 'start page'],
  '/neural': ['assistant', 'neural network', 'ai', 'chat', 'the assistant'],
  '/stats': ['stats', 'my stats', 'statistics', 'raid log'],
  '/events': ['events', 'patches', 'events and patches', 'patch notes', 'server status', 'news'],
  '/quests': ['quests', 'quest', 'tasks', 'task list', 'quest list', 'quest tree', 'kappa'],
  '/story': ['story', 'chapters', 'story chapters', 'endings'],
  '/maps': ['map', 'maps', 'the map', 'interactive map'],
  '/keys': ['keys', 'key list', 'keys list'],
  '/ammo': ['ammo', 'ammunition', 'bullets', 'ammo chart'],
  '/items': ['item collection', 'collection', 'items', 'my items', 'collector'],
  '/hideout': ['hideout', 'hide out', 'stations'],
  '/flea': ['flea', 'flea market', 'fleamarket', 'market', 'the flea', 'traders'],
  '/settings': ['settings', 'options', 'preferences'],
  '/features': ['features', 'features and patches', 'changelog', 'whats new', 'updates'],
}

const MAP_NICKNAMES: Record<string, string[]> = { 'the-lab': ['labs', 'lab', 'the lab'], 'streets-of-tarkov': ['streets'], 'ground-zero': ['gz', 'ground zero'], 'night-factory': [] }

/** Words before a command that change nothing ("please", "can you", "go to"). */
const LEAD = /^(?:(?:please|ok|okay|now|just|hey|so|and|can you|could you|would you|will you|i want to|i wanna|lets|let me) )*/
const VERB = /^(?:(show me|take me to|go to|goto|search for|look up|switch to|bring up|pull up|navigate to|jump to|open|go|show|display|search|find|check|get) )?/
const TAIL = / (?:please|now|for me|thanks|thank you)$/

const FILLER = new Set(['the', 'a', 'an', 'my'])
const strip = (w: string[]) => {
  const out = [...w]
  while (out.length && FILLER.has(out[0])) out.shift()
  while (out.length && ['tab', 'page', 'screen', 'menu', 'section', 'window'].includes(out[out.length - 1])) out.pop()
  return out
}

function tabFor(phrase: string, ctx: CommandContext): CommandContext['tabs'][number] | null {
  const c = compact(phrase)
  for (const tab of ctx.tabs) {
    const names = [tab.label, ...(TAB_ALIASES[tab.path] ?? [])]
    if (names.some((n) => compact(n) === c)) return tab
  }
  return null
}

function mapFor(phrase: string, ctx: CommandContext): CommandContext['maps'][number] | null {
  const w = strip(words(phrase))
  // "Customs", "Customs map", "the map of Customs", "map Customs".
  const name = w[w.length - 1] === 'map' ? w.slice(0, -1) : w[0] === 'map' ? w.slice(w[1] === 'of' ? 2 : 1) : w
  const c = compact(strip(name).join(' '))
  if (!c) return null
  return ctx.maps.find((m) => !/night/.test(m.normalizedName) && (compact(m.name) === c || (MAP_NICKNAMES[m.normalizedName] ?? []).some((n) => compact(n) === c))) ?? null
}

export function parseCommand(text: string, ctx: CommandContext): CommandTarget | null {
  let s = ` ${words(text).join(' ')} `.trim()
  s = s.replace(TAIL, '').replace(LEAD, '')
  if (!s) return null
  if (/^(go back|back|previous page|go back a page)$/.test(s)) return { to: 'back', label: 'the last page' }
  const verbMatch = VERB.exec(s)
  const verb = verbMatch?.[1] ?? ''
  const rest = s.slice(verbMatch?.[0].length ?? 0)
  const w = strip(words(rest))
  if (!w.length) return null
  const phrase = w.join(' ')

  // A tab by name ("flea market", "open the quests tab").
  const tab = tabFor(phrase, ctx)
  if (tab) return { to: tab.path, label: tab.label }

  // A map ("Customs", "open the Woods map").
  const map = mapFor(phrase, ctx)
  if (map) return { to: '/maps', label: `${map.name} on the Maps tab`, mapKey: map.normalizedName }

  // "show quest Debut", "Debut quest", "open the quest Gunsmith part 1".
  const questWords = w[0] === 'quest' || w[0] === 'task' ? w.slice(1) : w[w.length - 1] === 'quest' || w[w.length - 1] === 'task' ? w.slice(0, -1) : verb ? w : []
  if (questWords.length) {
    const entries: NameEntry<CommandContext['quests'][number]>[] = ctx.quests.map((q) => ({ key: compact(q.name), value: q }))
    const hit = findNames(questWords, entries).find((h) => h.start === 0 && h.end === questWords.length - 1 && h.len >= 4)
    if (hit) return { to: '/quests', label: `${hit.value.name} in Quests`, params: { q: hit.value.name } }
  }

  // "show key dorm 314", "open the factory key".
  if (verb && (w.includes('key') || w.includes('keycard'))) {
    const said = w.filter((x) => x !== 'key' || w.indexOf(x) !== 0)
    const key = ctx.findItem(said, true)
    if (key) return { to: '/keys', label: `${key.name} in Keys`, params: { key: key.id } }
  }

  // "search GPU on the flea", "flea market LEDX", "LEDX on the flea".
  const flea = /^(?:(.+) (?:on|in) (?:the )?(?:flea|flea market|market))$|^(?:flea market|flea) (.+)$/.exec(phrase)
  if (flea) {
    const said = strip(words(flea[1] ?? flea[2]))
    const item = said.length ? ctx.findItem(said, false) : null
    if (item) return { to: '/flea', label: `${item.name} on the Flea Market`, flea: item.name }
  }

  // "GPU in my collection", "show the LEDX in item collection".
  const coll = /^(.+) in (?:my )?(?:item )?collection$/.exec(phrase)
  if (coll) {
    const item = ctx.findItem(strip(words(coll[1])), false)
    if (item) return { to: '/items', label: `${item.name} in the Item Collection`, params: { q: item.name } }
  }

  // "show ammo M995", "show 5.45 ammo".
  if (verb && (w[0] === 'ammo' || w[w.length - 1] === 'ammo') && w.length > 1) {
    const q = (w[0] === 'ammo' ? w.slice(1) : w.slice(0, -1)).join(' ')
    return { to: '/ammo', label: `${q} in Ammo`, params: { q } }
  }
  return null
}

/** What the chat says when a command runs. */
export const commandText = (cmd: CommandTarget) => (cmd.to === 'back' ? 'Going back.' : `Opening ${cmd.label}.`)

/** Words the always-on recogniser listens for besides the wake word: verbs, tab and map names. */
export function commandWords(ctx: Pick<CommandContext, 'tabs' | 'maps'>): string[] {
  const set = new Set(['open', 'go', 'to', 'show', 'me', 'take', 'switch', 'bring', 'up', 'pull', 'search', 'for', 'look', 'find', 'check', 'the', 'quest', 'task', 'key', 'keycard', 'on', 'in', 'my', 'back', 'tab', 'page', 'map', 'of', 'please'])
  for (const t of ctx.tabs) for (const n of [t.label, ...(TAB_ALIASES[t.path] ?? [])]) for (const x of words(n)) set.add(x)
  for (const m of ctx.maps) for (const x of words(m.name)) set.add(x)
  for (const list of Object.values(MAP_NICKNAMES)) for (const n of list) for (const x of words(n)) set.add(x)
  return [...set].filter((x) => /^[a-z]+$/.test(x))
}

/** Verbs that start a command whose name the recogniser cannot know ("show quest …"): heard again by the better model. */
export const NEEDS_TRANSCRIBING = /^(show|open|search|find|look|take|go|check|bring|pull)\b/
