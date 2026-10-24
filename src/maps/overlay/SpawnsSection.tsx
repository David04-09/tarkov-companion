import { Skull } from 'lucide-react'
import { formatTimeAgo } from '../../lib/format'
import { useMapOverlayStore } from '../../store/mapOverlay'
import { type BossEntry, type SpawnModel, spawnKey, toggleKeyFor } from './spawns'
import { MAP_NOTES } from './bossAreas'

const pct = (p: number) => `${Math.round(p * 100)}%`

function Portrait({ e }: { e: BossEntry }) {
  return e.portrait ? (
    <img src={e.portrait} alt="" className="h-6 w-6 shrink-0 rounded-full border border-[#e63946] object-cover" />
  ) : (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#e63946] bg-surface text-ink-muted"><Skull className="h-3.5 w-3.5" /></span>
  )
}

/** Where the boss shows up on this map: reported spots with their share, then what only the data lists. */
function SpotLines({ e, indent = 'ml-11' }: { e: BossEntry; indent?: string }) {
  const shown = e.spots.filter((s) => s.kind !== 'data')
  const dataOnly = e.spots.filter((s) => s.kind === 'data').reduce((n, s) => n + s.points.length, 0)
  if (!shown.length && !dataOnly && !MAP_NOTES[e.key]) return <p className={`${indent} text-[11px] text-ink-dim`}>Roams: no fixed spawn spot in the data.</p>
  return (
    <div className={`${indent} text-[11px] text-ink-dim`}>
      {shown.length > 0 && (
        <p>
          {shown.map((s, i) => (
            <span key={s.key} title={s.kind === 'reported' ? 'Players report it here (EFT Wiki map)' : 'Game-data spawn points'}>
              {i > 0 && ' · '}
              {s.kind === 'reported' ? '◌ ' : ''}
              {s.name}
              {s.share > 0 ? ` ${pct(s.share)}` : ''}
            </span>
          ))}
        </p>
      )}
      {dataOnly > 0 && <p>{dataOnly} more point{dataOnly === 1 ? '' : 's'} only in the game data (faded on the map).</p>}
      {MAP_NOTES[e.key] && <p className="text-amber-300/80">{MAP_NOTES[e.key]}</p>}
    </div>
  )
}

function Row({ checked, onChange, children, hint }: { checked: boolean; onChange: (on: boolean) => void; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex items-center gap-2" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5" />
      {children}
    </label>
  )
}

/** "Spawns" group in the Layers tab: bosses, special factions and plain PMC/Scav spawn points. */
export function SpawnsSection({ model }: { model: SpawnModel }) {
  const toggles = useMapOverlayStore((s) => s.spawnToggles)
  const setSpawnToggle = useMapOverlayStore((s) => s.setSpawnToggle)
  const setSpawnToggles = useMapOverlayStore((s) => s.setSpawnToggles)

  const bosses = model.bosses.filter((e) => e.group === 'boss')
  const groupEntry = (g: BossEntry['group']) => model.bosses.filter((e) => e.group === g)
  const goons = groupEntry('goons')
  const cultists = groupEntry('cultists')
  const raiders = groupEntry('raiders')
  const rogues = groupEntry('rogues')
  const groupChance = (list: BossEntry[]) => (list.length ? Math.max(...list.map((e) => e.spawnChance)) : 0)
  const allBossKeys = model.bosses.map(toggleKeyFor)
  const everyKey = [...new Set([...allBossKeys, ...model.bosses.map((e) => spawnKey.guards(e.key)), 'sniper', 'pmc', 'scav'])]
  const anyOn = everyKey.some((k) => toggles[k])

  return (
    <section className="border-b border-line px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Spawns</h3>
        <button type="button" onClick={() => setSpawnToggles(allBossKeys, true)} disabled={allBossKeys.length === 0} className="ml-auto text-[11px] text-accent underline disabled:opacity-40">all bosses</button>
        <button type="button" onClick={() => setSpawnToggles(everyKey, false)} disabled={!anyOn} className="text-[11px] text-accent underline disabled:opacity-40">clear</button>
      </div>

      {model.bosses.length === 0 && model.pmc.length === 0 && model.scav.length === 0 && <p className="text-ink-dim">No spawn data for this map.</p>}

      <ul className="space-y-1">
        {bosses.map((e) => {
          const on = Boolean(toggles[spawnKey.boss(e.key)])
          const guardCount = e.escorts.reduce((n, g) => n + (g.counts[g.counts.length - 1] ?? 0), 0)
          return (
            <li key={e.key}>
              <Row checked={on} onChange={(v) => setSpawnToggle(spawnKey.boss(e.key), v)} hint={e.conditions.join(' · ') || undefined}>
                <Portrait e={e} />
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tabular-nums text-ink-muted">{pct(e.spawnChance)}</span>
              </Row>
              <SpotLines e={e} />
              {e.conditions.length > 0 && <p className="ml-11 text-[11px] text-ink-dim">{e.conditions.join(' · ')}</p>}
              {e.escorts.length > 0 && (
                <div className="ml-11">
                  <Row checked={Boolean(toggles[spawnKey.guards(e.key)])} onChange={(v) => setSpawnToggle(spawnKey.guards(e.key), v)}>
                    <span className="text-ink-muted">Guards</span>
                    <span className="min-w-0 flex-1 truncate text-ink-dim">{e.escorts.map((g) => `${g.name} ×${g.counts.join('/') || '?'}`).join(', ')}</span>
                    <span className="text-ink-dim">{guardCount || ''}</span>
                  </Row>
                </div>
              )}
            </li>
          )
        })}

        {goons.length > 0 && (
          <li className={model.goonsHere ? 'rounded border border-[#ff4d6d]/60 bg-[#ff4d6d]/10 px-1.5 py-1' : ''}>
            <Row checked={Boolean(toggles.goons)} onChange={(v) => setSpawnToggle('goons', v)}>
              <span className="flex -space-x-2">{goons.map((e) => <Portrait key={e.key} e={e} />)}</span>
              <span className="min-w-0 flex-1 truncate">The Goons</span>
              <span className="tabular-nums text-ink-muted">{pct(groupChance(goons))}</span>
            </Row>
            {goons.map((e) => <SpotLines key={e.key} e={e} indent="ml-6" />)}
            <p className="ml-6 text-[11px] text-ink-dim">
              {model.goonsHere
                ? `Currently here per player reports${model.goonReportAt ? ` (${formatTimeAgo(model.goonReportAt)})` : ''}.`
                : 'Rotate between maps; not reported here right now.'}
            </p>
          </li>
        )}

        {cultists.length > 0 && (
          <li>
            <Row checked={Boolean(toggles.cultists)} onChange={(v) => setSpawnToggle('cultists', v)}>
              <span className="flex -space-x-2">{cultists.map((e) => <Portrait key={e.key} e={e} />)}</span>
              <span className="min-w-0 flex-1 truncate">Cultists</span>
              <span className="tabular-nums text-ink-muted">{pct(groupChance(cultists))}</span>
            </Row>
            {cultists.map((e) => <SpotLines key={e.key} e={e} indent="ml-6" />)}
            <p className="ml-6 text-[11px] text-ink-dim">Night raids only.</p>
          </li>
        )}

        {raiders.length > 0 && (
          <li>
            <Row checked={Boolean(toggles.raiders)} onChange={(v) => setSpawnToggle('raiders', v)}>
              <Portrait e={raiders[0]} />
              <span className="min-w-0 flex-1 truncate">Raiders</span>
              <span className="tabular-nums text-ink-muted">{pct(groupChance(raiders))}</span>
            </Row>
            {raiders.flatMap((e) => e.conditions).length > 0 && <p className="ml-6 text-[11px] text-ink-dim">{[...new Set(raiders.flatMap((e) => e.conditions))].join(' · ')}</p>}
          </li>
        )}

        {rogues.length > 0 && (
          <li>
            <Row checked={Boolean(toggles.rogues)} onChange={(v) => setSpawnToggle('rogues', v)}>
              <Portrait e={rogues[0]} />
              <span className="min-w-0 flex-1 truncate">Rogues</span>
              <span className="tabular-nums text-ink-muted">{pct(groupChance(rogues))}</span>
            </Row>
            {rogues.map((e) => <SpotLines key={e.key} e={e} indent="ml-6" />)}
          </li>
        )}

        {model.sniper.length > 0 && (
          <li>
            <Row checked={Boolean(toggles.sniper)} onChange={(v) => setSpawnToggle('sniper', v)}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#ffd166' }} />
              <span className="min-w-0 flex-1 truncate">Sniper scavs</span>
              <span className="text-ink-dim">{model.sniper.length}</span>
            </Row>
          </li>
        )}
        <li>
          <Row checked={Boolean(toggles.pmc)} onChange={(v) => setSpawnToggle('pmc', v)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#4cc9f0' }} />
            <span className="min-w-0 flex-1 truncate">PMC spawns</span>
            <span className="text-ink-dim">{model.pmc.length || 'no data'}</span>
          </Row>
        </li>
        <li>
          <Row checked={Boolean(toggles.scav)} onChange={(v) => setSpawnToggle('scav', v)}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#f8961e' }} />
            <span className="min-w-0 flex-1 truncate">Scav spawns</span>
            <span className="text-ink-dim">{model.scav.length || 'no data'}</span>
          </Row>
        </li>
      </ul>
      <p className="mt-1 text-ink-dim">Chances and spawn points are tarkov.dev's game data. Dashed outlines (◌) are where players report the boss, traced from the EFT Wiki's maps (±7–18 m); faded dots are points only the game data lists, away from those areas.</p>
    </section>
  )
}
