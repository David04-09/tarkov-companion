/**
 * Text as it should be said: room and key numbers digit by digit ("Dorm room 314" → "three one
 * four", the way players say them), codes letter by letter ("ZB-014" → "Z B zero one four").
 * Amounts stay numbers ("about 250 metres", "322,319 roubles", "13 quests"). Both voices read
 * long numbers as "three hundred and fourteen", which the natural voice mangles in key names.
 */
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const digitByDigit = (n: string) => n.split('').map((d) => DIGITS[Number(d)]).join(' ')

/** Words after a number that make it an amount, not a name. */
const UNIT = /^\s*(?:₽|%|roubles?|rubles?|metres?|meters?|m\b|km\b|minutes?|min\b|hours?|h\b|seconds?|s\b|raids?|quests?|spots?|stops?|items?|times?|more|left|of|per|x\b|×|degrees?|levels?|rounds?|kills?|pcs)/i
/** Words before a number that make it an amount. */
const AMOUNT_BEFORE = /(?:about|level|lvl|is|for|pays|costs?|than|at|to|from|of|and|only|over|under|nearly|almost|around|penetration|damage|class)\s*$/i

export function forSpeech(text: string): string {
  return (
    text
      // "ZB-014", "RB-AO", "PP-91": letters spoken one by one.
      .replace(/\b([A-Z]{1,3})-(\d+|[A-Z]{1,3})\b/g, (_, a: string, b: string) => `${a.split('').join(' ')} ${/^\d+$/.test(b) ? (b.length >= 3 || b.startsWith('0') ? digitByDigit(b) : b) : b.split('').join(' ')}`)
      // "314", "0137" in names; amounts keep their number.
      .replace(/(?<![\d,.])\b(\d{3,4}|0\d+)\b(?![\d,.])/g, (n: string, _m: string, at: number, all: string) => {
        if (n.startsWith('0')) return digitByDigit(n)
        if (UNIT.test(all.slice(at + n.length)) || AMOUNT_BEFORE.test(all.slice(0, at))) return n
        return digitByDigit(n)
      })
  )
}
