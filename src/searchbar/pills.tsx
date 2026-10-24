import { useState } from 'react'
import { BookOpen, Moon, RefreshCw, Timer } from 'lucide-react'
import { clock, isTarkovNight, nextRestock, nextStoryTimer, raidSecondsLeft, tarkovTime, type MapRow, type RaidState, type RestockRow } from './overlayLogic'
import { useOverlayPrefs } from './overlayPrefs'
import { useNow } from './shell'

export interface PillsProps {
  raid: RaidState | null
  row: MapRow | null
  scavEnd: number | null
  story: { byMode: unknown; mode: string }
  restocks: RestockRow[]
  zoom: number
  onRaidClick: () => void
}

/**
 * The little pills next to the glass. They own their clock, so only they redraw while a timer
 * runs (once a second), never the bar, its cards or its map; with only Tarkov time showing, every
 * few seconds; with nothing running, never.
 */
export function Pills({ raid, row, scavEnd, story, restocks, zoom, onRaidClick }: PillsProps) {
  const stripRaid = useOverlayPrefs((s) => s.stripRaid)
  const stripClock = useOverlayPrefs((s) => s.stripClock)
  const stripScav = useOverlayPrefs((s) => s.stripScav)
  const stripStory = useOverlayPrefs((s) => s.stripStory)
  const stripRestock = useOverlayPrefs((s) => s.stripRestock)
  // Seconds matter only while something counts down; the first render decides with its own clock.
  const [running, setRunning] = useState(true)
  const now = useNow(running ? 1000 : stripClock ? 4000 : null)
  const showRaid = stripRaid && raid !== null
  const scavLeft = stripScav && scavEnd ? Math.round((scavEnd - now) / 1000) : 0
  const storyTimer = stripStory && story.byMode !== null ? nextStoryTimer(story.byMode, story.mode, now) : null
  const restock = stripRestock ? nextRestock(restocks, now) : null
  const left = raidSecondsLeft(raid, row, now)
  const nowRunning = showRaid || scavLeft > 0 || storyTimer !== null || restock !== null
  if (nowRunning !== running) setRunning(nowRunning)
  if (!showRaid && !stripClock && scavLeft <= 0 && !storyTimer && !restock) return null
  return (
    <div data-solid className="sb-z flex shrink-0 items-center gap-1 text-[11px] tabular-nums" style={{ zoom }}>
      {showRaid && (
        <button
          type="button"
          onClick={onRaidClick}
          title={raid?.startedAt ? 'Time left in this raid (from the game log). Click for its map.' : 'Loading into a raid. Click for its map.'}
          className={`rounded-full border border-white/15 bg-black/75 px-2 py-1 shadow-xl hover:text-white ${left !== null && left < 300 ? 'text-red-300' : 'text-white/85'}`}
        >
          {row?.name ?? 'Raid'} {raid?.startedAt ? (left !== null ? (left > 0 ? clock(left) : 'time is up') : clock((now - raid.startedAt) / 1000)) : '· loading'}
        </button>
      )}
      {stripClock && (
        <span title="Tarkov time: left / right side of the raid screen" className="flex items-center gap-1 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-white/80 shadow-xl">
          {isTarkovNight(now, false) && <Moon className="h-3 w-3 text-sky-300" />}
          {tarkovTime(now, false)}
          <span className="text-white/35">·</span>
          {isTarkovNight(now, true) && <Moon className="h-3 w-3 text-sky-300" />}
          {tarkovTime(now, true)}
        </span>
      )}
      {scavLeft > 0 && (
        <span title="Scav cooldown (Dashboard timer)" className="flex items-center gap-1 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-amber-200 shadow-xl">
          <Timer className="h-3 w-3" /> Scav {clock(scavLeft)}
        </span>
      )}
      {storyTimer && (
        <span title={`${storyTimer.label} (from the Story tab)`} className="flex items-center gap-1 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-violet-200 shadow-xl">
          <BookOpen className="h-3 w-3" />
          {storyTimer.minAt > now ? clock((storyTimer.minAt - now) / 1000) : `ready · max ${clock((storyTimer.maxAt - now) / 1000)}`}
        </span>
      )}
      {restock && (
        <span title="Next trader restock" className="flex items-center gap-1 rounded-full border border-white/15 bg-black/75 px-2 py-1 text-green-200 shadow-xl">
          <RefreshCw className="h-3 w-3" /> {restock.name} {clock((restock.at - now) / 1000)}
        </span>
      )}
    </div>
  )
}
