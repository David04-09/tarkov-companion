import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, Gauge, Map as MapIcon, Minus, Plus } from 'lucide-react'
import { useCrafts, useGameData, useHideout, useItems } from '../api/hooks'
import type { Task } from '../api/types'
import { ErrorPanel, LoadingPanel, RefreshErrorBanner } from '../components/DataState'
import { KappaBadge } from '../components/Badges'
import { TimersCard } from '../desktop/TimersCard'
import { isDesktop } from '../desktop/useDesktop'
import { useNeeds } from '../hooks/useNeeds'
import { craftEconomics } from '../lib/economy'
import { formatNumber, formatRoubles, formatTimeAgo } from '../lib/format'
import { nextHideoutLevels } from '../lib/hideoutPlan'
import { estimateLevelFromQuests, type LevelEstimate } from '../lib/levelEstimate'
import { CURRENCY_ITEM_IDS, remainingFor } from '../lib/needs'
import { computeTaskStatuses, countStatuses, isFactionEligible } from '../lib/taskStatus'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { buildBringList } from '../maps/overlay/bringList'
import { buildSpawnModel } from '../maps/overlay/spawns'
import { useInventoryStore } from '../store/inventory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { MAX_LEVEL, MIN_LEVEL, useProfile, useProgressStore, type Faction } from '../store/progress'
import { useUiStore } from '../store/ui'

const FACTIONS: Faction[] = ['USEC', 'BEAR']

function LevelCard({ estimate }: { estimate: LevelEstimate | null }) {
  const profile = useProfile()
  const setPlayerLevel = useProgressStore((s) => s.setPlayerLevel)
  const below = estimate !== null && profile.playerLevel < estimate.minLevel
  return (
    <div className="card">
      <h2 className="card-title">Player level</h2>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => setPlayerLevel(profile.playerLevel - 1)} disabled={profile.playerLevel <= MIN_LEVEL} aria-label="Decrease level" className="btn px-2"><Minus className="h-4 w-4" /></button>
        <input type="number" min={MIN_LEVEL} max={MAX_LEVEL} value={profile.playerLevel} onChange={(e) => setPlayerLevel(e.target.valueAsNumber)} aria-label="Player level" className="w-20 rounded border border-line bg-surface px-2 py-1.5 text-center text-xl font-semibold text-accent focus:border-accent focus:outline-none" />
        <button type="button" onClick={() => setPlayerLevel(profile.playerLevel + 1)} disabled={profile.playerLevel >= MAX_LEVEL} aria-label="Increase level" className="btn px-2"><Plus className="h-4 w-4" /></button>
      </div>
      {estimate && (
        <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${below ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface'}`}>
          <div className="flex items-center gap-1.5 text-ink-muted"><Gauge className="h-3.5 w-3.5 text-accent" aria-hidden /><span>Level estimate: <span className="font-semibold text-ink">at least {estimate.minLevel}</span></span></div>
          <p className="mt-0.5 text-ink-dim">{formatNumber(estimate.questXp)} XP from {estimate.completedCount} completed quests{estimate.xpToNext != null ? ` · ${formatNumber(estimate.xpToNext)} XP to level ${estimate.minLevel + 1}` : ''}. Raids, kills and crafting add more.</p>
          {below && <button type="button" onClick={() => setPlayerLevel(estimate.minLevel)} className="btn mt-1.5 !px-2 !py-0.5 !text-[11px]">Set level to {estimate.minLevel}</button>}
        </div>
      )}
    </div>
  )
}

function FactionCard() {
  const profile = useProfile()
  const setFaction = useProgressStore((s) => s.setFaction)
  return (
    <div className="card">
      <h2 className="card-title">Faction</h2>
      <div className="mt-3 flex rounded border border-line bg-surface p-0.5" role="group" aria-label="Faction">
        {FACTIONS.map((f) => (
          <button key={f} type="button" onClick={() => setFaction(f)} aria-pressed={profile.faction === f} className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold transition-colors ${profile.faction === f ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>{f}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">Faction-specific quests are filtered for you.</p>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-3xl font-semibold ${tone}`}>{value}</span>
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
    </div>
  )
}

function Progress({ label, done, total, tone }: { label: string; done: number; total: number; tone: string }) {
  const pct = total ? Math.round((100 * done) / total) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs"><span className="text-ink-muted">{label}</span><span className="tabular-nums">{done} / {total} · {pct}%</span></div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-surface-3"><div className={`h-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function NextUpRow({ task }: { task: Task }) {
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  return (
    <li className="flex items-center gap-3 px-4 py-2 hover:bg-surface-3">
      <input type="checkbox" checked={false} onChange={() => setTaskCompleted(task.id, true)} aria-label={`Mark ${task.name} complete`} className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{task.name}</span>{task.kappaRequired && <KappaBadge />}</div>
        <div className="text-xs text-ink-muted">{task.trader.name} · {task.map?.name ?? 'Any map'}</div>
      </div>
      <span className="shrink-0 rounded bg-surface px-2 py-0.5 text-xs text-ink-muted" title="Minimum level">Lv {task.minPlayerLevel > 0 ? task.minPlayerLevel : '–'}</span>
      {task.wikiLink && <a href={task.wikiLink} target="_blank" rel="noreferrer" title="Open wiki page" className="shrink-0 text-ink-dim hover:text-accent"><ExternalLink className="h-4 w-4" /></a>}
    </li>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const profile = useProfile()
  const gameMode = useProgressStore((s) => s.gameMode)
  const query = useGameData()
  const itemsQuery = useItems()
  const hideout = useHideout()
  const crafts = useCrafts()
  const { needs, inventory } = useNeeds()
  const favorites = useInventoryStore((s) => s.favoriteCraftIds)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const setTasksChecked = useMapOverlayStore((s) => s.setTasksChecked)
  const checkedTaskIds = useMapOverlayStore((s) => s.checkedTaskIds)

  const estimate = useMemo(
    () => (query.data && itemsQuery.data ? estimateLevelFromQuests(query.data.tasks, profile.completedTaskIds, itemsQuery.data.playerLevels) : null),
    [query.data, itemsQuery.data, profile.completedTaskIds],
  )

  const derived = useMemo(() => {
    if (!query.data) return null
    const eligible = query.data.tasks.filter((t) => isFactionEligible(t, profile.faction))
    const statuses = computeTaskStatuses(eligible, profile)
    const counts = countStatuses(statuses)
    const nextUp = eligible.filter((t) => statuses[t.id] === 'available').sort((a, b) => a.minPlayerLevel - b.minPlayerLevel || a.name.localeCompare(b.name)).slice(0, 10)
    const kappa = eligible.filter((t) => t.kappaRequired)
    const lk = eligible.filter((t) => t.lightkeeperRequired)
    return {
      counts,
      nextUp,
      total: eligible.length,
      statuses,
      kappa: { done: kappa.filter((t) => profile.completedTaskIds.has(t.id)).length, total: kappa.length },
      lightkeeper: { done: lk.filter((t) => profile.completedTaskIds.has(t.id)).length, total: lk.length },
    }
  }, [query.data, profile])

  const itemsSummary = useMemo(() => {
    let remaining = 0
    const top: { id: string; remaining: number }[] = []
    for (const n of needs.values()) {
      const r = remainingFor(n, inventory.collected[n.itemId] ?? 0)
      remaining += r
      if (r > 0) top.push({ id: n.itemId, remaining: r })
    }
    top.sort((a, b) => b.remaining - a.remaining)
    return { remaining, distinct: top.length, top: top.slice(0, 5) }
  }, [needs, inventory.collected])

  const buildable = useMemo(
    () => (hideout.data ? nextHideoutLevels(hideout.data, inventory.stationLevels, inventory.collected, CURRENCY_ITEM_IDS).filter((n) => n.prereqsMet).slice(0, 6) : []),
    [hideout.data, inventory.stationLevels, inventory.collected],
  )

  const topCrafts = useMemo(() => {
    if (!crafts.data || !itemsQuery.data || !hideout.data) return []
    const stationsById = Object.fromEntries(hideout.data.map((s) => [s.id, s]))
    const anyBuilt = Object.values(inventory.stationLevels).some((l) => l > 0)
    return crafts.data
      .filter((c) => !anyBuilt || (inventory.stationLevels[c.stationId] ?? 0) >= c.level)
      .map((c) => craftEconomics(c, itemsQuery.data!.items, stationsById))
      .filter((e) => e.profitPerHour != null && e.profitPerHour > 0)
      .sort((a, b) => (b.profitPerHour ?? 0) - (a.profitPerHour ?? 0))
      .slice(0, 5)
  }, [crafts.data, itemsQuery.data, hideout.data, inventory.stationLevels])

  // Every map's quest spots and bosses depend only on the game data: built once per data load,
  // not again on every quest tick (that rebuilt all ~515 quests for a dozen maps each time).
  const perMap = useMemo(() => {
    if (!query.data) return []
    const out: { map: (typeof query.data.maps)[number]; mapTasks: MapTask[]; bosses: string[] }[] = []
    for (const m of query.data.maps) {
      const cfg = findMapConfig(m.normalizedName)
      if (!cfg) continue
      const layer = resolveBaseLayer(cfg, undefined)
      const spawnModel = buildSpawnModel(query.data, m.id)
      const bosses = spawnModel.bosses
        .filter((e) => e.spawnChance > 0 && (e.group !== 'goons' || spawnModel.goonsHere))
        .slice(0, 3)
        .map((e) => `${e.group === 'goons' ? 'Goons' : e.name} ${Math.round(e.spawnChance * 100)}%`)
      out.push({ map: m, mapTasks: buildMapTasks(query.data, m.id, layer), bosses })
    }
    return out
  }, [query.data])

  const tonight = useMemo(() => {
    if (!derived) return []
    const checked = new Set(checkedTaskIds)
    const rows: { key: string; name: string; tasks: number; ticked: number; spots: number; taskIds: string[]; bosses: string[]; bringFrom: MapTask[] }[] = []
    for (const { map: m, mapTasks: all, bosses } of perMap) {
      const mapTasks = all.filter((mt) => derived.statuses[mt.task.id] === 'available')
      if (mapTasks.length === 0) continue
      const tickedHere = mapTasks.filter((mt) => checked.has(mt.task.id))
      rows.push({ key: m.normalizedName, name: m.name, tasks: mapTasks.length, ticked: tickedHere.length, spots: mapTasks.reduce((n, mt) => n + mt.placements.length, 0), taskIds: mapTasks.map((mt) => mt.task.id), bosses: [...new Set(bosses)], bringFrom: tickedHere.length ? tickedHere : mapTasks })
    }
    // Maps with quests you ticked on the Maps tab come first, then the most available quests.
    return rows.sort((a, b) => b.ticked - a.ticked || b.tasks - a.tasks || b.spots - a.spots).slice(0, 3)
  }, [perMap, derived, checkedTaskIds])
  const tonightBring = useMemo(() => (tonight[0] ? buildBringList(tonight[0].bringFrom) : []), [tonight])

  const itemName = (id: string) => itemsQuery.data?.items[id]?.name ?? '…'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-muted">{gameMode === 'pve' ? 'PvE' : 'PvP'} profile · {profile.faction} · level {profile.playerLevel}</p>
        </div>
        {query.data && <p className="text-xs text-ink-dim">Data updated {formatTimeAgo(query.data.fetchedAt)}</p>}
      </div>

      {query.isError && query.data && <RefreshErrorBanner error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending && <div className="mt-6"><LoadingPanel label="quests" /></div>}
      {query.isError && !query.data && <div className="mt-6"><ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} /></div>}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <LevelCard estimate={estimate} />
        <FactionCard />
        <div className="card">
          <h2 className="card-title">Quests</h2>
          {derived ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat label="Completed" value={derived.counts.completed} tone="text-success" />
                <Stat label="Available" value={derived.counts.available} tone="text-accent" />
                <Stat label="Locked" value={derived.counts.locked} tone="text-ink-dim" />
              </div>
              <div className="mt-3 space-y-2">
                <Progress label="Kappa required" done={derived.kappa.done} total={derived.kappa.total} tone="bg-accent" />
                <Progress label="Lightkeeper chain" done={derived.lightkeeper.done} total={derived.lightkeeper.total} tone="bg-info" />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">{query.isError ? 'Unavailable' : 'Loading…'}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="flex items-center justify-between"><h2 className="card-title">Tonight's raid</h2><Link to="/maps" className="text-xs text-accent hover:underline">Maps</Link></div>
          {tonight.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">No map has available objectives yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {tonight.map((m, i) => (
                <li key={m.key} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${i === 0 ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface'}`}>
                  <MapIcon className={`h-4 w-4 shrink-0 ${i === 0 ? 'text-accent' : 'text-ink-dim'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs text-ink-muted">{m.ticked > 0 ? `${m.ticked} ticked · ` : ''}{m.tasks} available quest{m.tasks === 1 ? '' : 's'} · {m.spots} marked spot{m.spots === 1 ? '' : 's'}</div>
                    {m.bosses.length > 0 && <div className="truncate text-[11px] text-[#f4a261]">Bosses: {m.bosses.join(' · ')}</div>}
                  </div>
                  <button type="button" onClick={() => { setLastMapKey(m.key); if (m.ticked === 0) setTasksChecked(m.taskIds, true); navigate('/maps') }} className="btn !px-2 !py-0.5 !text-[11px]">Open <ArrowRight className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          {tonight[0] && tonightBring.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              <div className="mb-1 text-[11px] text-ink-dim">Bring to {tonight[0].name} ({tonight[0].ticked > 0 ? `${tonight[0].ticked} ticked quest${tonight[0].ticked === 1 ? '' : 's'}` : `all ${tonight[0].tasks} available quests`})</div>
              <ul className="flex flex-wrap gap-1">
                {tonightBring.slice(0, 10).map((e, i) => {
                  const it = e.itemIds[0] ? itemsQuery.data?.items[e.itemIds[0]] : undefined
                  return (
                    <li key={i} title={`For: ${e.quests.join(', ')}`} className="flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[11px]">
                      {it?.iconLink && <img src={it.iconLink} alt="" className="h-4 w-4 object-contain" />}
                      <span className="max-w-32 truncate">{e.questItemName ?? it?.shortName ?? '…'}</span>
                      {e.count > 1 && <span className="text-ink-dim">×{e.count}</span>}
                    </li>
                  )
                })}
                {tonightBring.length > 10 && <li className="px-1 text-[11px] text-ink-dim">+{tonightBring.length - 10} more on the map</li>}
              </ul>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between"><h2 className="card-title">Items needed</h2><Link to="/items" className="text-xs text-accent hover:underline">Item Collection</Link></div>
          <p className="mt-3 text-sm"><span className="text-2xl font-semibold text-accent">{formatNumber(itemsSummary.remaining)}</span> <span className="text-ink-muted">items across {itemsSummary.distinct} kinds</span></p>
          <ul className="mt-2 space-y-1 text-xs">
            {itemsSummary.top.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                {itemsQuery.data?.items[t.id]?.iconLink && <img src={itemsQuery.data.items[t.id].iconLink ?? ''} alt="" className="h-5 w-5 object-contain" />}
                <span className="min-w-0 flex-1 truncate">{itemName(t.id)}</span>
                <span className="tabular-nums text-ink-muted">×{t.remaining}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <div className="flex items-center justify-between"><h2 className="card-title">Hideout: buildable now</h2><Link to="/hideout" className="text-xs text-accent hover:underline">Hideout</Link></div>
          {!hideout.data ? (
            <p className="mt-3 text-sm text-ink-muted">Loading…</p>
          ) : buildable.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Nothing buildable: upgrade the prerequisite stations first.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-xs">
              {buildable.map((n) => (
                <li key={n.level.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{n.station.name} → {n.level.level}</span>
                  <span className={`tabular-nums ${n.missingItems === 0 ? 'text-success' : 'text-ink-muted'}`}>{n.missingItems === 0 ? 'items ready' : `${n.missingItems} items missing`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between"><h2 className="card-title">Top crafts by profit per hour</h2><Link to="/crafts" className="text-xs text-accent hover:underline">Crafts</Link></div>
          {topCrafts.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">{crafts.isPending || itemsQuery.isPending ? 'Loading…' : 'No profitable craft at your hideout levels.'}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {topCrafts.map((c) => (
                <li key={c.craft.id} className="flex items-center gap-3 py-1.5">
                  {c.outputItem?.iconLink && <img src={c.outputItem.iconLink} alt="" className="h-7 w-7 object-contain" />}
                  <span className="min-w-0 flex-1 truncate">{c.outputItem?.name}{favorites.includes(c.craft.id) ? ' ★' : ''}<span className="text-xs text-ink-dim"> · {c.station?.name} L{c.craft.level}</span></span>
                  <span className="tabular-nums text-success">{formatRoubles(c.profitPerHour)}/h</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {isDesktop() ? <TimersCard /> : (
          <div className="card">
            <h2 className="card-title">Timers</h2>
            <p className="mt-3 text-sm text-ink-muted">Raid timer, run-through countdown and scav cooldown appear in the desktop app, driven by the game log.</p>
          </div>
        )}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Next up</h2>
          <Link to="/quests" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">All quests <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {derived && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
            {derived.nextUp.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">No quests are available right now. Raise your level or check the Locked filter on the Quests tab.</p>
            ) : (
              <ul className="divide-y divide-line">{derived.nextUp.map((task) => <NextUpRow key={task.id} task={task} />)}</ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
