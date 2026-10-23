import { describe, expect, it } from 'vitest'
import { matchesSearch, rankMatch, searchWords } from './fleaSearch'

const hay = (name: string, short: string) => `${name}\n${short}`.toLowerCase()

describe('flea search', () => {
  it('needs every word, in any order', () => {
    expect(matchesSearch(hay('5.45x39mm PS gs', 'PS'), searchWords('ps 5.45'))).toBe(true)
    expect(matchesSearch(hay('Dorm room 314 marked key', 'Dorm 314'), searchWords('314 dorm key'))).toBe(true)
    expect(matchesSearch(hay('Dorm room 314 marked key', 'Dorm 314'), searchWords('dorm 303'))).toBe(false)
    expect(matchesSearch(hay('Graphics card', 'GPU'), searchWords('  GPU '))).toBe(true)
  })

  it('ranks the exact name first', () => {
    const w = searchWords('gpu')
    expect(rankMatch('Graphics card', 'GPU', w)).toBe(0)
    expect(rankMatch('GPU holder', 'GPUh', w)).toBe(1)
    expect(rankMatch('Broken GPU', 'BrGPU', w)).toBe(2)
  })
})
