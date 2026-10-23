import { describe, expect, it } from 'vitest'
import { addressed, naturalSpeech, possessive, talkName } from './humanize'
import { GOOD_ANSWER, parseAddress, TELL_MORE, TOO_LONG, wantsShort } from './memory'
import { forSpeech } from './speakable'

describe('talking like a person', () => {
  it('uses the short name people say', () => {
    expect(talkName({ name: 'LEDX Skin Transilluminator', shortName: 'LEDX' })).toBe('the LEDX')
    expect(talkName({ name: 'Bottle of Fierce Hatchling moonshine', shortName: 'Moonshine' })).toBe('the moonshine')
    expect(talkName({ name: 'Factory emergency exit key', shortName: 'Factory' })).toBe('the factory key')
    expect(talkName({ name: 'Gas analyzer', shortName: 'GasAn' })).toBe('Gas analyzer')
    expect(possessive('Therapist')).toBe("Therapist's")
  })

  it('says prices and phrases the way a person would', () => {
    expect(naturalSpeech('The LEDX is going for about 570,778 ₽ on the flea right now.')).toBe('The LEDX is going for about 571 thousand roubles on the flea right now.')
    expect(naturalSpeech('It is still locked. There is one PMC extract on Woods.')).toBe("It's still locked. There's one PMC extract on Woods.")
    expect(naturalSpeech('Dorm room 314 key goes for 1,940,296 ₽ (24 h average).')).toBe('Dorm room 314 key goes for about 1.9 million roubles.')
    // Spoken numbers that are amounts are not read digit by digit afterwards.
    expect(forSpeech(naturalSpeech('about 570,778 ₽'))).toBe('about 571 thousand roubles')
  })

  it('calls the player what they asked to be called', () => {
    expect(addressed('Keep it, sir: you still need 3.', 'Dave')).toBe('Keep it, Dave: you still need 3.')
    expect(addressed('Glad that helped, sir.', '')).toBe('Glad that helped.')
    expect(addressed('Yes sir?', '')).toBe('Yes?')
    expect(parseAddress('call me Dave')).toBe('Dave')
    expect(parseAddress("don't call me sir")).toBe('')
    expect(parseAddress('call me sir')).toBe('sir')
    expect(parseAddress('i am at dorms')).toBeNull()
  })
})

describe('answer etiquette', () => {
  it('knows feedback on the last answer', () => {
    for (const s of ['too long', 'just the price', 'shorter please', 'get to the point']) expect(TOO_LONG.test(s), s).toBe(true)
    for (const s of ['tell me more', 'go on', 'what else']) expect(TELL_MORE.test(s), s).toBe(true)
    for (const s of ['perfect', 'exactly', 'thats what i wanted']) expect(GOOD_ANSWER.test(s), s).toBe(true)
    expect(TELL_MORE.test('tell me more about the ledx')).toBe(false)
  })

  it('keeps the length learned for each topic', () => {
    const style = { pref: 'auto' as const, spoken: 0, cut: 0, byKind: { prices: 'short' as const, routes: 'full' as const } }
    expect(wantsShort(style, 'prices')).toBe(true)
    expect(wantsShort(style, 'routes')).toBe(false)
    expect(wantsShort(style, 'quests')).toBe(false)
  })
})
