/**
 * Turning what the speech recogniser hears into text the assistant understands, and the word
 * list it is allowed to hear. Pure, so it can be tested.
 */
import { words } from './text'

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

/** "z b ten thirteen" -> "zb 1013" style: spoken numbers become digits, spelled letters join up. */
/**
 * Acronyms the speech model has no word for come out as other words ("GPU" -> "gp you").
 * Each is listed the ways it is heard, longest first.
 */
const ACRONYMS: [RegExp, string][] = [
  [/\b(g p you|gp you|g p u|gee pee you|g pu)\b/g, 'gpu'],
  [/\b(led x|l e d x|ledex|led ex|let x)\b/g, 'ledx'],
  [/\b(f i r|f ir)\b/g, 'fir'],
  [/\bm four\b/g, 'm4'],
  [/\b(s a s|s as)\b/g, 'sas'],
  [/\b(a k|ak) (seventy four|74)\b/g, 'ak74'],
  [/\b(v p o)\b/g, 'vpo'],
  [/\b(s v d)\b/g, 'svd'],
  [/\b(m p five|mp five)\b/g, 'mp5'],
  [/\b(r b|r be) (k s m)\b/g, 'rb ksm'],
]

/**
 * Tarkov words a general speech model writes as ordinary English (tested with Moonshine on
 * noisy, headset-like audio): "Alexa" for LEDX, "Shelleys" for Chalets, "Tetris" for Tetriz.
 */
const TARKOV_WORDS: [RegExp, string][] = [
  [/\b(alexa|a lexa|ledex|led ex|lex)\b/g, 'ledx'],
  [/\b(?:a )?lexworth\b/g, 'ledx worth'],
  [/\b(shelleys|shellies|shelly's|shelley's|chalet's|shalets|shallays)\b/g, 'chalets'],
  [/\btetris\b/g, 'tetriz'],
  [/\b(gpus|gp us)\b/g, 'gpu'],
  [/\b(dorm's|doors)\b(?= (?:room|\d))/g, 'dorm'],
  [/\bbitcoins?\b/g, 'bitcoin'],
]

/** How letters are heard when spelled out ("see pee you" = CPU, "gee pee you" = GPU). */
const LETTER_SOUNDS: Record<string, string> = {
  ay: 'a', eh: 'a', be: 'b', bee: 'b', see: 'c', sea: 'c', cee: 'c', si: 'c', dee: 'd', de: 'd', ee: 'e', ef: 'f', eff: 'f',
  gee: 'g', jee: 'g', ji: 'g', aitch: 'h', eich: 'h', eye: 'i', aye: 'i', jay: 'j', kay: 'k', el: 'l', ell: 'l', em: 'm', en: 'n',
  oh: 'o', pee: 'p', pea: 'p', pe: 'p', queue: 'q', cue: 'q', are: 'r', ar: 'r', es: 's', ess: 's', tee: 't', tea: 't',
  you: 'u', yu: 'u', vee: 'v', ve: 'v', ex: 'x', ecks: 'x', why: 'y', wye: 'y', zed: 'z', zee: 'z',
}
/** Letter sounds that are also everyday words: a run made only of these is a sentence, not an acronym ("why are you"). */
const WORD_LIKE = new Set(['a', 'i', 'you', 'are', 'see', 'sea', 'why', 'oh', 'be', 'eye', 'tea', 'queue', 'cue', 'aye', 'ex', 'el', 'em', 'en', 'es', 'ar', 'de', 'si', 'pe', 've'])

/** The letters a heard word stands for: a single letter, a letter's sound, or a short letter chunk with no vowel ("gp"). */
function lettersOf(word: string): string | null {
  if (/^[a-z]$/.test(word)) return word
  if (LETTER_SOUNDS[word]) return LETTER_SOUNDS[word]
  if (/^[b-df-hj-np-tv-z]{2,3}$/.test(word)) return word
  return null
}

/**
 * Spelled-out abbreviations back to the abbreviation, for the abbreviations the game uses
 * (`acronyms`: short names such as "gpu", "cpu", "ledx", lower case): "g p u", "gee pee you",
 * "gp you" → "gpu"; "see pee you" → "cpu". Only runs that make a known abbreviation change.
 */
export function acronymize(text: string, acronyms: Set<string>): string {
  const w = text.split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < w.length; ) {
    let done = false
    for (let len = Math.min(8, w.length - i); len >= 2 && !done; len--) {
      const run = w.slice(i, i + len)
      // "double you" = W.
      const parts: string[] = []
      for (let k = 0; k < run.length; k++) {
        if (run[k] === 'double' && (run[k + 1] === 'you' || run[k + 1] === 'u')) {
          parts.push('w')
          k++
        } else parts.push(lettersOf(run[k]) ?? '#')
      }
      const joined = parts.join('')
      if (joined.includes('#') || joined.length < 2 || !acronyms.has(joined)) continue
      if (run.every((x) => WORD_LIKE.has(x))) continue
      if (joined.length === 2 && !run.every((x) => x.length === 1)) continue
      out.push(joined)
      i += len
      done = true
    }
    if (!done) out.push(w[i++])
  }
  return out.join(' ')
}

/** Free-form text from the speech model (capitals, punctuation, "5", "314") to question text. */
export function writtenToText(heard: string): string {
  const plain = ` ${heard.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ')} `
  return spokenToText(TARKOV_WORDS.reduce((t, [re, to]) => t.replace(re, to), plain).trim())
}

export function spokenToText(heard: string): string {
  heard = ACRONYMS.reduce((t, [re, to]) => t.replace(re, to), ` ${heard.toLowerCase()} `).trim()
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
    // "six hundred fifty" -> 650, "three hundred three" -> 303.
    if (word === 'hundred' && prev !== undefined && /^[1-9]$/.test(prev)) {
      let value = Number(prev) * 100
      const a = w[i + 1]
      const b = w[i + 2]
      if (a && TENS.indexOf(a) >= 2) {
        value += TENS.indexOf(a) * 10
        i++
        if (b && UNITS.indexOf(b) > 0 && UNITS.indexOf(b) < 10) {
          value += UNITS.indexOf(b)
          i++
        }
      } else if (a && UNITS.indexOf(a) > 0) {
        value += UNITS.indexOf(a)
        i++
      }
      out[out.length - 1] = String(value)
      continue
    }
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
export const COMMAND_WORDS = `i im i'm am at in on near by from to the a an and of is are my me it what whats what's where wheres where's which how do does did get go
route path way take guide walk head run show find locate closest nearest next close quest quests task tasks objective objectives extract extracts exit exits
spawned spawn spawned standing currently am here there map maps help hello hi progress level kappa price worth cost sell buy need needed for key keys open opens
mark tick finished completed complete done untick not undo build me gun weapon item items about tell can you please stop thanks thank
yes yeah yep approve approved accept accepted confirm sure okay ok go ahead no nope cancel never mind collected picked up found used sold add added
that's that all it's thank thanks you stop listening goodbye bye hey g p u led x
long left time much many tarkov night day boss bosses goons loot safes safe jackets drawers containers minefields minefield mines snipers sniper hazards locked doors door
ammo rounds round class armor armour keep stash should unlock unlocks restock restocks scav stats raids raid today hand handed remember forget know short detail
tonight play best safest side north south east west then collection value draw spot loose why when who will`.split(/\s+/)

/** Every word the recogniser may hear: command words, numbers, letters and the words of every known name. */
export function voiceVocabulary(names: string[]): string[] {
  const set = new Set<string>([...COMMAND_WORDS, ...UNITS, ...TENS.filter(Boolean), 'oh', 'hundred', ...LETTERS])
  for (const name of names) for (const word of words(name)) if (/^[a-z]+$/.test(word) && word.length <= 20) set.add(word)
  return [...set].sort()
}
