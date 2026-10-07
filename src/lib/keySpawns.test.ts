import { describe, expect, it } from 'vitest'
import { keySpawnsByMap } from './keySpawns'
import type { GameData } from '../api/types'

const p = (x: number, z: number) => ({ x, y: 1, z })
const picture = (n: string) => ({ factory: 'factory', 'night-factory': 'factory', customs: 'customs' })[n]

describe('key spawns', () => {
  it('lists loose spots per map, merges Factory variants and duplicate spots', () => {
    const data = {
      maps: [
        { id: 'f', name: 'Factory', normalizedName: 'factory' },
        { id: 'nf', name: 'Night Factory', normalizedName: 'night-factory' },
        { id: 'c', name: 'Customs', normalizedName: 'customs' },
      ],
      mapDetails: {
        f: { lootLoose: [{ position: p(1, 1), itemIds: ['key', 'x'] }, { position: p(5, 5), itemIds: ['y'] }] },
        nf: { lootLoose: [{ position: p(1, 1), itemIds: ['key'] }, { position: p(9, 9), itemIds: ['key'] }] },
        c: { lootLoose: [{ position: p(2, 2), itemIds: ['other'] }] },
      },
    } as unknown as Pick<GameData, 'maps' | 'mapDetails'>
    const out = keySpawnsByMap(data, 'key', picture)
    expect(out).toHaveLength(1)
    expect(out[0].mapName).toBe('Factory')
    expect(out[0].points).toHaveLength(2)
  })

  it('returns nothing for keys without loose spots', () => {
    expect(keySpawnsByMap({ maps: [], mapDetails: {} } as unknown as Pick<GameData, 'maps' | 'mapDetails'>, 'key', picture)).toEqual([])
  })
})
