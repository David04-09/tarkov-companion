/**
 * What the assistant learns about the player, kept on this PC only (store/assistantMemory.ts).
 * No AI model is trained: it remembers what it is told, counts what it sees and adjusts.
 * - Notes: "remember that I keep the 314 key in my case" → answered back when asked about it.
 * - Words: "no, I meant the Hand drill" after "where is the drill" → "drill" means Hand drill from now on.
 * - Habits: raids per map and hour from the game log, survival from the raid log, what is asked about.
 * - Style: answers cut off often (or "keep it short") → only the first sentence is read out.
 * Pure functions; the store and AssistantHost call them.
 */
import { isEverydayWord, looseKey, singular } from './phonetic'
import { words } from './text'

export interface MemoryNote {
  id: string
  text: string
  at: number
}

export interface LearnedWord {
  /** What the player says ("drill"). */
  phrase: string
  /** What it means ("hand drill"), put in its place before the question is answered. */
  means: string
  at: number
  uses: number
}

export interface MapHabit {
  raids: number
  survived: number
  died: number
  lastAt: number
}

export interface Habits {
  maps: Record<string, MapHabit>
  /** Raids started per hour of the day (24 entries). */
  hours: number[]
  /** Raids per weekday, Sunday first (7 entries). */
  days: number[]
  /** What kind of questions are asked (where, price, route, quest, …). */
  asks: Record<string, number>
}

export type StylePref = 'auto' | 'short' | 'full'

export interface Style {
  pref: StylePref
  /** Answers read out, and how many of them were cut off (Stop, or talking over them). */
  spoken: number
  cut: number
  /** Learned per topic (askKind): "too long" after a price answer → prices short; "tell me more" twice → full. */
  byKind?: Record<string, StylePref>
  /** "Tell me more" per topic, counted towards reading that topic in full. */
  more?: Record<string, number>
  /** How to address the player: "sir", their name, or "" for nothing. */
  address?: string
}

export const emptyHabits = (): Habits => ({ maps: {}, hours: Array(24).fill(0), days: Array(7).fill(0), asks: {} })

const MAX_NOTES = 200
const MAX_WORDS = 300
/** Cut off this often (out of at least MIN_SPOKEN answers) → short answers. */
const CUT_RATIO = 0.4
const MIN_SPOKEN = 6

// ---- Notes -------------------------------------------------------------------------------

const REMEMBER = /^\s*(?:please\s+)?(?:remember that|remember|note to self|make a note that|make a note|don['’]?t let me forget that|don['’]?t let me forget|log this|write down that|write down)\b[\s,:;.-]*/i

/** "Remember that I keep the 314 key in my case" → "I keep the 314 key in my case" (the player's own spelling). */
export function parseRemember(question: string): string | null {
  if (!REMEMBER.test(question)) return null
  const text = question.replace(REMEMBER, '').trim()
  return words(text).length ? text : null
}

export function addNote(notes: MemoryNote[], text: string, at: number): MemoryNote[] {
  const note = { id: `n${at.toString(36)}${Math.floor(Math.random() * 1e4)}`, text, at }
  return [...notes, note].slice(-MAX_NOTES)
}

/** Words that say nothing about what a note is about. */
const STOP = new Set(
  'a an the i im me my mine you your it its is are was be to of in on at for and or but with that this these those what whats where wheres when how much many do does did can could should would will there here have has had about from into by up so if not no yes please just also keep keeps kept put left'.split(' '),
)
const contentWords = (text: string) => words(text).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/s$/, ''))

/** The note a question is about, if one shares enough words with it ("where's my 314 key" → "I keep the 314 key in my case"). */
export function findNote(notes: MemoryNote[], question: string): MemoryNote | null {
  const asked = new Set(contentWords(question))
  if (!asked.size) return null
  let best: { note: MemoryNote; score: number } | null = null
  for (const note of notes) {
    const have = new Set(contentWords(note.text))
    let shared = 0
    for (const w of asked) if (have.has(w)) shared++
    // Most of what was asked must be in the note (two words, or the only word for one-word questions).
    const score = shared / asked.size
    if (shared >= Math.min(2, asked.size) && score >= 0.5 && (!best || score > best.score || (score === best.score && note.at > best.note.at))) best = { note, score }
  }
  return best?.note ?? null
}

/** Personal questions ("where's MY key", "what did I say about") may be answered from notes. */
export const asksAboutOwn = (question: string) => /\b(my|mine|i said|i told you|did i|do i keep|i keep|i left|i put|remind me)\b/.test(words(question).join(' '))

export const FORGET_LAST = /^(?:please )?forget (?:that|the last note|last note|what i just said)$/
export const FORGET_ALL = /^(?:please )?(?:forget everything|forget all|forget all notes|forget everything about me|reset your memory|wipe your memory)$/
export const WHAT_YOU_KNOW = /\b(what do you know about me|what do you remember|what have you learned|what did i tell you|my notes|show me my notes|what have you learnt)\b/

// ---- Learned words -----------------------------------------------------------------------

/** Question words that are not the thing asked about. */
const ASK_WORDS = new Set(
  'where can find is are the a an of what whats wheres how much many price prices cost costs worth sell buy for do does i me my show tell about get to on in at please quest quests task item items key keys need needed still use used'.split(' '),
)

const PRONOUNS = new Set(['it', 'that', 'this', 'there', 'them', 'one', 'those', 'these', 'thing', 'stuff'])

/** The thing a question was about, without the question words: "where can I find the drill" → "drill". */
export function subjectOf(question: string): string | null {
  const rest = words(question).filter((w) => !ASK_WORDS.has(w))
  if (!rest.length || rest.length > 4) return null
  // "it", "that one": never learn a pronoun as a name.
  if (rest.every((w) => PRONOUNS.has(w))) return null
  return rest.join(' ')
}

/** "No, I meant the Hand drill" / "I meant Hand drill" → "hand drill". */
export function parseMeant(question: string): string | null {
  const m = /^(?:no |nope |not that |wrong )*i (?:meant|mean) (?:the |a |an )?(.+)$/.exec(words(question).join(' '))
  return m ? m[1] : null
}

/** "When I say drill I mean hand drill" / "drill means hand drill" → { phrase, means }. */
export function parseTeach(question: string): { phrase: string; means: string } | null {
  // "Learn that …", "remember that …", "teach yourself …", "note: …" in front change nothing.
  const said = words(question)
    .join(' ')
    .replace(/^(?:please )?(?:learn that|learn|remember that|remember|teach yourself that|teach yourself|note that|from now on|okay|ok|so) /, '')
  const m =
    /^(?:when i say|if i say|by|whenever i say) (.+?) i (?:mean|meant) (?:the |a |an )?(.+)$/.exec(said) ??
    /^(.+?) (?:means|meaning|is short for|stands for|is the same as|is the same thing as|equals|is another word for|is my word for|is what i call) (?:the |a |an )?(.+)$/.exec(said)
  if (!m || m[1] === m[2] || m[1].split(' ').length > 4) return null
  const phrase = m[1].replace(/^(?:the|a|an|my) /, '')
  // "what means …" / "does that mean": questions, not teaching.
  if (/^(what|which|who|how|does|do|is|it|that|this)$/.test(phrase.split(' ')[0]) && !/^(it|that|this)$/.test(phrase)) return null
  return { phrase, means: m[2] }
}

export function learnWord(list: LearnedWord[], phrase: string, means: string, at: number): LearnedWord[] {
  const p = words(phrase).join(' ')
  const to = words(means).join(' ')
  if (!p || !to || p === to) return list
  return [...list.filter((w) => w.phrase !== p), { phrase: p, means: to, at, uses: 0 }].slice(-MAX_WORDS)
}

/**
 * Puts learned meanings in place of the player's words (longest phrases first). A taught word is
 * recognised however the speech model spells it: exactly, as a plural ("leddies"), or by sound
 * ("lady", "laddie", "leti" for "leddy"); everyday words never count as a nickname.
 */
export function applyWords(question: string, list: LearnedWord[]): { text: string; used: string[] } {
  const w = words(question)
  const used: string[] = []
  const taken = new Set<number>()
  const replace = new Map<number, { end: number; means: string }>()
  for (const learned of [...list].sort((a, b) => b.phrase.length - a.phrase.length)) {
    const p = learned.phrase.split(' ')
    const pKey = looseKey(learned.phrase)
    const pSingular = p.map(singular).join(' ')
    // Already says the full name ("hand drill" contains "drill"): leave it.
    if (` ${w.join(' ')} `.includes(` ${learned.means} `)) continue
    for (let i = 0; i + p.length <= w.length; i++) {
      const run = w.slice(i, i + p.length)
      if (run.some((_, k) => taken.has(i + k))) continue
      const same = run.join(' ') === learned.phrase || run.map(singular).join(' ') === pSingular
      const sounds = !same && pKey.length >= 3 && run.join('').length >= 3 && !run.some(isEverydayWord) && looseKey(run.join(' ')) === pKey
      if (!same && !sounds) continue
      for (let k = 0; k < p.length; k++) taken.add(i + k)
      replace.set(i, { end: i + p.length, means: learned.means })
      if (!used.includes(learned.phrase)) used.push(learned.phrase)
      break
    }
  }
  if (!used.length) return { text: question, used }
  const out: string[] = []
  for (let i = 0; i < w.length; ) {
    const r = replace.get(i)
    if (r) {
      out.push(r.means)
      i = r.end
    } else out.push(w[i++])
  }
  return { text: out.join(' '), used }
}

// ---- Habits ------------------------------------------------------------------------------

/** One raid seen in the game log (live or from old logs). */
export function recordRaid(h: Habits, mapKey: string, at: number, result?: 'survived' | 'died' | null): Habits {
  const d = new Date(at)
  const m = h.maps[mapKey] ?? { raids: 0, survived: 0, died: 0, lastAt: 0 }
  const hours = [...h.hours]
  const days = [...h.days]
  hours[d.getHours()]++
  days[d.getDay()]++
  return {
    ...h,
    hours,
    days,
    maps: { ...h.maps, [mapKey]: { raids: m.raids + 1, survived: m.survived + (result === 'survived' ? 1 : 0), died: m.died + (result === 'died' ? 1 : 0), lastAt: Math.max(m.lastAt, at) } },
  }
}

type Outcome = 'survived' | 'died' | 'mia' | 'runthrough'
const lived = (r: Outcome | null) => r === 'survived' || r === 'runthrough'
const lost = (r: Outcome | null) => r === 'died' || r === 'mia'

/** The player marked how a raid went (the after-raid card); `before` = what it was marked as earlier. */
export function recordResult(h: Habits, mapKey: string, result: Outcome | null, before: Outcome | null): Habits {
  const m = h.maps[mapKey]
  if (!m) return h
  const survived = Math.max(0, m.survived + Number(lived(result)) - Number(lived(before)))
  const died = Math.max(0, m.died + Number(lost(result)) - Number(lost(before)))
  return { ...h, maps: { ...h.maps, [mapKey]: { ...m, survived, died } } }
}

export function recordAsk(h: Habits, kind: string): Habits {
  return { ...h, asks: { ...h.asks, [kind]: (h.asks[kind] ?? 0) + 1 } }
}

/** What a question was about, for the habit counts. */
export function askKind(question: string): string {
  const s = ` ${words(question).join(' ')} `
  if (/\b(boss|bosses|goons|killa|tagilla|reshala|glukhar|sanitar|shturman|kaban|kollontay|zryachiy|partisan)\b/.test(s)) return 'bosses'
  if (/\b(price|cost|worth|sell|how much)\b/.test(s)) return 'prices'
  if (/\b(get to|route|way to|take me|from)\b/.test(s)) return 'routes'
  if (/\b(extract|extracts|exfil)\b/.test(s)) return 'extracts'
  if (/\b(closest|nearest|next) (quest|task)/.test(s) || /\bquest|task\b/.test(s)) return 'quests'
  if (/\b(where|find|spawn)\b/.test(s)) return 'finding things'
  if (/\b(add|collected|picked up|used|sold|still need)\b/.test(s)) return 'item collection'
  return 'other'
}

export const topMaps = (h: Habits, n = 3) =>
  Object.entries(h.maps)
    .sort((a, b) => b[1].raids - a[1].raids || b[1].lastAt - a[1].lastAt)
    .slice(0, n)

const PART_OF_DAY = (hour: number) => (hour < 5 ? 'late at night' : hour < 12 ? 'in the morning' : hour < 17 ? 'in the afternoon' : hour < 22 ? 'in the evening' : 'late at night')
const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/** "Mostly in the evening, most often on Fridays", when there is enough to say. */
export function whenYouPlay(h: Habits): string | null {
  const total = h.hours.reduce((a, b) => a + b, 0)
  if (total < 5) return null
  const parts = new Map<string, number>()
  h.hours.forEach((n, hour) => parts.set(PART_OF_DAY(hour), (parts.get(PART_OF_DAY(hour)) ?? 0) + n))
  const [part] = [...parts.entries()].sort((a, b) => b[1] - a[1])[0]
  const day = h.days.indexOf(Math.max(...h.days))
  return `mostly ${part}, most often on ${DAY_NAMES[day]}`
}

export function survivalText(m: MapHabit): string | null {
  const known = m.survived + m.died
  return known >= 3 ? `you survive ${Math.round((m.survived / known) * 100)}% there` : null
}

// ---- Style -------------------------------------------------------------------------------

export function wantsShort(s: Style, kind?: string): boolean {
  const learned = kind ? s.byKind?.[kind] : undefined
  if (learned && learned !== 'auto') return learned === 'short'
  if (s.pref !== 'auto') return s.pref === 'short'
  return s.spoken >= MIN_SPOKEN && s.cut / s.spoken > CUT_RATIO
}

/** "Keep it short" / "more detail" / "normal answers". */
export function parseStyle(question: string): StylePref | null {
  const s = words(question).join(' ')
  if (/\b(keep it short|be brief|shorter answers|short answers|less talking|talk less|too long)\b/.test(s)) return 'short'
  if (/\b(more detail|longer answers|full answers|tell me everything|say everything)\b/.test(s)) return 'full'
  if (/\b(normal answers|answer normally|back to normal)\b/.test(s)) return 'auto'
  return null
}

/** The first sentence, for short answers (the rest stays on screen). */
export function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text)
  return m ? m[1] : text
}

// ---- Greeting ----------------------------------------------------------------------------

export function partOfDayGreeting(hour: number): string {
  return hour < 5 ? 'Evening' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
}

/** "Evening, sir. 6 quests left for Kappa, 2 of them on Customs, your most played map." */
export function greetingText(o: { hour: number; kappaLeft: number | null; favourite: { name: string; open: number } | null; openQuests: number }): string {
  const parts = [`${partOfDayGreeting(o.hour)}, sir.`]
  if (o.kappaLeft !== null && o.kappaLeft > 0) {
    parts.push(`${o.kappaLeft} quest${o.kappaLeft === 1 ? '' : 's'} left on the way to Kappa.`)
  } else if (o.openQuests > 0) parts.push(`${o.openQuests} quests are available.`)
  if (o.favourite && o.favourite.open > 0) parts.push(`${o.favourite.open} of your open quests are on ${o.favourite.name}, your most played map.`)
  return parts.join(' ')
}

// ---- Talking to someone else -------------------------------------------------------------

/** "Not you", "I wasn't talking to you": the last thing it answered was not for it. */
export const NOT_FOR_YOU = /^(?:no )?(?:not you|not talking to you|i was not talking to you|i wasnt talking to you|i was talking to (?:him|her|them|my (?:friend|mate|buddy|team))|that was not for you|that wasnt for you|wasnt for you|not for you|ignore that|ignore me|stay out of it|shush|be quiet|quiet)\b/
/** "That was for you", "answer that": the last thing it stayed quiet about was for it. */
export const WAS_FOR_YOU = /^(?:i was talking to you|that was for you|that was a question|answer that|you can answer that|why didnt you answer|did you hear me|i asked you)\b/

const MAX_CHATTER = 60

export function addChatter(list: string[], text: string): string[] {
  const t = words(text).join(' ')
  return t ? [...list.filter((c) => c !== t), t].slice(-MAX_CHATTER) : list
}

/** Something like what the player said to someone else before (most of the words the same). */
export function isLearnedChatter(text: string, list: string[]): boolean {
  const w = new Set(words(text))
  if (!w.size) return false
  return list.some((c) => {
    const cw = new Set(c.split(' '))
    let same = 0
    for (const x of w) if (cw.has(x)) same++
    return same / Math.max(w.size, cw.size) >= 0.7
  })
}

// ---- Answer etiquette --------------------------------------------------------------------

/** After an answer: it was too long, the player only wanted the main thing. */
export const TOO_LONG = /^(?:that was )?(?:too long|way too long|shorter|shorter please|keep it short|just the (?:price|answer|number|name|map)|only the (?:price|answer|number)|get to the point|less talking|less detail|cut it short|too much)\b/
/** After an answer: read the rest ("tell me more"). */
export const TELL_MORE = /^(?:tell me more|more|go on|and|details|more detail|more details|what else|explain|keep going|anything else|continue|the rest)$/
/** After an answer: it was right ("perfect"). */
export const GOOD_ANSWER = /^(?:perfect|good answer|exactly|thats what i wanted|that is what i wanted|nice one|great answer|spot on|that helps|that helped|helpful|great|nice|good job)$/

/** "Call me Dave" / "my name is Dave" → "Dave"; "don't call me sir" → ""; "call me sir" → "sir". */
export function parseAddress(question: string): string | null {
  const s = words(question).join(' ')
  if (/\b(dont call me sir|do not call me sir|stop calling me sir|stop saying sir|no more sir|dont say sir)\b/.test(s)) return ''
  if (/^(?:please )?call me sir$/.test(s)) return 'sir'
  const m = /^(?:please )?(?:call me|my name is|you can call me) ([a-z]{2,15})$/.exec(s)
  return m ? m[1][0].toUpperCase() + m[1].slice(1) : null
}

/** The topic of a question, in words for a reply ("prices", "routes"). */
const KIND_WORDS: Record<string, string> = { prices: 'prices', routes: 'routes', extracts: 'extract answers', quests: 'quest answers', 'finding things': 'where-to-find answers', 'item collection': 'Item Collection answers', bosses: 'boss answers' }
export const kindWords = (kind: string) => KIND_WORDS[kind] ?? 'answers like that'
