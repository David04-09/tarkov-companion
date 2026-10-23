/**
 * Follow-up questions, the way people ask them: "how much is it worth" right after the LEDX, "and
 * on Woods?" right after Customs' extracts. Works on the questions with their names swapped for
 * plain words (engine `nameSlots`): "extracts on map" + {map: Customs}. Pure.
 */
import type { Slot } from './engine'
import { words } from './text'

export interface Slotted {
  masked: string
  slots: Partial<Record<Slot, string>>
}

const SLOT_ORDER: Slot[] = ['item', 'quest', 'place', 'boss', 'map']
const PRONOUN = /\b(it|that|this|them|those|one|that one|this one)\b/
const ADD_ON = /^(?:and|and what about|what about|how about|same for|same on|same thing for|now|then|ok and|okay and)\b/
/** "it" that is not a thing: "what time is it", "is it night", "that's it". */
const NOT_A_THING = /\b(time is it|time it is|is it (day|night|dark|light|morning|evening|raining|over)|thats it|that is it|it is (day|night|dark|light))\b/

/** The question to answer instead, or null when it is not a follow-up. */
export function followUp(question: string, cur: Slotted, prev: Slotted | null): string | null {
  if (!prev) return null
  const said = words(question).join(' ')
  const curTypes = Object.keys(cur.slots) as Slot[]
  const prevTypes = SLOT_ORDER.filter((t) => prev.slots[t])
  if (!prevTypes.length) return null

  // "And on Woods?" / "what about the LEDX?": the last question again, with the new name in.
  if (ADD_ON.test(said) && curTypes.length) {
    const rest = words(cur.masked).filter((w) => !['and', 'what', 'about', 'how', 'same', 'for', 'on', 'the', 'a', 'an', 'now', 'then', 'ok', 'okay', 'thing', 'in', 'at', 'of'].includes(w) && !SLOT_ORDER.includes(w as Slot))
    if (rest.length <= 1 && curTypes.every((t) => prev.slots[t])) {
      return words(prev.masked)
        .map((w) => (SLOT_ORDER.includes(w as Slot) ? (cur.slots[w as Slot] ?? prev.slots[w as Slot] ?? w) : w))
        .join(' ')
    }
  }

  // "How much is it worth?" / "where can I find that?": the thing just talked about.
  if (PRONOUN.test(said) && !NOT_A_THING.test(said) && !curTypes.some((t) => t !== 'map')) {
    const thing = SLOT_ORDER.filter((t) => t !== 'map').map((t) => prev.slots[t]).find(Boolean)
    if (thing) return said.replace(/^(?:and|ok and|okay and|so) /, '').replace(PRONOUN, thing)
  }
  return null
}
