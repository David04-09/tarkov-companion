/**
 * Finding names (maps, places, quests, items) in what the player typed. Plain string work,
 * no model: it runs in well under a millisecond per question and does nothing in between.
 */
import { similarity } from '../maps/overlay/questListMatch'

/** Lower case words: "Where's the Crack-House?" -> ["where", "s", "the", "crack", "house"]. */
export function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** "Crack house" and "Crackhouse" compare equal. */
export const compact = (s: string) => words(s).join('')

export interface NameEntry<T> {
  /** compact() of the name. */
  key: string
  value: T
}

export interface NameHit<T> {
  value: T
  /** Word range in the question. */
  start: number
  end: number
  score: number
  /** How many characters of the question it covers (longer names win). */
  len: number
}

/** The numbers in a name, in order ("signalpart3" → "3"): near misses must keep them exactly. */
const digitsOf = (s: string) => (s.match(/\d+/g) ?? []).join('')

/**
 * Near misses may drop leading digits ("ZB 013" for ZB-1013) but never change them: "Signal part 1"
 * is not "Signal part 3", "dorm 302" is not "dorm 303".
 */
export function sameNumbers(a: string, b: string): boolean {
  const x = digitsOf(a)
  const y = digitsOf(b)
  return x === y || (x.length >= 2 && y.length >= 2 && (x.endsWith(y) || y.endsWith(x)))
}

/** Words that never start or make up a name on their own. */
const FILLER = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'to', 'of', 'is', 'im', 'i', 'me', 'my', 'and', 'or', 'for', 'what', 'where', 'which', 'how', 'do', 'does', 'whats', 'wheres', 'next', 'closest', 'nearest', 'quest', 'task', 'show', 'near', 'by', 'from', 'it', 'its'])

/**
 * Every name from `entries` that appears in the question. Exact (spacing ignored) or, for
 * names of 6+ letters, a near miss (a typo, "dorm" for "dorms"). Overlapping hits keep the best.
 */
export function findNames<T>(question: string[], entries: NameEntry<T>[], maxWords = 7): NameHit<T>[] {
  const exact = new Map<string, T[]>()
  for (const e of entries) {
    const list = exact.get(e.key)
    if (list) list.push(e.value)
    else exact.set(e.key, [e.value])
  }
  const hits: NameHit<T>[] = []
  for (let start = 0; start < question.length; start++) {
    // Names may start with a small word ("The Survivalist Path"), but only exact matches may.
    const fillerStart = FILLER.has(question[start])
    let text = ''
    for (let end = start; end < Math.min(question.length, start + maxWords); end++) {
      text += question[end]
      for (const v of exact.get(text) ?? []) hits.push({ value: v, start, end, score: 1, len: text.length })
      if (fillerStart || text.length < 4) continue
      for (const e of entries) {
        if (e.key === text || Math.abs(e.key.length - text.length) > 2) continue
        // "Signal part 1" is not a typo of "Signal part 3", "Dorm 303" not of "Dorm 302".
        if (!sameNumbers(e.key, text)) continue
        // Singular/plural and one-letter typos for short names; a little more for long ones.
        const s = similarity(text, e.key)
        const need = e.key.length >= 10 ? 0.84 : e.key.length >= 6 ? 0.82 : 0.79
        if (s >= need || (e.key.startsWith(text) && e.key.length - text.length === 1)) hits.push({ value: e.value, start, end, score: Math.max(s, 0.8), len: text.length })
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || b.len - a.len)
  const used = new Set<number>()
  const out: NameHit<T>[] = []
  for (const h of hits) {
    let free = true
    for (let i = h.start; i <= h.end; i++) if (used.has(i)) free = false
    if (!free && !out.some((o) => o.start === h.start && o.end === h.end && o.score === h.score)) continue
    for (let i = h.start; i <= h.end; i++) used.add(i)
    out.push(h)
  }
  return out
}

/** "about 140 m": distances rounded the way people say them. */
export function sayDistance(m: number): string {
  if (m < 15) return 'right there'
  if (m < 100) return `about ${Math.round(m / 5) * 5} metres`
  return `about ${Math.round(m / 10) * 10} metres`
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

/** Compass direction from a screen offset (x right, y down, as the map is drawn). */
export function compassFromScreen(dx: number, dy: number): string {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return COMPASS[((Math.round(deg / 45) % 8) + 8) % 8]
}
