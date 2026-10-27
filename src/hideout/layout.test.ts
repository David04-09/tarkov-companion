import { describe, expect, it } from 'vitest'
import type { HideoutStation } from '../api/types'
import { darkness, roomsFor } from './layout'

const st = (normalizedName: string): HideoutStation => ({ id: `id-${normalizedName}`, name: normalizedName, normalizedName, imageLink: null, levels: [] })

describe('roomsFor', () => {
  it('puts known stations in their rooms and new ones in Other stations', () => {
    const rooms = roomsFor([st('vents'), st('generator'), st('christmas-tree'), st('gym')])
    expect(rooms.map((r) => [r.room.id, r.stations.map((s) => s.normalizedName)])).toEqual([
      ['power', ['generator', 'vents']],
      ['wall', ['gym']],
      ['other', ['christmas-tree']],
    ])
  })
})

describe('darkness', () => {
  it('goes from dim to fully lit', () => {
    expect(darkness(0, 3)).toBe(0.45)
    expect(darkness(3, 3)).toBe(0)
    expect(darkness(5, 0)).toBe(0)
  })
})
