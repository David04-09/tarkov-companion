/**
 * Text handling for the Kitten TTS voice, as in Kitten's reference code: the symbol table of its
 * TextCleaner and the "basic English tokenize" step. Pure, so it can be tested.
 */

const PAD = '$'
const PUNCTUATION = ';:,.!?¡¿—…"«»"" '
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const LETTERS_IPA = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"

const SYMBOLS = [PAD, ...PUNCTUATION, ...LETTERS, ...LETTERS_IPA]
const INDEX = new Map<string, number>()
// Python's dict keeps the last index for a repeated symbol (the quote characters appear twice).
SYMBOLS.forEach((s, i) => INDEX.set(s, i))

/** Python's re.findall(r"\w+|[^\w\s]") on phonemes: runs of word characters, or one other non-space character. */
export function basicTokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}\p{M}_]+|[^\p{L}\p{N}\p{M}_\s]/gu) ?? []
}

/** Model input ids for a phoneme string: [0, ...symbols, 10, 0]; unknown characters are dropped. */
export function kittenIds(phonemeText: string): number[] {
  const joined = basicTokenize(phonemeText).join(' ')
  const ids: number[] = [0]
  for (const ch of joined) {
    const i = INDEX.get(ch)
    if (i !== undefined) ids.push(i)
  }
  ids.push(10, 0)
  return ids
}

/** Text cut into word runs and punctuation, so punctuation can be kept as it is (espeak drops it). */
export function splitForSpeech(text: string): { text: string; punct: boolean }[] {
  const clean = text.replace(/₽/g, ' roubles').replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim()
  const out: { text: string; punct: boolean }[] = []
  for (const m of clean.matchAll(/([;:,.!?¡¿…"«»“”]+)|([^;:,.!?¡¿…"«»“”]+)/g)) {
    const t = m[0].trim()
    if (t) out.push({ text: t, punct: Boolean(m[1]) })
  }
  return out
}
