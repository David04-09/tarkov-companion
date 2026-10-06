import { useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import type { GameMode } from '../api/client'
import { formatMinutes, type RaidRecord } from '../lib/logStats'
import { RESULT_LABEL, raidKey, survivalOf, useRaidLogStore, type RaidResult, type RaidRole } from '../store/raidLog'

const RESULTS: RaidResult[] = ['survived', 'died', 'mia', 'runthrough']
const RESULT_TONE: Record<RaidResult, string> = {
  survived: 'border-success bg-success/20 text-success',
  runthrough: 'border-info bg-info/20 text-info',
  died: 'border-danger bg-danger/20 text-danger',
  mia: 'border-accent bg-accent/20 text-accent',
}

/** Buttons to mark one raid's result (also used by the after-raid prompt). */
export function ResultButtons({ value, onPick }: { value: RaidResult | undefined; onPick: (r: RaidResult | undefined) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {RESULTS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onPick(value === r ? undefined : r)}
          className={`rounded border px-1.5 py-0.5 text-[11px] ${value === r ? RESULT_TONE[r] : 'border-line text-ink-muted hover:text-ink'}`}
        >
          {RESULT_LABEL[r]}
        </button>
      ))}
    </span>
  )
}

/**
 * Every raid the logs know about, newest first, where you mark how it went. Marked raids
 * give your own survival rate (overall and per map); the logs cannot tell this by themselves.
 */
export function RaidLog({ raids, mode, mapName }: { raids: RaidRecord[]; mode: GameMode; mapName: (location: string) => string }) {
  const entries = useRaidLogStore((s) => s.byMode[mode])
  const setEntry = useRaidLogStore((s) => s.setEntry)
  const [onlyUnmarked, setOnlyUnmarked] = useState(false)
  const [shown, setShown] = useState(30)
  const ordered = useMemo(() => [...raids].sort((a, b) => (b.end ?? b.start) - (a.end ?? a.start)), [raids])
  const keyOf = (r: RaidRecord) => raidKey(r.raidId, r.end ?? r.start)
  const all = survivalOf(ordered.map((r) => entries[keyOf(r)]))
  const byRole = (role: RaidRole) => survivalOf(ordered.filter((r) => entries[keyOf(r)]?.role === role).map((r) => entries[keyOf(r)]))
  const perMap = useMemo(() => {
    const m = new Map<string, RaidRecord[]>()
    for (const r of ordered) m.set(r.location, [...(m.get(r.location) ?? []), r])
    return [...m.entries()].map(([loc, list]) => ({ loc, ...survivalOf(list.map((r) => entries[keyOf(r)])) })).filter((x) => x.marked > 0).sort((a, b) => b.marked - a.marked)
    // keyOf is stable for a given raid
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, entries])
  const list = ordered.filter((r) => !onlyUnmarked || !entries[keyOf(r)]?.result)
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)
  const pmc = byRole('pmc')
  const scav = byRole('scav')

  return (
    <section className="rounded-lg border border-line bg-surface-2">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><ScrollText className="h-3.5 w-3.5 text-accent" /> Raid log</h2>
        <span className="text-xs text-ink-muted">
          Survival rate <b className="text-ink">{pct(all.rate)}</b> ({all.marked} of {ordered.length} raids marked)
          {pmc.marked > 0 && <> · PMC {pct(pmc.rate)}</>}
          {scav.marked > 0 && <> · Scav {pct(scav.rate)}</>}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyUnmarked} onChange={(e) => setOnlyUnmarked(e.target.checked)} /> Only unmarked</label>
      </div>
      {perMap.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-ink-muted">
          {perMap.map((m) => (
            <span key={m.loc} title={`${m.survived} survived · ${m.runthrough} run-through · ${m.died} died · ${m.mia} MIA`}>
              {mapName(m.loc)} <b className="text-ink">{pct(m.rate)}</b> <span className="text-ink-dim">({m.marked})</span>
            </span>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-muted">{ordered.length ? 'Every raid in this period is marked.' : 'No raids in this period.'}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {list.slice(0, shown).map((r) => {
            const key = keyOf(r)
            const e = entries[key]
            return (
              <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm">
                <span className="w-28 shrink-0 text-xs tabular-nums text-ink-muted">{new Date(r.end ?? r.start).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="w-32 shrink-0 truncate text-ink">{mapName(r.location)}</span>
                <span className="w-16 shrink-0 text-xs tabular-nums text-ink-dim">{r.minutes !== null ? formatMinutes(r.minutes) : '–'}</span>
                <ResultButtons value={e?.result} onPick={(result) => setEntry(mode, key, { result })} />
                <span className="flex gap-1">
                  {(['pmc', 'scav'] as RaidRole[]).map((role) => (
                    <button key={role} type="button" aria-pressed={e?.role === role} onClick={() => setEntry(mode, key, { role: e?.role === role ? undefined : role })} className={`rounded border px-1.5 py-0.5 text-[11px] uppercase ${e?.role === role ? 'border-accent bg-accent/15 text-accent' : 'border-line text-ink-dim hover:text-ink'}`}>
                      {role}
                    </button>
                  ))}
                </span>
                <input
                  type="text"
                  defaultValue={e?.note ?? ''}
                  onBlur={(ev) => ev.target.value !== (e?.note ?? '') && setEntry(mode, key, { note: ev.target.value })}
                  placeholder="Note (e.g. killed by Tagilla at Dorms)"
                  className="min-w-40 flex-1 rounded border border-line bg-surface px-2 py-0.5 text-xs"
                />
              </li>
            )
          })}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 30)} className="w-full border-t border-line py-1.5 text-xs text-accent hover:bg-surface-3">Show {Math.min(30, list.length - shown)} more</button>
      )}
      <p className="border-t border-line px-4 py-1.5 text-[11px] text-ink-dim">The game log records each raid but not how it ended, so you mark it. Run-throughs count as survived. Marks are saved on this PC and included in the progress export.</p>
    </section>
  )
}
