import { useEffect, useRef, useState } from 'react'
import { Timer, Volume2, VolumeX } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { RUN_THROUGH_SECONDS, beep, formatClock, useTimersStore } from './timers'
import { isDesktop } from './useDesktop'

/** Raid timer, run-through countdown and scav cooldown (desktop only). */
export function TimersCard({ compact = false }: { compact?: boolean }) {
  const t = useTimersStore()
  const gameData = useGameData()
  const [now, setNow] = useState(0)
  const firedRunThrough = useRef(false)
  const firedScav = useRef(false)

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [])

  const elapsed = t.raidStartedAt ? (now - t.raidStartedAt) / 1000 : null
  const remaining = elapsed != null && t.raidDurationSeconds ? t.raidDurationSeconds - elapsed : null
  const runThrough = elapsed != null ? RUN_THROUGH_SECONDS - elapsed : null
  const scav = t.scavCooldownEndsAt ? (t.scavCooldownEndsAt - now) / 1000 : null

  useEffect(() => {
    if (runThrough != null && runThrough <= 0 && !firedRunThrough.current) {
      firedRunThrough.current = true
      beep('ok')
    }
    if (runThrough == null || runThrough > 0) firedRunThrough.current = false
  }, [runThrough])
  useEffect(() => {
    if (scav != null && scav <= 0 && !firedScav.current) {
      firedScav.current = true
      beep('done')
    }
    if (scav == null || scav > 0) firedScav.current = false
  }, [scav])

  if (!isDesktop()) return null
  const mapName = t.raidMapNameId ? (gameData.data?.maps.find((m) => m.nameId.toLowerCase() === t.raidMapNameId?.toLowerCase())?.name ?? t.raidMapNameId) : null

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-x-4 gap-y-1 text-xs' : 'card'}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h2 className="card-title">Timers</h2>
          <button type="button" onClick={() => t.setSoundsEnabled(!t.soundsEnabled)} title={t.soundsEnabled ? 'Sounds on' : 'Sounds off'} className="text-ink-dim hover:text-ink">
            {t.soundsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      )}
      <div className={compact ? 'contents' : 'mt-3 space-y-2 text-sm'}>
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 shrink-0 text-accent" />
          {elapsed == null ? (
            <span className="text-ink-muted">No raid in progress</span>
          ) : (
            <span>
              <span className="font-semibold tabular-nums">{formatClock(elapsed)}</span>
              {remaining != null && <span className="text-ink-muted"> · {formatClock(remaining)} left</span>}
              {mapName && <span className="text-ink-dim"> · {mapName}</span>}
            </span>
          )}
        </div>
        {elapsed != null && (
          <div className={runThrough != null && runThrough > 0 ? 'text-accent' : 'text-success'}>
            {runThrough != null && runThrough > 0 ? `Run-through until survived: ${formatClock(runThrough)}` : 'Survived long enough (no run-through)'}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {scav != null && scav > 0 ? (
            <>
              <span>Scav cooldown <span className="font-semibold tabular-nums">{formatClock(scav)}</span></span>
              <button type="button" onClick={t.cancelScavCooldown} className="btn !px-2 !py-0.5 !text-[11px]">Cancel</button>
            </>
          ) : (
            <>
              <span className={scav != null ? 'text-success' : 'text-ink-muted'}>{scav != null ? 'Scav ready' : 'Scav cooldown'}</span>
              <button type="button" onClick={t.startScavCooldown} className="btn !px-2 !py-0.5 !text-[11px]">Start {t.scavCooldownMinutes} min</button>
              {!compact && (
                <input type="number" min={1} max={90} value={t.scavCooldownMinutes} onChange={(e) => t.setScavCooldownMinutes(e.target.valueAsNumber)} aria-label="Scav cooldown minutes" className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-xs" />
              )}
            </>
          )}
        </div>
        {!compact && <p className="text-xs text-ink-dim">The raid timer starts from the game log. The log doesn't say whether you were a PMC or a Scav, so start the scav cooldown by hand.</p>}
      </div>
    </div>
  )
}
