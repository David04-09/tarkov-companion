import { describe, expect, it } from 'vitest'
import type { GameEvent, LogStatsData } from '../shared/desktop-api'
import { computeLogStats, formatMinutes, pairRaids } from './logStats'

let n = 0
const ev = (at: number, e: Record<string, unknown>, mode: GameEvent['mode'] = 'pve') =>
  ({ id: String(n++), at, mode, historical: true, source: { file: 'f', line: 1 }, ...e }) as GameEvent

const T = new Date(2026, 9, 6, 19, 0, 0).getTime()
const MIN = 60_000

const events: GameEvent[] = [
  ev(T, { kind: 'raidMatched', location: 'Shoreline', raidId: 'A', online: true, gameMode: 'deathmatch' }),
  ev(T + 1 * MIN, { kind: 'raidStarted' }),
  ev(T + 26 * MIN, { kind: 'raidEnded', location: 'Shoreline', raidId: 'A' }),
  ev(T + 30 * MIN, { kind: 'raidMatched', location: 'Customs', raidId: 'B', online: true, gameMode: 'deathmatch' }),
  ev(T + 31 * MIN, { kind: 'raidStarted' }),
  ev(T + 41 * MIN, { kind: 'raidEnded', location: 'Customs', raidId: 'B' }),
  // End without a logged start (log rolled over): counted, no duration.
  ev(T + 90 * MIN, { kind: 'raidEnded', location: 'Shoreline', raidId: 'C' }),
  ev(T + 50 * MIN, { kind: 'fleaSold', itemId: 'x', count: 2, buyer: 'b', income: 40000, currency: 'RUB' }),
  ev(T + 51 * MIN, { kind: 'fleaSold', itemId: 'x', count: 1, buyer: 'b', income: 20000, currency: 'RUB' }),
  ev(T + 52 * MIN, { kind: 'fleaSold', itemId: 'y', count: 1, buyer: 'b', income: 150, currency: 'USD' }),
  ev(T + 53 * MIN, { kind: 'fleaRating', rating: 0.5, growing: true }),
  ev(T + 54 * MIN, { kind: 'taskFinished', taskId: 'q1', profileId: null, traderId: null }),
  ev(T + 55 * MIN, { kind: 'taskFinished', taskId: 'q1', profileId: null, traderId: null }),
  // Another mode: ignored.
  ev(T + 60 * MIN, { kind: 'raidEnded', location: 'Factory', raidId: 'D' }, 'regular'),
]
const data: LogStatsData = { events, sessions: [{ start: T - 10 * MIN, end: T + 110 * MIN }], accountId: '1', from: T, to: T + 110 * MIN }

describe('log stats', () => {
  it('pairs raid starts and ends', () => {
    const raids = pairRaids(events.filter((e) => e.mode === 'pve').sort((a, b) => a.at - b.at))
    expect(raids.map((r) => [r.location, r.minutes])).toEqual([['Shoreline', 25], ['Customs', 10], ['Shoreline', null]])
  })
  it('sums raids, maps, flea income and quests for one mode', () => {
    const s = computeLogStats(data, 'pve', null, 7, T + 2 * 60 * MIN)
    expect(s.raids).toHaveLength(3)
    expect(s.raidMinutes).toBe(35)
    expect(s.byMap[0]).toEqual({ location: 'Shoreline', raids: 2, minutes: 25 })
    expect(s.perDay[s.perDay.length - 1].raids).toBe(3)
    expect(s.fleaSales).toBe(3)
    expect(s.fleaItems).toBe(4)
    expect(s.income).toEqual({ RUB: 60000, USD: 150, EUR: 0 })
    expect(s.topSold[0]).toMatchObject({ itemId: 'x', count: 3, income: 60000 })
    expect(s.rating).toHaveLength(1)
    expect(s.questsFinished).toBe(1)
    expect(s.playMinutes).toBe(120)
  })
  it('formats durations', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(200)).toBe('3 h 20 min')
    expect(formatMinutes(60 * 52)).toBe('2 d 4 h')
  })
})
