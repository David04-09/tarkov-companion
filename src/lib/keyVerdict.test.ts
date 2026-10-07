import { describe, expect, it } from 'vitest'
import { keyVerdict } from './keyVerdict'

describe('key verdict', () => {
  it('rates rich rooms worth it', () => {
    const v = keyVerdict({ behind: ['1x Weapon box (6x2)', '2x Weapon box (4x4)', '1x LEDX Spawn', 'Loose loot (Electronics, Meds)'], questNames: [] })
    expect(v.kind).toBe('yes')
    expect(v.reasons[0]).toBe('LEDX spawn')
    expect(v.reasons).toContain('3× weapon box')
  })

  it('rates a lone jacket not worth it', () => {
    const v = keyVerdict({ behind: ['1x Jacket'], questNames: [] })
    expect(v.kind).toBe('no')
  })

  it('counts each line once (very rare valuables is not also valuables)', () => {
    const v = keyVerdict({ behind: ['Loose loot (multiple very rare Valuables, Weapons, Containers)'], questNames: [] })
    expect(v.reasons).toEqual(['rare valuables'])
    expect(v.kind).toBe('yes')
  })

  it('calls out quest keys first but still judges the loot', () => {
    const v = keyVerdict({ behind: ['1x Jacket'], questNames: ['The Punisher'] })
    expect(v.kind).toBe('quest')
    expect(v.lootWorth).toBe(false)
  })

  it('says unknown without wiki info', () => {
    expect(keyVerdict({ behind: null, questNames: [] }).kind).toBe('unknown')
    expect(keyVerdict({ behind: [], questNames: [] }).kind).toBe('unknown')
  })

  it('counts extraction keys as worth it', () => {
    const v = keyVerdict({ behind: ['"Med Tent Gate" extraction', '1x Jacket'], questNames: [] })
    expect(v.reasons).toContain('opens an extraction (an extra way out)')
    expect(v.kind).toBe('yes')
  })

  it('explains quest-only rooms', () => {
    const v = keyVerdict({ behind: ['Nothing unless the quest Background Check is active.'], questNames: [] })
    expect(v.kind).toBe('no')
    expect(v.reasons).toEqual(['the room only matters during a quest'])
  })
})
