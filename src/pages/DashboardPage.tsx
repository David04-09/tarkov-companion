import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink, Gauge, Minus, Plus } from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { Task } from '../api/types'
import { ErrorPanel, LoadingPanel, RefreshErrorBanner } from '../components/DataState'
import { KappaBadge } from '../components/Badges'
import { formatNumber, formatTimeAgo } from '../lib/format'
import { estimateLevelFromQuests, type LevelEstimate } from '../lib/levelEstimate'
import { computeTaskStatuses, countStatuses, isFactionEligible } from '../lib/taskStatus'
import { MAX_LEVEL, MIN_LEVEL, useProfile, useProgressStore, type Faction } from '../store/progress'

const FACTIONS: Faction[] = ['USEC', 'BEAR']

function LevelCard({ estimate }: { estimate: LevelEstimate | null }) {
  const profile = useProfile()
  const setPlayerLevel = useProgressStore((s) => s.setPlayerLevel)
  const below = estimate !== null && profile.playerLevel < estimate.minLevel
  return (
    <div className="card">
      <h2 className="card-title">Player level</h2>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlayerLevel(profile.playerLevel - 1)}
          disabled={profile.playerLevel <= MIN_LEVEL}
          aria-label="Decrease level"
          className="btn px-2"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          min={MIN_LEVEL}
          max={MAX_LEVEL}
          value={profile.playerLevel}
          onChange={(e) => setPlayerLevel(e.target.valueAsNumber)}
          aria-label="Player level"
          className="w-20 rounded border border-line bg-surface px-2 py-1.5 text-center text-xl font-semibold text-accent focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setPlayerLevel(profile.playerLevel + 1)}
          disabled={profile.playerLevel >= MAX_LEVEL}
          aria-label="Increase level"
          className="btn px-2"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">Quests unlock as your level rises.</p>
      {estimate && (
        <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${below ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface'}`}>
          <div className="flex items-center gap-1.5 text-ink-muted">
            <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden />
            <span>
              Level estimate: <span className="font-semibold text-ink">at least {estimate.minLevel}</span>
            </span>
          </div>
          <p className="mt-0.5 text-ink-dim">
            {formatNumber(estimate.questXp)} XP from {estimate.completedCount} completed quests
            {estimate.xpToNext != null ? ` · ${formatNumber(estimate.xpToNext)} XP to level ${estimate.minLevel + 1}` : ''}. Raids, kills and
            crafting add more, so your real level is higher. The game doesn't log your level and the public profile needs a browser check we can't pass.
          </p>
          {below && (
            <button type="button" onClick={() => setPlayerLevel(estimate.minLevel)} className="btn mt-1.5 !px-2 !py-0.5 !text-[11px]">
              Set level to {estimate.minLevel}
            </button>
          )}
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
        {FACTIONS.map((f) => {
          const active = profile.faction === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFaction(f)}
              aria-pressed={active}
              className={`flex-1 rounded px-3 py-1.5 text-sm font-semibold transition-colors ${
                active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {f}
            </button>
          )
        })}
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

function NextUpRow({ task }: { task: Task }) {
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3">
      <input
        type="checkbox"
        checked={false}
        onChange={() => setTaskCompleted(task.id, true)}
        aria-label={`Mark ${task.name} complete`}
        className="h-4 w-4 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{task.name}</span>
          {task.kappaRequired && <KappaBadge />}
        </div>
        <div className="text-xs text-ink-muted">
          {task.trader.name} · {task.map?.name ?? 'Any map'}
        </div>
      </div>
      <span className="shrink-0 rounded bg-surface px-2 py-0.5 text-xs text-ink-muted" title="Minimum level">
        Lv {task.minPlayerLevel > 0 ? task.minPlayerLevel : '–'}
      </span>
      {task.wikiLink && (
        <a
          href={task.wikiLink}
          target="_blank"
          rel="noreferrer"
          title="Open wiki page"
          className="shrink-0 text-ink-dim hover:text-accent"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </li>
  )
}

export function DashboardPage() {
  const profile = useProfile()
  const gameMode = useProgressStore((s) => s.gameMode)
  const query = useGameData()
  const itemsQuery = useItems()

  const estimate = useMemo(
    () =>
      query.data && itemsQuery.data
        ? estimateLevelFromQuests(query.data.tasks, profile.completedTaskIds, itemsQuery.data.playerLevels)
        : null,
    [query.data, itemsQuery.data, profile.completedTaskIds],
  )

  const derived = useMemo(() => {
    if (!query.data) return null
    const eligible = query.data.tasks.filter((t) => isFactionEligible(t, profile.faction))
    const statuses = computeTaskStatuses(eligible, profile)
    const counts = countStatuses(statuses)
    const nextUp = eligible
      .filter((t) => statuses[t.id] === 'available')
      .sort((a, b) => a.minPlayerLevel - b.minPlayerLevel || a.name.localeCompare(b.name))
      .slice(0, 10)
    return { counts, nextUp, total: eligible.length }
  }, [query.data, profile])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink-muted">
            {gameMode === 'pve' ? 'PvE' : 'PvP'} profile · {profile.faction} · level {profile.playerLevel}
          </p>
        </div>
        {query.data && (
          <p className="text-xs text-ink-dim">Data updated {formatTimeAgo(query.data.fetchedAt)}</p>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <LevelCard estimate={estimate} />
        <FactionCard />
        <div className="card">
          <h2 className="card-title">Quests</h2>
          {derived ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="Completed" value={derived.counts.completed} tone="text-success" />
              <Stat label="Available" value={derived.counts.available} tone="text-accent" />
              <Stat label="Locked" value={derived.counts.locked} tone="text-ink-dim" />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">{query.isError ? 'Unavailable' : 'Loading…'}</p>
          )}
          {derived && (
            <p className="mt-2 text-xs text-ink-muted">{derived.total} quests for your faction</p>
          )}
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Next up</h2>
          <Link to="/quests" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            All quests <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {query.isError && query.data && (
          <RefreshErrorBanner error={query.error} onRetry={() => void query.refetch()} />
        )}

        {query.isPending && <LoadingPanel label="quests" />}
        {query.isError && !query.data && (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        )}

        {derived && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
            {derived.nextUp.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-muted">
                No quests are available right now. Raise your level or check the Locked filter on the
                Quests tab to see what comes next.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {derived.nextUp.map((task) => (
                  <NextUpRow key={task.id} task={task} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
