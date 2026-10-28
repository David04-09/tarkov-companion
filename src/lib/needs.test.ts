import { describe, expect, it } from 'vitest'
import { countedNeed, type ItemNeed } from './needs'

const need: ItemNeed = {
  itemId: 'bolts',
  fir: 3,
  nonFir: 5,
  total: 8,
  alternatives: [],
  sources: [
    { kind: 'quest', id: 'q1', name: 'Quest', traderId: 't', traderName: 'Mechanic', count: 3, fir: true },
    { kind: 'hideout', id: 'h1', name: 'Workbench level 2', stationId: 's', level: 2, count: 4, fir: false },
    { kind: 'craft', id: 'c1', name: 'Craft: x', stationId: 's', count: 1 },
  ],
}

describe('countedNeed', () => {
  it('counts everything by default', () => {
    expect(countedNeed(need, 'all')).toEqual({ total: 8, sources: need.sources })
  })

  it('keeps only found-in-raid needs', () => {
    const c = countedNeed(need, 'fir')
    expect(c.total).toBe(3)
    expect(c.sources.map((s) => s.id)).toEqual(['q1'])
  })

  it('keeps only needs any copy will do for (crafts included)', () => {
    const c = countedNeed(need, 'any')
    expect(c.total).toBe(5)
    expect(c.sources.map((s) => s.id)).toEqual(['h1', 'c1'])
  })

  it('gives nothing to count when a need has no part of that kind', () => {
    expect(countedNeed({ ...need, fir: 0, total: 5, sources: need.sources.slice(1) }, 'fir')).toEqual({ total: 0, sources: [] })
  })
})
