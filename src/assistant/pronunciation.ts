/**
 * Learning how the player says things. Every spoken question the assistant understood only after
 * fixing a name ("ledi" → LEDX, "shalets" → Chalets) is remembered: the same mishearing twice and
 * it is fixed straight away from then on, and letters the speech model keeps getting wrong for
 * this player ("f" heard for "th", "i" for "x") become swaps tried on words it does not know.
 * The speech model itself is not changed (that would need training data and a GPU); this is a
 * small correction layer in front of it. Pure; kept in the assistant memory store.
 */
import { similarity } from '../maps/overlay/questListMatch'
import { soundKey } from './phonetic'
import { words } from './text'

export interface HeardFix {
  /** What it turned out to mean. */
  to: string
  /** How often it was heard so and meant this. */
  n: number
  at: number
}

export interface Pronunciation {
  /** Heard phrase (lower case words) → what was meant. */
  phrases: Record<string, HeardFix>
  /** Letter swaps "heard>meant" ("f>th") → how often seen. */
  sounds: Record<string, number>
}

export const emptyPronunciation = (): Pronunciation => ({ phrases: {}, sounds: {} })

/** A fix is used straight away once seen this often (taught ones count double). */
export const PHRASE_SURE = 2
/** A letter swap is tried once seen this often. */
export const SOUND_SURE = 3
const MAX_PHRASES = 300
const MAX_SOUNDS = 120

/** The letters that differ between a heard word and the meant one ("fing"/"thing" → "f>th"), or null when they differ too much. */
export function letterSwap(heard: string, meant: string): string | null {
  if (heard === meant) return null
  let a = 0
  while (a < heard.length && a < meant.length && heard[a] === meant[a]) a++
  let b = 0
  while (b < heard.length - a && b < meant.length - a && heard[heard.length - 1 - b] === meant[meant.length - 1 - b]) b++
  const h = heard.slice(a, heard.length - b)
  const m = meant.slice(a, meant.length - b)
  // Only small swaps say something about how letters sound; a different word is not one.
  if (h.length > 2 || m.length > 2 || (!h && !m) || a + b < 2) return null
  return `${h}>${m}`
}

/** Remembers that `heard` meant `meant` (weight 2 when the player taught it). */
export function learnHeard(p: Pronunciation, heard: string, meant: string, at: number, weight = 1): Pronunciation {
  const key = words(heard).join(' ')
  const to = meant.trim()
  if (!key || key === words(to).join(' ')) return p
  const old = p.phrases[key]
  const phrases = { ...p.phrases, [key]: { to, n: old && old.to === to ? old.n + weight : weight, at } }
  const keys = Object.keys(phrases)
  if (keys.length > MAX_PHRASES) {
    const oldest = keys.sort((x, y) => phrases[x].at - phrases[y].at).slice(0, keys.length - MAX_PHRASES)
    for (const k of oldest) delete phrases[k]
  }
  // Letter swaps, from words in the same place ("shalets" ~ "chalets").
  const hw = key.split(' ')
  const mw = words(to)
  const sounds = { ...p.sounds }
  if (hw.length === mw.length) {
    for (let i = 0; i < hw.length; i++) {
      const swap = letterSwap(hw[i], mw[i])
      if (swap) sounds[swap] = (sounds[swap] ?? 0) + 1
    }
  }
  const soundKeys = Object.keys(sounds)
  if (soundKeys.length > MAX_SOUNDS) for (const k of soundKeys.sort((x, y) => sounds[x] - sounds[y]).slice(0, soundKeys.length - MAX_SOUNDS)) delete sounds[k]
  return { phrases, sounds }
}

/**
 * Applies what was learned, before names are matched: phrases heard so often enough, then the
 * player's letter swaps on words that are not known (`known`: words of every game name and
 * everyday word), kept only when the swap makes a known word.
 */
export function applyHeard(text: string, p: Pronunciation, known: (word: string) => boolean): { text: string; used: string[] } {
  const w = words(text)
  if (!w.length) return { text, used: [] }
  const used: string[] = []
  const out: string[] = []
  for (let i = 0; i < w.length; ) {
    let hit = false
    for (let len = Math.min(4, w.length - i); len >= 1 && !hit; len--) {
      const key = w.slice(i, i + len).join(' ')
      const fix = p.phrases[key]
      if (fix && fix.n >= PHRASE_SURE) {
        out.push(...words(fix.to))
        used.push(key)
        i += len
        hit = true
      }
    }
    if (!hit) out.push(w[i++])
  }
  const swaps = Object.entries(p.sounds)
    .filter(([, n]) => n >= SOUND_SURE)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k.split('>') as [string, string])
  if (swaps.length) {
    for (let i = 0; i < out.length; i++) {
      const word = out[i]
      if (word.length < 3 || known(word) || /\d/.test(word)) continue
      for (const [from, to] of swaps) {
        if (!from || !word.includes(from)) continue
        const fixed = word.replace(from, to)
        if (known(fixed)) {
          used.push(`${word}>${fixed}`)
          out[i] = fixed
          break
        }
      }
    }
  }
  return { text: used.length ? out.join(' ') : text, used }
}

/** How long after a question it did not understand a repeat still counts as the same question. */
export const REPEAT_WINDOW_MS = 30_000

/**
 * The player said it again because it was not understood: the words that changed between the two
 * tries are what the first try meant ("how much is the leddy" … "how much is the ledx" → "leddy"
 * means "ledx"). Only a sound-alike change counts, so a different question is never learned.
 */
export function repeatFix(before: string, after: string): { heard: string; meant: string } | null {
  const a = words(before)
  const b = words(after)
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  const heard = a.slice(p, a.length - q)
  const meant = b.slice(p, b.length - q)
  if (!heard.length || !meant.length || heard.length > 4 || meant.length > 4) return null
  // Mostly the same sentence (or a short one said again), with a part that sounds alike.
  const same = p + q
  if (same < Math.min(a.length, b.length) / 2 && Math.max(a.length, b.length) > 3) return null
  const h = heard.join('')
  const m = meant.join('')
  if (similarity(h, m) < 0.4 && similarity(soundKey(h), soundKey(m)) < 0.45) return null
  return { heard: heard.join(' '), meant: meant.join(' ') }
}

export function isPronunciation(v: unknown): v is Pronunciation {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return !!o.phrases && typeof o.phrases === 'object' && !!o.sounds && typeof o.sounds === 'object'
}
