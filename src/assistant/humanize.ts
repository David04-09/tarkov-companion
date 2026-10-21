/**
 * Talking like a person: the short name people use for an item, "Therapist's" quests, and the
 * polish applied to everything said out loud (contractions, prices rounded the way people say them,
 * an occasional "Sure." in front). Pure; speech.ts and the answers use it.
 */
import { words } from './text'

/** "LEDX Skin Transilluminator" → "the LEDX", "Bottle of Fierce Hatchling moonshine" → "the Moonshine", short names kept as they are. */
export function talkName(it: { name: string; shortName: string }): string {
  const w = words(it.name)
  const short = it.shortName.trim()
  // A short name people would say: a plain word or an all-caps word ("LEDX", "Moonshine"), not a code ("0.2BTC", "GasAn").
  const sayable = /^[A-Za-z][a-z]{2,}$/.test(short) || /^[A-Z]{3,6}$/.test(short)
  if (w.length >= 3 && sayable && words(short).length === 1) return `the ${/^[A-Z]{3,6}$/.test(short) ? short : short.toLowerCase()}`
  return it.name
}

/** "Therapist" → "Therapist's", "Prapor" → "Prapor's". */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

/** "a" or "an" before a word. */
export const article = (word: string) => (/^[aeiou]/i.test(word) && !/^(one|uni|use|eu)/i.test(word) ? 'an' : 'a')

const CONTRACTIONS: [RegExp, string][] = [
  [/\bIt is\b/g, "It's"],
  [/\bit is\b/g, "it's"],
  [/\bThat is\b/g, "That's"],
  [/\bthat is\b/g, "that's"],
  [/\bThere is\b/g, "There's"],
  [/\bthere is\b/g, "there's"],
  [/\bYou are\b/g, "You're"],
  [/\byou are\b/g, "you're"],
  [/\bYou have\b(?= \d| no| nothing)/g, "You've got"],
  [/\bI am\b/g, "I'm"],
  [/\bI will\b/g, "I'll"],
  [/\bI do not\b/g, "I don't"],
  [/\bdo not\b/g, "don't"],
  [/\bdoes not\b/g, "doesn't"],
  [/\bis not\b/g, "isn't"],
  [/\bare not\b/g, "aren't"],
  [/\bcannot\b/g, "can't"],
  [/\bwill not\b/g, "won't"],
]

/** "570,778 ₽" → "about 570 thousand roubles", "1,940,296 ₽" → "about 1.9 million roubles". */
function sayRoubles(text: string): string {
  return text.replace(/(about |around )?([\d,]+) ₽/g, (_, about: string | undefined, n: string) => {
    const v = Number(n.replace(/,/g, ''))
    const lead = about ?? 'about '
    const one = (x: number) => x.toFixed(1).replace(/\.0$/, '')
    if (!Number.isFinite(v)) return `${n} roubles`
    if (v >= 1_000_000) return `${lead}${one(v / 1_000_000)} million roubles`
    if (v >= 10_000) return `${lead}${Math.round(v / 1000)} thousand roubles`
    if (v >= 1000) return `${lead}${one(v / 1000)} thousand roubles`
    return `${about ?? ''}${v} roubles`
  })
}

const OPENERS = ['Sure.', 'Right.', 'Okay.', '', '', '']
let turn = 0

/**
 * What is said out loud: contractions, rounded prices, brackets dropped, and now and then a short
 * opener so it does not sound like a list being read. The text on screen stays exact.
 */
export function naturalSpeech(text: string, opts: { opener?: boolean } = {}): string {
  let s = CONTRACTIONS.reduce((t, [re, to]) => t.replace(re, to), text)
  s = sayRoubles(s)
  s = s.replace(/\s*\([^)]*\)/g, '').replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim()
  if (opts.opener) {
    const o = OPENERS[turn++ % OPENERS.length]
    // No opener in front of a question back or a greeting.
    if (o && !/\?$/.test(s) && !/^(Sorry|Evening|Morning|Afternoon|Yes|No|Got it|Noted|Done|Anytime)/.test(s)) s = `${o} ${s}`
  }
  return s
}

/** How the player wants to be called: "sir" (default), their name, or nothing. */
export function addressed(text: string, address: string): string {
  if (address === 'sir') return text
  if (!address) return text.replace(/,\s*sir\b/gi, '').replace(/\bsir,\s*/gi, '').replace(/\s+sir\b/gi, '')
  return text.replace(/\bsir\b/g, address)
}
