/**
 * Turning what the speech recogniser hears into text the assistant understands, and the word
 * list it is allowed to hear. Pure, so it can be tested.
 */
import { words } from './text'

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

/** "z b ten thirteen" -> "zb 1013" style: spoken numbers become digits, spelled letters join up. */
export function spokenToText(heard: string): string {
  const w = heard.toLowerCase().split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < w.length; i++) {
    const word = w[i]
    let n: number | null = null
    if (word === 'oh' && out.length && /\d$/.test(out[out.length - 1])) n = 0
    else if (UNITS.includes(word)) n = UNITS.indexOf(word)
    else if (TENS.includes(word) && word) {
      n = TENS.indexOf(word) * 10
      const next = w[i + 1]
      if (next && UNITS.indexOf(next) > 0 && UNITS.indexOf(next) < 10) {
        n += UNITS.indexOf(next)
        i++
      }
    }
    const prev = out[out.length - 1]
    if (n !== null) {
      // Digits said one after another belong to one number ("zero one three" -> 013).
      if (prev !== undefined && /^\d+$/.test(prev)) out[out.length - 1] = prev + String(n)
      else out.push(String(n))
    } else if (word.length === 1 && LETTERS.includes(word) && word !== 'a' && word !== 'i' && prev !== undefined && /^[a-z]+$/.test(prev) && prev.length <= 3 && w[i - 1]?.length === 1) {
      out[out.length - 1] = prev + word
    } else out.push(word)
  }
  return out.join(' ')
}

/** Words the assistant's questions are made of (the recogniser picks only from these, which makes it far more accurate). */
const COMMAND_WORDS = `i im i'm am at in on near by from to the a an and of is are my me it what whats what's where wheres where's which how do does did get go
route path way take guide walk head run show find locate closest nearest next close quest quests task tasks objective objectives extract extracts exit exits
spawned spawn spawned standing currently am here there map maps help hello hi progress level kappa price worth cost sell buy need needed for key keys open opens
mark tick finished completed complete done untick not undo build me gun weapon item items about tell can you please stop thanks thank`.split(/\s+/)

/** Every word the recogniser may hear: command words, numbers, letters and the words of every known name. */
export function voiceVocabulary(names: string[]): string[] {
  const set = new Set<string>([...COMMAND_WORDS, ...UNITS, ...TENS.filter(Boolean), 'oh', 'hundred', ...LETTERS])
  for (const name of names) for (const word of words(name)) if (/^[a-z]+$/.test(word) && word.length <= 20) set.add(word)
  return [...set].sort()
}
