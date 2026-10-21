/**
 * Understanding plain English: when the assistant's own rules do not understand a question, its
 * meaning is compared (with the small paraphrase model, nlu.worker.ts) to everyday ways of asking
 * each question the assistant knows. The closest one, if close enough, is asked instead, with the
 * names from the question put in ("yo what's a LEDX going for" → "how much is LEDX worth").
 * Everything here but the model call is pure, so it is tested without the model.
 */
import type { Slot } from './engine'

export interface Template {
  /** The question the assistant understands, with {item}, {place}, {map}, {quest}, {boss}, {n}. */
  ask: string
  /** Everyday ways of asking it, names written as the plain words item / place / map / quest / boss. */
  say: string[]
}

export const TEMPLATES: Template[] = [
  { ask: 'how much is {item} worth', say: ['how much is the item worth', 'how much is the item going for', 'what is item going for', 'yo how much is item', 'how much do i get for the item', 'what does the item sell for', 'what is the item going for', 'item price', 'how much money is the item', 'what can i get for the item', 'is the item expensive', 'what is the value of the item', 'how much does the item cost', 'what does item go for these days', 'how many roubles for the item'] },
  { ask: 'where can i find {item}', say: ['where can i find the item', 'where does the item spawn', 'where do i get the item', 'where to look for the item', 'how do i get the item', 'where is the item usually', 'best place to find the item', 'where do i loot the item', 'where can i buy the item'] },
  { ask: 'how many {item} do i still need', say: ['do i need the item', 'how many item do i need', 'is the item needed for anything', 'do i still need the item', 'how many more item', 'how many item are left to find'] },
  { ask: 'what is {item} for', say: ['what is the item used for', 'what do i use the item for', 'what is the item good for', 'which quests need the item', 'what is the item', 'tell me about the item'] },
  { ask: 'should i keep {item}', say: ['should i keep or sell the item', 'is the item worth keeping', 'can i sell the item', 'should i sell the item', 'is the item junk', 'do i stash the item'] },
  { ask: 'add {n} {item}', say: ['i found an item', 'i just picked up an item', 'i got an item', 'put an item in my collection', 'i looted an item', 'count an item'] },
  { ask: 'best ammo for {item}', say: ['what ammo should i use in the item', 'best bullets for the item', 'what should i load in the item', 'which rounds for the item', 'good ammo for the item'] },
  { ask: 'extracts on {map}', say: ['how do i get out of the map', 'where can i leave the map', 'exits on the map', 'where do i extract on the map', 'way out of the map', 'extracts for the map'] },
  { ask: 'extracts', say: ['where do i extract', 'how do i get out', 'where is the exit', 'how do i leave', 'where can i get out of here'] },
  { ask: 'where is {place}', say: ['show me the place', 'where can i find the place', 'where is the place at', 'find the place', 'where is place located'] },
  { ask: 'how do i get to {place}', say: ['how do i get to the place', 'take me to the place', 'walk me to the place', 'fastest way to the place', 'path to the place', 'how do i reach the place', 'guide me to the place'] },
  { ask: 'what is the closest quest', say: ['what quest is near me', 'anything to do nearby', 'what can i do around here', 'nearest task', 'which quest is closest'] },
  { ask: 'quests on {map}', say: ['what can i do on the map', 'what quests are on the map', 'tasks for the map', 'which quests can i do on the map', 'what is there to do on the map'] },
  { ask: 'how do i do {quest}', say: ['how do i finish the quest', 'what do i need for the quest', 'help me with the quest', 'what is the quest about', 'explain the quest', 'how do i complete the quest', 'walk me through the quest'] },
  { ask: 'what does {quest} unlock', say: ['what comes after the quest', 'what does the quest lead to', 'what opens after the quest', 'next quest after the quest'] },
  { ask: 'what keys do i need for {quest}', say: ['which keys for the quest', 'do i need a key for the quest', 'what key opens the quest door'] },
  { ask: 'mark {quest} as done', say: ['i finished the quest', 'i completed the quest', 'the quest is done', 'tick off the quest', 'i handed in the quest'] },
  { ask: 'bosses on {map}', say: ['who is the boss on the map', 'which bosses spawn on the map', 'is there a boss on the map', 'boss on the map', 'who is on the map', 'who spawns on the map', 'who runs around on the map', 'which bosses roam the map', 'who is dangerous on the map'] },
  { ask: 'where does {boss} spawn', say: ['where can i find the boss', 'where is the boss', 'where does the boss hang out', 'which map is the boss on', 'where do i find the boss'] },
  { ask: 'where are the goons', say: ['where are the goons right now', 'which map are the goons on', 'where did the goons spawn today'] },
  { ask: 'how long is left', say: ['how much time do i have', 'when does the raid end', 'how many minutes are left', 'raid timer', 'how long until the raid ends'] },
  { ask: 'what time is it in tarkov', say: ['is it day or night', 'what time is it in game', 'tarkov clock', 'is it dark in tarkov'] },
  { ask: 'where am i', say: ['what is my location', 'where am i on the map', 'where am i right now', 'i am lost'] },
  { ask: 'what should i loot', say: ['what should i pick up', 'what items do i need', 'what do i need to find', 'what should i look for', 'shopping list'] },
  { ask: 'what should i loot on {map}', say: ['what should i pick up on the map', 'what do i need from the map', 'what items should i grab on the map'] },
  { ask: 'loot near {place}', say: ['what loot is at the place', 'is there loot at the place', 'what is at the place', 'containers at the place', 'is the place worth looting'] },
  { ask: 'minefields on {map}', say: ['where are the mines on the map', 'is the map dangerous', 'snipers on the map', 'dangers on the map', 'where should i not walk on the map'] },
  { ask: 'when do traders restock', say: ['when do the traders reset', 'when is the next restock', 'trader reset timer', 'when do traders refresh'] },
  { ask: 'when can i scav', say: ['is my scav ready', 'how long until i can scav', 'scav cooldown', 'can i play scav'] },
  { ask: 'what did i hand in today', say: ['what quests did i finish today', 'what did i complete today', 'quests done today'] },
  { ask: 'my stats', say: ['how am i doing', 'what is my survival rate', 'how many raids have i done', 'how good am i', 'my record'] },
  { ask: 'what should i play tonight', say: ['which map should i play', 'what map should i run', 'where should i raid', 'what should i do now', 'suggest a map', 'what should i do next'] },
  { ask: 'my progress', say: ['what level am i', 'how far am i', 'how much is left for kappa', 'how many quests have i done'] },
  { ask: 'what do you know about me', say: ['what have you learned about me', 'what do you remember about me', 'tell me what you know about me'] },
  { ask: 'help', say: ['what can you do', 'what can i ask you', 'how do you work', 'what do you know'] },
]

const SLOT_RE = /\{(item|place|map|quest|boss|n)\}/g

export const slotsOf = (ask: string) => [...ask.matchAll(SLOT_RE)].map((m) => m[1]).filter((s) => s !== 'n') as Slot[]

/** Every example sentence, with the template it belongs to (embedded once). */
export const EXAMPLES = TEMPLATES.flatMap((t, i) => t.say.map((text) => ({ text, template: i })))

/** How close in meaning (cosine; vectors have length 1). */
export function closeness(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Closer than this counts as "the same question". Measured on everyday phrasings (understand.test). */
export const SAME_MEANING = 0.62

/**
 * The question to ask instead: the closest template whose names are all in the question.
 * `vectors` are the EXAMPLES' embeddings, in order.
 */
export function pickTemplate(qVec: Float32Array, vectors: Float32Array[], slots: Partial<Record<Slot, string>>, said: string, need = SAME_MEANING): { ask: string; score: number; slots: number } | null {
  const best = new Map<number, number>()
  EXAMPLES.forEach((ex, i) => {
    const s = closeness(qVec, vectors[i])
    if (s > (best.get(ex.template) ?? -1)) best.set(ex.template, s)
  })
  const ranked = [...best.entries()].sort((a, b) => b[1] - a[1])
  for (const [i, score] of ranked) {
    if (score < need) return null
    const t = TEMPLATES[i]
    if (!slotsOf(t.ask).every((s) => slots[s])) continue
    const n = /\b(\d+)\b/.exec(said)?.[1] ?? '1'
    return { ask: t.ask.replace(SLOT_RE, (_, s: string) => (s === 'n' ? n : (slots[s as Slot] ?? ''))), score, slots: slotsOf(t.ask).length }
  }
  return null
}
