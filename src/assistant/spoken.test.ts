import { describe, expect, it } from 'vitest'
import { spokenToText, voiceVocabulary } from './spoken'

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
