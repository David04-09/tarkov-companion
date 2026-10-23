/**
 * Answering like a person: the short name people use for an item, "Therapist's" quests, and how
 * the player wants to be called. Pure; the answers use it.
 */
import { words } from './text'

/** "LEDX Skin Transilluminator" → "the LEDX", "Bottle of Fierce Hatchling moonshine" → "the Moonshine", short names kept as they are. */
export function talkName(it: { name: string; shortName: string }): string {
  const w = words(it.name)
  const short = it.shortName.trim()
  // A short name people would say: a plain word or an all-caps word ("LEDX", "Moonshine"), not a code ("0.2BTC", "GasAn").
  const sayable = /^[A-Za-z][a-z]{2,}$/.test(short) || /^[A-Z]{3,6}$/.test(short)
  // Keys keep the word ("the factory key", not "the factory").
  const kind = /\bkeycard$/i.test(it.name) ? ' keycard' : /\bkey$/i.test(it.name) ? ' key' : ''
  if (w.length >= 3 && sayable && words(short).length === 1) return `the ${/^[A-Z]{3,6}$/.test(short) ? short : short.toLowerCase()}${kind}`
  return it.name
}

/** "Therapist" → "Therapist's", "Prapor" → "Prapor's". */
export const possessive = (name: string) => (/s$/i.test(name) ? `${name}'` : `${name}'s`)

/** "a" or "an" before a word. */
export const article = (word: string) => (/^[aeiou]/i.test(word) && !/^(one|uni|use|eu)/i.test(word) ? 'an' : 'a')

/** How the player wants to be called: "sir" (default), their name, or nothing. */
export function addressed(text: string, address: string): string {
  if (address === 'sir') return text
  if (!address) return text.replace(/,\s*sir\b/gi, '').replace(/\bsir,\s*/gi, '').replace(/\s+sir\b/gi, '')
  return text.replace(/\bsir\b/g, address)
}
