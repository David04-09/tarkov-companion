import { describe, expect, it } from 'vitest'
import {
  addNote,
  applyWords,
  askKind,
  asksAboutOwn,
  emptyHabits,
  findNote,
  firstSentence,
  FORGET_ALL,
  greetingText,
  learnWord,
  parseMeant,
  parseRemember,
  parseStyle,
  parseTeach,
  recordRaid,
  recordResult,
  subjectOf,
  survivalText,
  topMaps,
  wantsShort,
  whenYouPlay,
} from './memory'
import { words } from './text'

describe('notes', () => {
  it('takes what to remember in the player\'s own words', () => {
    expect(parseRemember('Remember that I keep the 314 key in my case')).toBe('I keep the 314 key in my case')
    expect(parseRemember("Don't let me forget: sell the LEDX before the wipe")).toBe('sell the LEDX before the wipe')
    expect(parseRemember('note to self buy more wires')).toBe('buy more wires')
    expect(parseRemember('do you remember the extracts')).toBeNull()
    expect(parseRemember('remember that')).toBeNull()
  })

  it('finds the note a question is about', () => {
    let notes = addNote([], 'I keep the 314 key in my case', 1)
    notes = addNote(notes, 'Sell the LEDX before the wipe', 2)
    expect(findNote(notes, "where's my 314 key")?.text).toBe('I keep the 314 key in my case')
    expect(findNote(notes, 'what about the LEDX')?.text).toBe('Sell the LEDX before the wipe')
    expect(findNote(notes, 'where is crackhouse')).toBeNull()
    expect(asksAboutOwn("where's my 314 key")).toBe(true)
    expect(asksAboutOwn('where is the 314 key')).toBe(false)
    expect(FORGET_ALL.test(words('Forget everything').join(' '))).toBe(true)
  })
})

describe('learned words', () => {
  it('learns what a word means from "I meant"', () => {
    expect(subjectOf('where can I find the drill')).toBe('drill')
    expect(subjectOf('how much is a moonshine worth')).toBe('moonshine')
    expect(subjectOf('where is it')).toBeNull()
    expect(parseMeant('No, I meant the Hand drill')).toBe('hand drill')
    expect(parseMeant('where is the drill')).toBeNull()
    expect(parseTeach('When I say drill I mean hand drill')).toEqual({ phrase: 'drill', means: 'hand drill' })
    expect(parseTeach('the red one means red rebel')).toEqual({ phrase: 'red one', means: 'red rebel' })
  })

  it('puts the meaning in place of the word, whole words only', () => {
    const list = learnWord(learnWord([], 'drill', 'hand drill', 1), 'red one', 'red rebel', 2)
    expect(applyWords('Where can I find the drill?', list)).toEqual({ text: 'where can i find the hand drill', used: ['drill'] })
    expect(applyWords('price of the red one', list).text).toBe('price of the red rebel')
    expect(applyWords('where is the hand drill', list).used).toEqual([])
    expect(applyWords('drilling rig', list).used).toEqual([])
  })
})

describe('habits', () => {
  it('counts raids per map, time and result', () => {
    let h = emptyHabits()
    const evening = new Date(2026, 9, 23, 20, 0).getTime() // a Friday
    for (let i = 0; i < 4; i++) h = recordRaid(h, 'customs', evening + i * 60_000, i < 3 ? 'survived' : 'died')
    h = recordRaid(h, 'woods', evening)
    expect(topMaps(h)[0][0]).toBe('customs')
    expect(h.maps.customs).toMatchObject({ raids: 4, survived: 3, died: 1 })
    expect(survivalText(h.maps.customs)).toBe('you survive 75% there')
    expect(whenYouPlay(h)).toBe('mostly in the evening, most often on Fridays')
    expect(askKind('how much is a LEDX worth')).toBe('prices')
    expect(askKind('where can I find a GPU')).toBe('finding things')
  })
})

describe('style', () => {
  it('goes short when answers keep getting cut off, or when asked', () => {
    expect(wantsShort({ pref: 'auto', spoken: 10, cut: 5 })).toBe(true)
    expect(wantsShort({ pref: 'auto', spoken: 10, cut: 2 })).toBe(false)
    expect(wantsShort({ pref: 'auto', spoken: 3, cut: 3 })).toBe(false)
    expect(wantsShort({ pref: 'full', spoken: 10, cut: 9 })).toBe(false)
    expect(parseStyle('please keep it short')).toBe('short')
    expect(parseStyle('give me more detail')).toBe('full')
    expect(firstSentence('Customs has 11 extracts. Old Gas Station is open.')).toBe('Customs has 11 extracts.')
  })
})

describe('greeting', () => {
  it('uses real numbers', () => {
    expect(greetingText({ hour: 20, kappaLeft: 6, favourite: { name: 'Customs', open: 2 }, openQuests: 40 })).toBe(
      'Evening, sir. 6 quests left on the way to Kappa. 2 of your open quests are on Customs, your most played map.',
    )
    expect(greetingText({ hour: 9, kappaLeft: 0, favourite: null, openQuests: 12 })).toBe('Morning, sir. 12 quests are available.')
  })
})

describe('raid results', () => {
  it('counts a result once, also when it is changed', () => {
    let h = recordRaid(emptyHabits(), 'woods', 0)
    h = recordResult(h, 'woods', 'died', null)
    h = recordResult(h, 'woods', 'survived', 'died')
    expect(h.maps.woods).toMatchObject({ survived: 1, died: 0 })
    expect(recordResult(h, 'labs', 'died', null)).toBe(h)
  })
})
