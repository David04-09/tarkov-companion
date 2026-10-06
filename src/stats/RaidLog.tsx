import { useMemo, useState } from 'react'
import { Eye, EyeOff, Plus, ScrollText, Trash2 } from 'lucide-react'
import type { GameMode } from '../api/client'
import { formatMinutes, type RaidRecord } from '../lib/logStats'
import { RESULT_LABEL, raidKey, survivalOf, useRaidLogStore, type RaidEntry, type RaidResult, type RaidRole } from '../store/raidLog'

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

/** PMC / Scav toggle (also used by the after-raid prompt). */
export function RoleButtons({ value, onPick }: { value: RaidRole | undefined; onPick: (r: RaidRole | undefined) => void }) {
  return (
    <span className="flex gap-1">
      {(['pmc', 'scav'] as RaidRole[]).map((role) => (
        <button key={role} type="button" aria-pressed={value === role} onClick={() => onPick(value === role ? undefined : role)} className={`rounded border px-1.5 py-0.5 text-[11px] uppercase ${value === role ? 'border-accent bg-accent/15 text-accent' : 'border-line text-ink-dim hover:text-ink'}`}>
          {role}
        </button>
      ))}
    </span>
  )
}

interface Row {
  key: string
  location: string
  at: number
  minutes: number | null
  manual: boolean
  hidden: boolean
}

/**
 * Every raid the logs know about (plus raids you add by hand), newest first, where you mark
 * how it went. Marked raids give your own survival rate (overall and per map); the logs cannot
 * tell this by themselves. Wrong entries can be hidden.
 */
export function RaidLog({ raids, mode, mapName, mapNames }: { raids: RaidRecord[]; mode: GameMode; mapName: (location: string) => string; mapNames: string[] }) {
  const entries = useRaidLogStore((s) => s.byMode[mode])
  const manual = useRaidLogStore((s) => s.manual?.[mode] ?? [])
  const hiddenKeys = useRaidLogStore((s) => s.hidden?.[mode] ?? [])
  const { setEntry, addManual, removeManual, setHidden } = useRaidLogStore.getState()
  const [onlyUnmarked, setOnlyUnmarked] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [shown, setShown] = useState(30)
  const [adding, setAdding] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const hidden = new Set(hiddenKeys)
    const logged = raids.map((r) => {
      const key = raidKey(r.raidId, r.end ?? r.start)
      return { key, location: mapName(r.location), at: r.end ?? r.start, minutes: r.minutes, manual: false, hidden: hidden.has(key) }
    })
    const added = manual.map((m) => ({ key: m.key, location: m.location, at: m.at, minutes: m.minutes, manual: true, hidden: false }))
    return [...logged, ...added].sort((a, b) => b.at - a.at)
    // mapName only depends on the map list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raids, manual, hiddenKeys])

  const counted = rows.filter((r) => !r.hidden)
  const all = survivalOf(counted.map((r) => entries[r.key]))
  const byRole = (role: RaidRole) => survivalOf(counted.filter((r) => entries[r.key]?.role === role).map((r) => entries[r.key]))
  const perMap = (() => {
    const m = new Map<string, (RaidEntry | undefined)[]>()
    for (const r of counted) m.set(r.location, [...(m.get(r.location) ?? []), entries[r.key]])
    return [...m.entries()].map(([loc, list]) => ({ loc, ...survivalOf(list) })).filter((x) => x.marked > 0).sort((a, b) => b.marked - a.marked)
  })()
  const list = rows.filter((r) => (showHidden || !r.hidden) && (!onlyUnmarked || !entries[r.key]?.result))
  const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`)
  const pmc = byRole('pmc')
  const scav = byRole('scav')
  const hiddenCount = rows.filter((r) => r.hidden).length

  return (
    <section className="rounded-lg border border-line bg-surface-2">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><ScrollText className="h-3.5 w-3.5 text-accent" /> Raid log</h2>
        <span className="text-xs text-ink-muted">
          Survival rate <b className="text-ink">{pct(all.rate)}</b> ({all.marked} of {counted.length} raids marked{manual.length ? `, ${manual.length} added by hand` : ''})
          {pmc.marked > 0 && <> · PMC {pct(pmc.rate)}</>}
          {scav.marked > 0 && <> · Scav {pct(scav.rate)}</>}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyUnmarked} onChange={(e) => setOnlyUnmarked(e.target.checked)} /> Only unmarked</label>
          {hiddenCount > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show {hiddenCount} hidden</label>}
          <button type="button" onClick={() => setAdding((v) => !v)} className="btn !px-2 !py-0.5 !text-xs"><Plus className="h-3.5 w-3.5" /> Add a raid</button>
        </span>
      </div>
      {adding && <AddRaidForm mapNames={mapNames} onCancel={() => setAdding(false)} onAdd={(raid, entry) => { addManual(mode, raid, entry); setAdding(false) }} />}
      {perMap.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-ink-muted">
          {perMap.map((m) => (
            <span key={m.loc} title={`${m.survived} survived · ${m.runthrough} run-through · ${m.died} died · ${m.mia} MIA`}>
              {m.loc} <b className="text-ink">{pct(m.rate)}</b> <span className="text-ink-dim">({m.marked})</span>
            </span>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-muted">{rows.length ? 'Every raid in this period is marked.' : 'No raids in this period.'}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {list.slice(0, shown).map((r) => {
            const e = entries[r.key]
            return (
              <li key={r.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm ${r.hidden ? 'opacity-45' : ''}`}>
                <span className="w-28 shrink-0 text-xs tabular-nums text-ink-muted">{new Date(r.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="w-32 shrink-0 truncate text-ink">{r.location}{r.manual && <span className="ml-1 text-[10px] text-ink-dim">(added)</span>}</span>
                <span className="w-16 shrink-0 text-xs tabular-nums text-ink-dim">{r.minutes !== null ? formatMinutes(r.minutes) : '–'}</span>
                <ResultButtons value={e?.result} onPick={(result) => setEntry(mode, r.key, { result })} />
                <RoleButtons value={e?.role} onPick={(role) => setEntry(mode, r.key, { role })} />
                <input
                  type="text"
                  defaultValue={e?.note ?? ''}
                  onBlur={(ev) => ev.target.value !== (e?.note ?? '') && setEntry(mode, r.key, { note: ev.target.value })}
                  placeholder="Note (e.g. killed by Tagilla at Dorms)"
                  className="min-w-40 flex-1 rounded border border-line bg-surface px-2 py-0.5 text-xs"
                />
                {r.manual ? (
                  <button type="button" onClick={() => removeManual(mode, r.key)} title="Delete this raid you added" className="text-ink-dim hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                ) : (
                  <button type="button" onClick={() => setHidden(mode, r.key, !r.hidden)} title={r.hidden ? 'Count this raid again' : 'Hide this raid (wrong entry) — it stops counting'} className="text-ink-dim hover:text-ink">
                    {r.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 30)} className="w-full border-t border-line py-1.5 text-xs text-accent hover:bg-surface-3">Show {Math.min(30, list.length - shown)} more</button>
      )}
      <p className="border-t border-line px-4 py-1.5 text-[11px] text-ink-dim">The game log records each raid but not how it ended, so you mark it. Run-throughs count as survived. Add raids the logs missed with "Add a raid"; hide wrong entries with the eye. Marks are saved on this PC and included in the progress export.</p>
    </section>
  )
}

function AddRaidForm({ mapNames, onAdd, onCancel }: { mapNames: string[]; onAdd: (raid: { location: string; at: number; minutes: number | null }, entry: RaidEntry) => void; onCancel: () => void }) {
  // Now, as the local date-time the input expects.
  const [local] = useState(() => {
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })
  const [location, setLocation] = useState(mapNames[0] ?? '')
  const [when, setWhen] = useState(local)
  const [minutes, setMinutes] = useState('')
  const [result, setResult] = useState<RaidResult | undefined>(undefined)
  const [role, setRole] = useState<RaidRole | undefined>(undefined)
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent/5 px-4 py-2 text-xs">
      <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Map" className="rounded border border-line bg-surface px-2 py-1">
        {mapNames.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When" className="rounded border border-line bg-surface px-2 py-1" />
      <input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="min" aria-label="Length in minutes" className="w-16 rounded border border-line bg-surface px-2 py-1" />
      <ResultButtons value={result} onPick={setResult} />
      <RoleButtons value={role} onPick={setRole} />
      <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" className="min-w-32 flex-1 rounded border border-line bg-surface px-2 py-1" />
      <button
        type="button"
        disabled={!location || !when}
        onClick={() => onAdd({ location, at: new Date(when).getTime(), minutes: minutes ? Number(minutes) : null }, { result, role, note: note || undefined })}
        className="btn !py-1 border-accent text-accent disabled:opacity-40"
      >
        Add
      </button>
      <button type="button" onClick={onCancel} className="btn !py-1">Cancel</button>
    </div>
  )
}
