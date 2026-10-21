import { describe, expect, it } from 'vitest'
import { forSpeech } from './speakable'

describe('forSpeech', () => {
  it('reads key and room numbers digit by digit', () => {
    expect(forSpeech('You need Dorm room 314 marked key.')).toBe('You need Dorm room three one four marked key.')
    expect(forSpeech('Customs. One quest here: Loyalty Buyout. You need Dorm room 303 key and MS2000.')).toBe('Customs. One quest here: Loyalty Buyout. You need Dorm room three zero three key and MS2000.')
    expect(forSpeech('From ZB-014 to Dorms.')).toBe('From Z B zero one four to Dorms.')
    expect(forSpeech('From ZB-1013 to Dorms.')).toBe('From Z B one zero one three to Dorms.')
  })

  it('leaves amounts alone', () => {
    expect(forSpeech('Graphics card goes for about 322,319 ₽ on the flea.')).toBe('Graphics card goes for about 322,319 ₽ on the flea.')
    expect(forSpeech('From Dorms to Crackhouse: about 250 metres on foot.')).toBe('From Dorms to Crackhouse: about 250 metres on foot.')
    expect(forSpeech('Graphics card can spawn as loose loot at 268 spots.')).toBe('Graphics card can spawn as loose loot at 268 spots.')
    expect(forSpeech('Evening, sir. 13 quests left on the way to Kappa.')).toBe('Evening, sir. 13 quests left on the way to Kappa.')
    expect(forSpeech('M995 (penetration 53) goes through class 5.')).toBe('M995 (penetration 53) goes through class 5.')
  })
})
