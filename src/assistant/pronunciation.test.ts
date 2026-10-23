import { describe, expect, it } from 'vitest'
import { applyHeard, emptyPronunciation, learnHeard, letterSwap } from './pronunciation'

const known = new Set(['chalets', 'thing', 'three', 'thermite', 'ledx', 'where', 'is', 'the', 'how', 'much'])
const isKnown = (w: string) => known.has(w)

describe('learning how the player says things', () => {
  it('finds the letters that differ', () => {
    expect(letterSwap('fing', 'thing')).toBe('f>th')
    expect(letterSwap('shalets', 'chalets')).toBe('s>c')
    expect(letterSwap('ledi', 'ledx')).toBe('i>x')
    expect(letterSwap('gpu', 'graphics')).toBeNull()
    expect(letterSwap('same', 'same')).toBeNull()
  })

  it('uses a fix once heard twice', () => {
    let p = learnHeard(emptyPronunciation(), 'ledi', 'LEDX', 1)
    expect(applyHeard('how much is the ledi', p, isKnown).text).toBe('how much is the ledi')
    p = learnHeard(p, 'ledi', 'LEDX', 2)
    expect(applyHeard('how much is the ledi', p, isKnown)).toEqual({ text: 'how much is the ledx', used: ['ledi'] })
  })

  it('learns letter swaps and tries them on unknown words', () => {
    let p = emptyPronunciation()
    p = learnHeard(p, 'free', 'three', 1)
    p = learnHeard(p, 'fing', 'thing', 2)
    p = learnHeard(p, 'fermite', 'thermite', 3)
    expect(p.sounds['f>th']).toBe(3)
    // A word it never heard before, fixed by the swap because the result is a known word.
    const q = { ...p, phrases: {} }
    expect(applyHeard('where is the fing', q, isKnown).text).toBe('where is the thing')
    // Known words are left alone.
    expect(applyHeard('how much', q, isKnown).text).toBe('how much')
  })
})
