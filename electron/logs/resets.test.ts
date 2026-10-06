import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../../src/shared/desktop-api'
import { detectResets } from './resets'

let n = 0
const H = 3_600_000
const ev = (at: number, e: Record<string, unknown>, mode: GameEvent['mode'] = 'pve') => ({ id: String(n++), at, mode, historical: true, source: { file: 'f', line: 1 }, ...e }) as GameEvent
const done = (at: number, taskId: string) => ev(at, { kind: 'taskFinished', taskId, profileId: 'p', traderId: null })
const start = (at: number, taskId: string) => ev(at, { kind: 'taskStarted', taskId, profileId: 'p', traderId: null })

describe('detectResets', () => {
  it('finds a PvE reset from handed-in quests starting again (same profile id)', () => {
    const events = [
      ev(0, { kind: 'profile', profileId: 'p', accountId: '1' }),
      done(1 * H, 'debut'), done(2 * H, 'cans'), done(3 * H, 'shortage'),
      start(100 * H, 'debut'), start(100.2 * H, 'cans'), start(101 * H, 'shortage'),
      done(102 * H, 'debut'),
    ]
    expect(detectResets(events).pve).toBe(100 * H)
    expect(detectResets(events).regular).toBeNull()
  })
  it('ignores a single repeatable quest starting again', () => {
    const events = [done(1 * H, 'a'), start(5 * H, 'a'), done(6 * H, 'a'), start(30 * H, 'a')]
    expect(detectResets(events).pve).toBeNull()
  })
  it('treats a new profile id as a new period', () => {
    const events = [ev(0, { kind: 'profile', profileId: 'old', accountId: '1' }), ev(50 * H, { kind: 'profile', profileId: 'new', accountId: '1' })]
    expect(detectResets(events).pve).toBe(50 * H)
  })
})
