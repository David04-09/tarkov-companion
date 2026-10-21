/**
 * Fixing game names a general speech model writes as English words: "pox a ram" → Poxeram,
 * "tetris" → Tetriz, "salewa" heard as "sally wah". Every run of 1–4 spoken words is compared by
 * how it SOUNDS (a simple English sound key) with the app's own names (items, quests, places,
 * maps, traders, bosses); a close enough match takes its place. Only runs on spoken questions.
 */
import { similarity } from '../maps/overlay/questListMatch'
import { COMMAND_WORDS } from './spoken'
import { compact, words } from './text'

/** Rough sound of an English spelling: "poxeram", "pox a ram" and "poks a rum" all give "pksrm"-like keys. */
export function soundKey(s: string): string {
  // Word endings first: "-tle" sounds "-tal" (propitle ≈ propital), silent b/l ("bomb" ≈ "balm").
  let t = words(s)
    .map((w) => w.replace(/([bcdfgkpstz])le$/, '$1al').replace(/mb$/, 'm').replace(/lm$/, 'm'))
    .join('')
  if (!t) return ''
  t = t
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/dg/g, 'j')
    .replace(/wh/g, 'w')
    .replace(/^kn/, 'n')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/v/g, 'f')
    .replace(/y/g, 'i')
  const first = t[0]
  // Vowels carry little: keep only where they are (as one "a"), so "pox a ram" ≈ "poxeram".
  const body = t.slice(1).replace(/[aeiou]+/g, 'a').replace(/h/g, '').replace(/(.)\1+/g, '$1')
  return (/[aeiou]/.test(first) ? 'a' : first) + body
}

export interface SoundName {
  /** How it is written in the app ("Poxeram cocktail"). */
  name: string
  key: string
  compact: string
  words: number
}

/** Everyday and command words: never swapped for a name, and a run of words may not start or end with one. */
const COMMON = new Set([
  ...'a an the i im me my you your it is are was be to of in on at for and or but with that this what whats where wheres when how much many do does did can could should would will there here have has had about from into by up so if not no yes please just also get go got find show tell need needs needed still left price cost worth value sell buy key keys quest quests map maps extract extracts route path way loot spawn spawns best good bad near closest nearest next one two three four five six seven eight nine ten room door gas station water bottle box case bag'.split(' '),
  ...COMMAND_WORDS.map((w) => w.replace(/'/g, '')),
])

/** Names worth listening for: ones a speech model would not already write right (not plain English words). */
export function buildSoundNames(names: string[]): SoundName[] {
  const seen = new Set<string>()
  const out: SoundName[] = []
  for (const name of names) {
    const c = compact(name)
    const w = words(name)
    if (c.length < 4 || w.length > 4 || seen.has(c) || w.every((x) => COMMON.has(x))) continue
    seen.add(c)
    out.push({ name, key: soundKey(name), compact: c, words: w.length })
  }
  return out
}

/** How close two sound keys are (0..1); the first sound must agree. */
function soundMatch(a: string, b: string): number {
  if (!a || !b || a[0] !== b[0] || Math.abs(a.length - b.length) > 2) return 0
  return similarity(a, b)
}

const SOUND_NEED = 0.86
const SPELL_NEED = 0.55
const SPELL_NEED_SAME_SOUND = 0.4

/**
 * Replaces runs of spoken words that sound like a known name by that name. Exact names and
 * plain English runs are left alone; longer runs win, then closer sounds.
 */
export function snapToNames(text: string, names: SoundName[]): { text: string; fixed: { heard: string; name: string }[] } {
  const w = words(text)
  if (!w.length || !names.length) return { text, fixed: [] }
  const exact = new Set(names.map((n) => n.compact))
  const byFirst = new Map<string, SoundName[]>()
  for (const n of names) {
    const list = byFirst.get(n.key[0])
    if (list) list.push(n)
    else byFirst.set(n.key[0], [n])
  }
  const hits: { start: number; end: number; name: SoundName; score: number }[] = []
  for (let start = 0; start < w.length; start++) {
    for (let end = start; end < Math.min(w.length, start + 4); end++) {
      const run = w.slice(start, end + 1)
      const c = run.join('')
      // Already a name, too short to tell, or nothing but everyday words ("how much").
      if (exact.has(c) || c.length < 5 || run.every((x) => COMMON.has(x)) || COMMON.has(run[0]) || COMMON.has(run[run.length - 1])) continue
      const key = soundKey(c)
      for (const n of byFirst.get(key[0]) ?? []) {
        const s = soundMatch(key, n.key)
        // Sounding exactly the same allows a looser spelling ("annuljan" = Analgin).
        if (s < SOUND_NEED || similarity(c, n.compact) < (s === 1 ? SPELL_NEED_SAME_SOUND : SPELL_NEED)) continue
        hits.push({ start, end, name: n, score: s + (end - start) * 0.02 })
      }
    }
  }
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || b.score - a.score)
  const used = new Set<number>()
  const chosen: typeof hits = []
  for (const h of hits) {
    let free = true
    for (let i = h.start; i <= h.end; i++) if (used.has(i)) free = false
    if (!free) continue
    for (let i = h.start; i <= h.end; i++) used.add(i)
    chosen.push(h)
  }
  if (!chosen.length) return { text, fixed: [] }
  chosen.sort((a, b) => a.start - b.start)
  const out: string[] = []
  const fixed: { heard: string; name: string }[] = []
  let i = 0
  for (const h of chosen) {
    out.push(...w.slice(i, h.start))
    out.push(...words(h.name.name))
    fixed.push({ heard: w.slice(h.start, h.end + 1).join(' '), name: h.name.name })
    i = h.end + 1
  }
  out.push(...w.slice(i))
  return { text: out.join(' '), fixed }
}
