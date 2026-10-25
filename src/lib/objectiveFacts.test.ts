import { describe, expect, it } from 'vitest'
import type { GameMap, TaskObjective } from '../api/types'
import { bodyPartsText, factsLookup, shootFacts, staleText, targetsText } from './objectiveFacts'

const shoot = (o: Partial<TaskObjective>): TaskObjective =>
  ({
    id: 'o', type: 'shoot', description: '', optional: false, maps: [], count: 1, itemIds: [], questItem: null, foundInRaid: null, targetNames: [], locations: [],
    requiredKeys: [], exitName: null, build: null, markerItemId: null, usingWeaponIds: [], wearingIds: [], usingWeaponModIds: [], shotType: 'kill', bodyParts: [], distance: null, hours: null,
    ...o,
  }) as TaskObjective
const woods = { id: 'w', name: 'Woods' } as GameMap

// Hunting Trip as tarkov.dev has it on 2026-10-25: the text is the old one, the conditions are new.
const huntingTrip = shoot({
  description: 'Locate and neutralize Shturman with a headshot from over 40 meters away while using an M700 sniper rifle with the specified scope',
  count: 20,
  maps: [woods],
  targetNames: ['Shturman', 'Black Div.', 'Glukhar', 'Killa', 'Vengeful Killa', 'Knight', 'Kollontay', 'Partisan', 'Sanitar', 'bossStormtrooper', 'Tagilla', 'Big Pipe', 'Birdeye', 'Harbinger', 'Zryachiy', 'The Wedge (Labs)'],
  usingWeaponIds: ['m700', 'mosin', 'sv98'],
  usingWeaponModIds: [['scope']],
  distance: { compare: '>=', value: 40 },
})
const items = {
  m700: { name: 'Remington M700', categories: ['bolt', 'weapon', 'item'] },
  mosin: { name: 'Mosin', categories: ['bolt', 'weapon', 'item'] },
  sv98: { name: 'SV-98', categories: ['bolt', 'weapon', 'item'] },
  ak: { name: 'AK-74N', categories: ['ar', 'weapon', 'item'] },
  scope: { name: 'Leupold Mark 4 LR', categories: ['optic', 'item'] },
}
const look = factsLookup(items, { bolt: 'Bolt-action rifle', ar: 'Assault rifle', weapon: 'Weapon', item: 'Item', optic: 'Optic' })

describe('shootFacts', () => {
  it('writes out what Hunting Trip counts now', () => {
    expect(shootFacts(huntingTrip, look)).toBe(
      'Kill 20 × any of Shturman, Black Div., Glukhar, Killa, Vengeful Killa, The Goons, Kollontay, Partisan and 6 more · with any bolt-action rifle (3 kinds) · fitted with Leupold Mark 4 LR · from 40 m or more · on Woods',
    )
  })

  it('names one weapon, a few weapons, body parts and hours', () => {
    expect(shootFacts(shoot({ count: 3, targetNames: ['any PMC operatives'], usingWeaponIds: ['ak'], bodyParts: ['QuestCondition/Elimination/Kill/BodyPart/LeftLeg', 'QuestCondition/Elimination/Kill/BodyPart/RightLeg'], hours: { from: 21, until: 5 } }), look)).toBe(
      'Kill 3 × any PMC operatives · in the legs · with the AK-74N · between 21:00 and 05:00 in-game time',
    )
    expect(shootFacts(shoot({ usingWeaponIds: ['ak', 'm700'] }), look)).toBe('Kill 1 × any target · with the AK-74N or Remington M700')
    expect(shootFacts(shoot({ shotType: 'hit', count: 2 }), look)).toBe('Hit 2 × any target')
    expect(shootFacts(shoot({ type: 'visit' }), look)).toBeNull()
  })

  it('needs every part of a set, and any one set', () => {
    const parts = factsLookup({ s: { name: 'PS-320', categories: [] }, m: { name: 'AK-12 suppressor', categories: [] }, b: { name: 'Burris', categories: [] } }, {})
    expect(shootFacts(shoot({ usingWeaponModIds: [['s', 'm']] }), parts)).toBe('Kill 1 × any target · fitted with PS-320 and AK-12 suppressor')
    expect(shootFacts(shoot({ usingWeaponModIds: [['s'], ['b']] }), parts)).toBe('Kill 1 × any target · fitted with PS-320, or Burris')
  })

  it('calls the game category "Sniper rifle" what it is', () => {
    const snipers = factsLookup({ a: { name: 'M700', categories: ['s'] }, b: { name: 'Mosin', categories: ['s'] } }, { s: 'Sniper rifle' })
    expect(shootFacts(shoot({ usingWeaponIds: ['a', 'b'] }), snipers)).toBe('Kill 1 × any target · with any bolt-action sniper rifle (2 kinds)')
  })

  it('groups the Goons and hides untranslated ids', () => {
    expect(targetsText(['Knight', 'Big Pipe', 'Birdeye'])).toBe('The Goons')
    expect(targetsText(['Glukhar', 'bossStormtrooper'])).toBe('any of Glukhar and 1 more')
    expect(bodyPartsText(['QuestCondition/Elimination/Kill/BodyPart/Head'])).toBe('in the head')
  })
})

describe('staleText', () => {
  it('flags Hunting Trip and a wrong kill count', () => {
    expect(staleText(huntingTrip)).toMatch(/names only Shturman/)
    expect(staleText(shoot({ description: 'Eliminate 20 PMCs with AK-12 on Lighthouse', count: 10, targetNames: ['any PMC operatives'] }))).toMatch(/says 20, the game counts 10/)
  })

  it('leaves texts that match their conditions alone', () => {
    expect(staleText(shoot({ description: 'Locate and neutralize Glukhar or his guards on Reserve', count: 1, targetNames: ['Glukhar', 'Glukhar Guard (Assault)', 'Glukhar Guard (Scout)'] }))).toBeNull()
    expect(staleText(shoot({ description: 'Locate and neutralize any Boss (excluding The Goons, The Wedge and Partisan)', count: 1, targetNames: ['Kaban', 'Reshala', 'Glukhar'] }))).toBeNull()
    expect(staleText(shoot({ description: 'Eliminate PMC operatives from over 100 meters away', count: 20 }))).toBeNull()
  })
})
