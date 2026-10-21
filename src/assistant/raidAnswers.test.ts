import { describe, expect, it } from 'vitest'
import type { GameData, GameMap, Task } from '../api/types'
import type { AssistantContext } from './engine'
import { answer } from './engine'
import { emptyHabits, recordRaid, recordResult } from './memory'
import { tarkovTime, type LiveInfo } from './raidAnswers'

const customs = { id: 'm-customs', name: 'Customs', normalizedName: 'customs', nameId: 'bigmap', raidDuration: 40 } as GameMap
const debut = { id: 't-debut', name: 'Debut', trader: { name: 'Prapor' }, map: customs, minPlayerLevel: 0, objectives: [], taskRequirements: [], kappaRequired: false } as unknown as Task
const next = { id: 't-next', name: 'Shooting Cans', trader: { name: 'Prapor' }, map: customs, minPlayerLevel: 2, objectives: [], taskRequirements: [{ taskId: 't-debut', status: ['complete'] }], kappaRequired: false } as unknown as Task

const now = Date.UTC(2026, 9, 21, 18, 0)
const live = (over: Partial<LiveInfo> = {}): LiveInfo => ({ now, raid: null, position: null, scavCooldownEndsAt: null, handIns: [], habits: null, needs: () => [], isDesktop: true, ...over })

const ctx = (l: LiveInfo): AssistantContext =>
  ({
    data: {
      maps: [customs],
      tasks: [debut, next],
      tasksById: { 't-debut': debut, 't-next': next },
      traders: [{ id: 'pr', name: 'Prapor', normalizedName: 'prapor', resetTime: now + 25 * 60_000 }],
      mapDetails: {
        'm-customs': {
          extracts: [],
          locks: [],
          hazards: [{ id: 'h1', type: 'minefield', name: 'Minefield', position: { x: 0, y: 0, z: 0 }, outline: [] }],
          lootContainers: [
            { containerId: 'safe', position: { x: 200, y: 0, z: 150 } },
            { containerId: 'safe', position: { x: 900, y: 0, z: 900 } },
            { containerId: 'jacket', position: { x: 210, y: 0, z: 160 } },
          ],
          spawns: [],
          bosses: [],
        },
      },
      lootContainerNames: { safe: 'Safe', jacket: 'Jacket' },
      goonReport: null,
      mobNames: {},
    } as unknown as GameData,
    statuses: { 't-debut': 'completed', 't-next': 'available' },
    tasks: [debut, next],
    items: undefined,
    tasksOnMap: () => [],
    heading: () => 'east',
    lastMapId: 'm-customs',
    lastPlace: null,
    playerLevel: 10,
    live: l,
  }) as AssistantContext

describe('raid answers', () => {
  it('counts down the raid from the game log', () => {
    const r = answer('how long is left', ctx(live({ raid: { startedAt: now - 15 * 60_000, durationS: null, mapNameId: 'bigmap' } })))
    expect(r.text).toBe('About 25 minutes left on Customs, sir.')
    expect(answer('how much time is left', ctx(live())).text).toBe('No raid is running in the game log right now.')
  })

  it('tells the Tarkov time (real time × 7, the two raid times 12 hours apart)', () => {
    const left = tarkovTime(now, true)
    const right = tarkovTime(now, false)
    expect((right.h - left.h + 24) % 24).toBe(12)
    expect(answer('what time is it in tarkov', ctx(live())).text).toMatch(/^In Tarkov it is \d\d:\d\d \((day|night)\) or \d\d:\d\d/)
  })

  it('says where you are from the last screenshot', () => {
    const r = answer('where am i', ctx(live({ position: { x: 205, z: 152, mapKey: 'customs', at: now - 60_000 } })))
    expect(r.text).toBe('At Dorms on Customs.')
    expect(answer('where am i', ctx(live())).text).toContain('Take an in-game screenshot')
  })

  it('answers containers, hazards, unlocks, restocks, scav, hand-ins and stats', () => {
    expect(answer('where are the safes on customs', ctx(live())).text).toBe('Customs: 2 safes.')
    expect(answer('loot near dorms', ctx(live())).text).toBe('Near Dorms: 1 safe, 1 jacket.')
    expect(answer('minefields on customs', ctx(live())).text).toBe('Customs: 1 minefield.')
    expect(answer('what does debut unlock', ctx(live())).text).toBe('Debut opens the way to 1 quest.')
    expect(answer('when does prapor restock', ctx(live())).text).toBe('Prapor restocks in 25 minutes.')
    expect(answer('when can i scav', ctx(live({ scavCooldownEndsAt: now + 4 * 60_000 }))).text).toBe('Your scav is ready in about 4 minutes.')
    const today = new Date(now)
    today.setHours(12, 0, 0, 0)
    expect(answer('what did i hand in today', ctx(live({ handIns: [{ taskId: 't-debut', at: today.getTime() }] }))).lines).toEqual(['Debut'])
    let habits = recordRaid(recordRaid(recordRaid(emptyHabits(), 'customs', now), 'customs', now + 1), 'customs', now + 2)
    habits = recordResult(recordResult(recordResult(habits, 'customs', 'survived', null), 'customs', 'survived', null), 'customs', 'died', null)
    expect(answer('my stats', ctx(live({ habits }))).text).toBe('3 raids that I know of, most on Customs; you survived 67% of the 3 you marked.')
  })
})
