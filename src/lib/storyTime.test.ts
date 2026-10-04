import { describe, expect, it } from 'vitest'
import { formatCountdown, formatWait, matchObjectivesToSections, parseWait, timerPhase } from './storyTime'

describe('parseWait', () => {
  it('reads the phrasings used on the wiki', () => {
    expect(parseWait('Wait 1 hour then visit Prapor in the menu')).toEqual({ minH: 1, maxH: 1 })
    expect(parseWait('Wait 3-5 hours then visit Prapor')).toEqual({ minH: 3, maxH: 5 })
    expect(parseWait('Wait 6-12 hours for Voevoda to reach out, then')).toEqual({ minH: 6, maxH: 12 })
    expect(parseWait('Wait 12-24 hours then visit Jaeger')).toEqual({ minH: 12, maxH: 24 })
    expect(parseWait('Wait 1 and half a hour for Mr. Kerman to reach out')).toEqual({ minH: 1.5, maxH: 1.5 })
    expect(parseWait('Wait 30 minutes')).toEqual({ minH: 0.5, maxH: 0.5 })
    expect(parseWait('Wait half an hour')).toEqual({ minH: 0.5, maxH: 0.5 })
  })
  it('prefers the number after "wait" over earlier numbers', () => {
    expect(parseWait('Hand over 2,000 USD. Wait 2 hours for the reply.')).toEqual({ minH: 2, maxH: 2 })
  })
  it('returns null without a duration', () => {
    expect(parseWait('Wait for the news from Elektronik')).toBeNull()
  })
})

describe('formatting', () => {
  it('formats ranges and countdowns', () => {
    expect(formatWait({ minH: 3, maxH: 5 })).toBe('3–5 h')
    expect(formatWait({ minH: 0.5, maxH: 0.5 })).toBe('30 min')
    expect(formatWait({ minH: 1.5, maxH: 1.5 })).toBe('1.5 h')
    expect(formatWait({ minH: 5 / 3600, maxH: 5 / 3600 })).toBe('5 s')
    expect(formatCountdown(2 * 3600_000 + 5 * 60_000)).toBe('2 h 05 min')
    expect(formatCountdown(45_000)).toBe('45 s')
  })
  it('knows where a timer stands', () => {
    const w = { minH: 1, maxH: 3 }
    expect(timerPhase(0, w, 30 * 60_000).phase).toBe('waiting')
    expect(timerPhase(0, w, 2 * 3600_000).phase).toBe('maybe')
    expect(timerPhase(0, w, 4 * 3600_000).phase).toBe('ready')
  })
})

describe('matchObjectivesToSections', () => {
  it('matches objectives to guide headings in order, including repeated ones', () => {
    const objectives = [
      'Locate the fallen plane',
      'Reach Loyalty Level 2 with Prapor',
      'Hand over the flash drive to Prapor',
      'Wait for information from Prapor',
      'Retrieve the plane\'s flight recorder',
      'Wait for information from Prapor',
      'Hand over the flight crew\'s transcript to Prapor',
      'Hand over Elektronik\'s secure flash drive to Prapor',
      'Wait for information from Prapor',
    ]
    const headings = [
      'Locate the fallen plane',
      'Reach Loyalty Level 2 with Prapor',
      'Retrieve the flash drive from one of the G-Wagon SUVs',
      'Wait for the information from Prapor',
      'Retrieve the plane\'s flight recorder',
      'Visit Prapor',
      'Wait for the information from Prapor',
      'Hand over the flight crew\'s transcript and Elektronik\'s secure flash drive to Prapor',
      'Wait for the information from Prapor',
    ]
    expect(matchObjectivesToSections(objectives, headings)).toEqual([0, 1, -1, 3, 4, 6, 7, 7, 8])
  })
  it('uses "/"-joined headings for each part', () => {
    expect(matchObjectivesToSections(['Locate courier Pasha', 'Search the ambush spot'], ['Locate courier Pasha/Search the ambush spot'])).toEqual([0, 0])
  })
})
