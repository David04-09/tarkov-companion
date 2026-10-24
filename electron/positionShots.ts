/**
 * Optional clean-up for "Where am I": once a screenshot's position has been read, move the file to
 * the Recycle Bin (shell.trashItem, so it can be restored). Only screenshots taken during a raid
 * qualify: stash screenshots (for the scanner) are taken outside raids and are never touched.
 * The raid is known from the game log the app already reads; the game logs no end for many raids,
 * so a raid is also over RAID_MAX_MS after it started.
 */
import type { GameEvent } from '../src/shared/desktop-api'

/** Longer than any raid's time limit. */
export const RAID_MAX_MS = 75 * 60_000
/** The game writes the picture after the file appears: wait until its size stops changing. */
const SETTLE_CHECK_MS = 1500
const SETTLE_TRIES = 10

export interface RaidClock {
  onEvent: (e: GameEvent, now: number) => void
  inRaid: (now: number) => boolean
}

/** Raid in progress from live game-log events (history read at start-up is ignored). */
export function createRaidClock(): RaidClock {
  let since: number | null = null
  return {
    onEvent(e, now) {
      if (e.historical) return
      // A map load always starts the clock again (the last raid's end may not have been logged).
      if (e.kind === 'mapLoading') since = now
      else if (e.kind === 'raidMatched' || e.kind === 'raidStarting' || e.kind === 'raidStarted') since ??= now
      else if (e.kind === 'raidEnded' || e.kind === 'matchingAborted') since = null
    },
    inRaid: (now) => since !== null && now - since < RAID_MAX_MS,
  }
}

export interface TrashDeps {
  size: (file: string) => number | null
  trash: (file: string) => Promise<void>
  wait: (ms: number) => Promise<void>
}

/** Waits until the file's size is stable (the game has finished writing it), then trashes it. */
export async function trashWhenWritten(file: string, deps: TrashDeps): Promise<boolean> {
  let last = deps.size(file)
  for (let i = 0; i < SETTLE_TRIES; i++) {
    await deps.wait(SETTLE_CHECK_MS)
    const now = deps.size(file)
    if (now === null) return false
    if (last !== null && now === last && now > 0) {
      await deps.trash(file)
      return true
    }
    last = now
  }
  return false
}
