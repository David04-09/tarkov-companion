import { describe, expect, it } from 'vitest'
import { acronymize, spokenToText, voiceVocabulary, writtenToText } from './spoken'

describe('spokenToText', () => {
  it('turns spoken numbers and spelled letters into text', () => {
    expect(spokenToText('i spawned at z b zero one three how do i get to dorms')).toBe('i spawned at zb 013 how do i get to dorms')
    expect(spokenToText('route to z b ten thirteen')).toBe('route to zb 1013')
    expect(spokenToText('warehouse seventeen')).toBe('warehouse 17')
    expect(spokenToText('gunsmith part twenty two')).toBe('gunsmith part 22')
    expect(spokenToText('about six hundred fifty meters')).toBe('about 650 meters')
    expect(spokenToText('dorm room three hundred three key')).toBe('dorm room 303 key')
    expect(spokenToText('dorm room three oh three key')).toBe('dorm room 303 key')
  })

  it('leaves normal words alone', () => {
    expect(spokenToText('where is the crack house')).toBe('where is the crack house')
    expect(spokenToText('i am at a gas station')).toBe('i am at a gas station')
  })
})

describe('voiceVocabulary', () => {
  it('has the command words and the words of every name, once each', () => {
    const v = voiceVocabulary(['Big Red', 'ZB-1013', 'Golden Swag', 'Big Red'])
    for (const w of ['big', 'red', 'zb', 'golden', 'swag', 'route', 'closest', 'thirteen', 'z']) expect(v).toContain(w)
    expect(v.filter((w) => w === 'big')).toHaveLength(1)
    expect(v).not.toContain('1013')
  })
})

describe('acronymize', () => {
  const known = new Set(['gpu', 'cpu', 'ledx', 'ssd', 'psu', 'ofz', 'ur'])
  it('joins spelled-out abbreviations the game uses', () => {
    expect(acronymize('how much is a see pee you', known)).toBe('how much is a cpu')
    expect(acronymize('price of the gee pee you', known)).toBe('price of the gpu')
    expect(acronymize('where is a gp you', known)).toBe('where is a gpu')
    expect(acronymize('s s d price', known)).toBe('ssd price')
    expect(acronymize('o f z', known)).toBe('ofz')
  })
  it('leaves sentences alone', () => {
    expect(acronymize('why are you here', known)).toBe('why are you here')
    expect(acronymize('see you later', known)).toBe('see you later')
    expect(acronymize('you are right', known)).toBe('you are right')
    expect(acronymize('is it a gpu', known)).toBe('is it a gpu')
  })
})

describe('acronyms', () => {
  it('turns acronyms heard as words back into their letters', () => {
    expect(spokenToText('where can i find gp you')).toBe('where can i find gpu')
    expect(spokenToText('price of a led x')).toBe('price of a ledx')
    expect(spokenToText('build me an m four')).toBe('build me an m4')
  })
})

describe('writtenToText', () => {
  it('turns the speech model text into question text and fixes misheard Tarkov words', () => {
    expect(writtenToText('Where can I find a GPU?')).toBe('where can i find a gpu')
    expect(writtenToText('How much is Alexa worth?')).toBe('how much is ledx worth')
    expect(writtenToText('How much is a Lexworth?')).toBe('how much is ledx worth')
    expect(writtenToText('How do I get to the lighthouse from the Shelleys?')).toBe('how do i get to the lighthouse from the chalets')
    expect(writtenToText('Price of a Tetris.')).toBe('price of a tetriz')
    expect(writtenToText('Add 5 wires to my collection.')).toBe('add 5 wires to my collection')
    expect(writtenToText('Where is the dorm room 314 key?')).toBe('where is the dorm room 314 key')
  })
})
