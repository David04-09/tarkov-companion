import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../src/shared/desktop-api'
import { RAID_MAX_MS, createRaidClock, trashWhenWritten } from './positionShots'

const ev = (kind: string, historical = false) => ({ kind, historical, at: 0, mode: 'pve', source: { file: '', line: 0 }, scenePath: '', location: '', raidId: '' }) as unknown as GameEvent

describe('createRaidClock', () => {
  it('is in a raid from the map load until the raid ends', () => {
    const c = createRaidClock()
    expect(c.inRaid(0)).toBe(false)
    c.onEvent(ev('mapLoading'), 1000)
    expect(c.inRaid(2000)).toBe(true)
    c.onEvent(ev('raidEnded'), 3000)
    expect(c.inRaid(4000)).toBe(false)
  })

  it('calls the raid over after the longest raid time when no end is logged', () => {
    const c = createRaidClock()
    c.onEvent(ev('raidStarted'), 0)
    expect(c.inRaid(RAID_MAX_MS - 1)).toBe(true)
    expect(c.inRaid(RAID_MAX_MS + 1)).toBe(false)
  })

  it('ignores history read at start-up and restarts on a new map load', () => {
    const c = createRaidClock()
    c.onEvent(ev('mapLoading', true), 0)
    expect(c.inRaid(10)).toBe(false)
    c.onEvent(ev('mapLoading'), 0)
    c.onEvent(ev('mapLoading'), RAID_MAX_MS)
    expect(c.inRaid(RAID_MAX_MS + 10)).toBe(true)
    c.onEvent(ev('matchingAborted'), RAID_MAX_MS + 20)
    expect(c.inRaid(RAID_MAX_MS + 30)).toBe(false)
  })
})

describe('trashWhenWritten', () => {
  const run = (sizes: (number | null)[]) => {
    let i = 0
    const trashed: string[] = []
    const done = trashWhenWritten('shot.png', {
      size: () => sizes[Math.min(i++, sizes.length - 1)],
      trash: async (f) => {
        trashed.push(f)
      },
      wait: async () => {},
    })
    return done.then((ok) => ({ ok, trashed }))
  }

  it('waits until the game has finished writing the file', async () => {
    expect(await run([0, 1200, 4800, 4800])).toEqual({ ok: true, trashed: ['shot.png'] })
  })

  it('leaves a file that disappeared or never settles', async () => {
    expect(await run([100, null])).toEqual({ ok: false, trashed: [] })
    expect(await run(Array.from({ length: 20 }, (_, k) => k + 1))).toEqual({ ok: false, trashed: [] })
  })
})
