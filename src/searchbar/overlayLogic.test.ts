import { describe, expect, it } from 'vitest'
import type { Item, ItemsById, MapDetails, Task } from '../api/types'
import { buildUnlocks } from '../quests/questGraph'
import { clock, distance, distance2d, isTarkovNight, itemValue, neededOnMap, nextRestock, nextStoryTimer, questline, raidMap, raidOverAt, raidSecondsLeft, reduceRaid, tarkovTime, valuableSpots, type MapRow } from './overlayLogic'

describe('tarkovTime', () => {
  it('runs 7× real time from the Moscow offset; the right side is 12 hours on', () => {
    // At the epoch the left clock shows 03:00 (Moscow), the right one 15:00.
    expect(tarkovTime(0, false)).toBe('03:00')
    expect(tarkovTime(0, true)).toBe('15:00')
    // One real hour later: 7 Tarkov hours later.
    expect(tarkovTime(60 * 60 * 1000, false)).toBe('10:00')
    expect(tarkovTime(60 * 60 * 1000, true)).toBe('22:00')
  })
  it('knows night', () => {
    expect(isTarkovNight(60 * 60 * 1000, true)).toBe(true)
    expect(isTarkovNight(60 * 60 * 1000, false)).toBe(false)
  })
})

describe('reduceRaid', () => {
  const now = 1_000_000_000
  it('follows load → match → start and clears at the end', () => {
    const loading = reduceRaid([{ kind: 'mapLoading', at: now - 60_000, scenePath: 'maps/customs_preset.bundle' }], now)
    expect(loading).toMatchObject({ scenePath: 'maps/customs_preset.bundle', startedAt: null })
    const matched = reduceRaid([{ kind: 'raidMatched', at: now - 50_000, location: 'bigmap' }], now, loading)
    expect(matched).toMatchObject({ nameId: 'bigmap', scenePath: 'maps/customs_preset.bundle' })
    const started = reduceRaid([{ kind: 'raidStarted', at: now - 40_000 }], now, matched)
    expect(started?.startedAt).toBe(now - 40_000)
    expect(reduceRaid([{ kind: 'raidEnded', at: now }], now, started)).toBeNull()
    expect(reduceRaid([{ kind: 'matchingAborted', at: now }], now, loading)).toBeNull()
  })
  it('drops a raid that never ended in the log', () => {
    expect(reduceRaid([{ kind: 'raidStarted', at: now - 4 * 3600_000 }], now, { nameId: 'bigmap', scenePath: null, since: now - 4 * 3600_000, startedAt: null })).toBeNull()
  })
  it('calls a raid over without an end line: 10 minutes after its time, or 3 hours when the length is unknown', () => {
    const row: MapRow = { key: 'customs', name: 'Customs', nameId: 'bigmap', scenePath: null, raidDuration: 40 }
    expect(raidOverAt({ nameId: 'bigmap', scenePath: null, since: 0, startedAt: 1000 }, row)).toBe(1000 + 50 * 60_000)
    expect(raidOverAt({ nameId: null, scenePath: null, since: 5000, startedAt: null }, null)).toBe(5000 + 3 * 3600_000)
  })
  it('names the map and counts down', () => {
    const rows: MapRow[] = [{ key: 'customs', name: 'Customs', nameId: 'bigmap', scenePath: 'maps/customs_preset.bundle', raidDuration: 40 }]
    const raid = { nameId: null, scenePath: 'Maps/customs_preset.bundle', since: now - 120_000, startedAt: now - 60_000 }
    expect(raidMap(raid, rows)?.name).toBe('Customs')
    expect(raidSecondsLeft(raid, rows[0], now)).toBe(39 * 60)
    expect(clock(39 * 60 + 5)).toBe('39:05')
    expect(clock(3725)).toBe('1:02:05')
  })
})

const task = (id: string, prereqs: string[] = []): Task =>
  ({ id, name: id, taskRequirements: prereqs.map((taskId) => ({ taskId, status: ['complete'] })), minPlayerLevel: 0, trader: { id: 't', name: 'T' } }) as unknown as Task

describe('questline', () => {
  it('lists everything before (nearest first) and after', () => {
    const tasks = [task('a'), task('b', ['a']), task('c', ['b']), task('d', ['c']), task('e', ['c'])]
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
    const line = questline('c', byId, buildUnlocks(tasks))
    expect(line.before.map((s) => [s.task.id, s.depth])).toEqual([['b', 1], ['a', 2]])
    expect(line.after.map((s) => s.task.id)).toEqual(['d', 'e'])
  })
  it('ends on cycles', () => {
    const tasks = [task('a', ['b']), task('b', ['a'])]
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
    expect(questline('a', byId, buildUnlocks(tasks)).before.map((s) => s.task.id)).toEqual(['b'])
  })
})

const item = (id: string, avg: number | null, trader = 0, w = 1, h = 1, noFlea = false): Item =>
  ({ id, name: id, shortName: id, avg24hPrice: avg, lastLowPrice: null, sellToTrader: trader ? [{ traderId: 't', priceRUB: trader }] : [], types: noFlea ? ['noFlea'] : [], width: w, height: h }) as unknown as Item

describe('loose loot', () => {
  const items: ItemsById = { ledx: item('ledx', 1_000_000), bolts: item('bolts', 20_000), rifle: item('rifle', 200_000, 0, 5, 2), key: item('key', null, 50_000, 1, 1, true) }
  const details = {
    lootLoose: [
      { position: { x: 1, y: 0, z: 1 }, itemIds: ['bolts', 'ledx'] },
      { position: { x: 2, y: 0, z: 2 }, itemIds: ['bolts'] },
      { position: { x: 3, y: 0, z: 3 }, itemIds: ['rifle', 'key'] },
    ],
  } as unknown as MapDetails
  it('values items by the better of flea and trader', () => {
    expect(itemValue(items.key)).toBe(50_000)
    expect(itemValue(items.ledx)).toBe(1_000_000)
  })
  it('keeps spots with something worth the minimum, best item first', () => {
    const spots = valuableSpots(details, items, 100_000, false)
    expect(spots.map((s) => s.itemIds)).toEqual([['ledx'], ['rifle']])
    // Per slot, the 10-slot rifle is worth 20k.
    expect(valuableSpots(details, items, 30_000, true).map((s) => s.itemIds)).toEqual([['ledx'], ['key']])
  })
  it('lists needed items with their spots', () => {
    expect(neededOnMap(details, new Set(['bolts', 'key'])).map((r) => [r.itemId, r.spots.length])).toEqual([['bolts', 2], ['key', 1]])
  })
})

describe('pills', () => {
  const now = 10 * 3600_000
  it('finds the story wait that ends first, in the right game mode', () => {
    const byMode = {
      pve: {
        tour: { timers: { a: { startedAt: now - 3600_000, minH: 3, maxH: 5, label: 'Tour: wait' }, b: { startedAt: now - 2 * 3600_000, minH: 1, maxH: 1, label: 'done' } } },
        skies: { timers: { c: { startedAt: now, minH: 1, maxH: 2, label: 'Falling Skies: wait' } } },
      },
      regular: { x: { timers: { d: { startedAt: now, minH: 0.1, maxH: 0.2, label: 'pvp' } } } },
    }
    expect(nextStoryTimer(byMode, 'pve', now)).toEqual({ label: 'Falling Skies: wait', minAt: now + 3600_000, maxAt: now + 2 * 3600_000 })
    expect(nextStoryTimer(byMode, 'regular', now)?.label).toBe('pvp')
    expect(nextStoryTimer(null, 'pve', now)).toBeNull()
    expect(nextStoryTimer({ pve: { bad: { timers: { x: { startedAt: 'no' } } } } }, 'pve', now)).toBeNull()
  })
  it('finds the next restock ahead', () => {
    expect(nextRestock([{ name: 'A', at: now - 1 }, { name: 'B', at: now + 50 }, { name: 'C', at: now + 10 }], now)?.name).toBe('C')
    expect(nextRestock([], now)).toBeNull()
  })
})

describe('distance', () => {
  it('is in metres', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5)
    // On the map picture height does not count (the ruler).
    expect(distance2d({ x: 0, y: 40, z: 0 }, { x: 3, y: 0, z: 4 })).toBe(5)
  })
})
