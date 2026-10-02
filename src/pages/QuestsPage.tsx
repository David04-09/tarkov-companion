import { Fragment, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  Search,
} from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { GameData, ItemsById, Task, TaskObjective } from '../api/types'
import { KappaBadge, LightkeeperBadge, StatusPill } from '../components/Badges'
import { ErrorPanel, LoadingPanel, RefreshErrorBanner } from '../components/DataState'
import { formatNumber, formatObjectiveType, formatTimeAgo } from '../lib/format'
import {
  STATUS_LABEL,
  computeTaskStatuses,
  countStatuses,
  isFactionEligible,
  isRequirementMet,
  type TaskStatus,
} from '../lib/taskStatus'
import { useProfile, useProgressStore } from '../store/progress'

type StatusFilter = 'all' | TaskStatus
type SortKey = 'name' | 'trader' | 'map' | 'minPlayerLevel'
type SortDir = 'asc' | 'desc'

const STATUS_FILTERS: StatusFilter[] = ['all', 'available', 'locked', 'completed']
const MAP_ANY = '__any__'

const selectClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'

// ---------------------------------------------------------------------------
// Objective rendering
// ---------------------------------------------------------------------------

function ObjectiveItems({
  objective,
  items,
  itemsLoading,
}: {
  objective: TaskObjective
  items: ItemsById | undefined
  itemsLoading: boolean
}) {
  if (objective.questItem) {
    const q = objective.questItem
    return (
      <span className="inline-flex items-center gap-1.5 rounded bg-surface px-1.5 py-0.5 text-xs">
        {q.iconLink && <img src={q.iconLink} alt="" className="h-5 w-5 rounded-sm object-contain" />}
        <span>{q.name}</span>
        {objective.count && objective.count > 1 && <span className="text-ink-muted">×{objective.count}</span>}
        <span className="text-ink-dim">quest item</span>
      </span>
    )
  }
  if (objective.itemIds.length === 0) return null

  const first = items?.[objective.itemIds[0]]
  const others = objective.itemIds.length - 1
  const otherNames = items
    ? objective.itemIds
        .slice(1, 11)
        .map((id) => items[id]?.name ?? id)
        .join('\n')
    : ''

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded bg-surface px-1.5 py-0.5 text-xs">
      {first ? (
        <>
          {first.iconLink && <img src={first.iconLink} alt="" className="h-5 w-5 rounded-sm object-contain" />}
          <span>{first.name}</span>
        </>
      ) : (
        <span className="text-ink-dim">{itemsLoading ? 'Loading item name…' : 'Item'}</span>
      )}
      {others > 0 && (
        <span className="text-ink-muted" title={otherNames || undefined}>
          or {others} other{others === 1 ? '' : 's'}
        </span>
      )}
      {objective.count != null && <span className="text-ink-muted">×{formatNumber(objective.count)}</span>}
      {objective.foundInRaid && (
        <span
          className="rounded border border-info/60 px-1 text-[10px] font-semibold uppercase text-info"
          title="Must be found in raid"
        >
          FIR
        </span>
      )}
    </span>
  )
}

function ObjectiveList({
  task,
  items,
  itemsLoading,
}: {
  task: Task
  items: ItemsById | undefined
  itemsLoading: boolean
}) {
  if (task.objectives.length === 0) {
    return <p className="text-sm text-ink-muted">No objectives listed for this quest.</p>
  }
  return (
    <ol className="space-y-2">
      {task.objectives.map((o, i) => (
        <li key={o.id} className="flex gap-3 text-sm">
          <span className="w-5 shrink-0 text-right text-ink-dim">{i + 1}.</span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{o.description}</span>
              {o.optional && <span className="text-xs text-ink-dim">(optional)</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                {formatObjectiveType(o.type)}
              </span>
              {o.maps.map((m) => (
                <span key={m.id} className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                  {m.name}
                </span>
              ))}
              {o.type === 'shoot' && o.targetNames.length > 0 && (
                <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                  Target: {o.targetNames.join(', ')}
                  {o.count ? ` ×${o.count}` : ''}
                </span>
              )}
              <ObjectiveItems objective={o} items={items} itemsLoading={itemsLoading} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Expanded task detail
// ---------------------------------------------------------------------------

function TaskDetail({
  task,
  data,
  status,
  items,
  itemsLoading,
}: {
  task: Task
  data: GameData
  status: TaskStatus
  items: ItemsById | undefined
  itemsLoading: boolean
}) {
  const profile = useProfile()
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)

  return (
    <div className="grid gap-6 border-t border-line bg-surface px-4 py-4 md:grid-cols-[1fr_280px]">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Objectives</h3>
        <ObjectiveList task={task} items={items} itemsLoading={itemsLoading} />
      </div>

      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-muted">Trader</dt>
          <dd>{task.trader.name}</dd>
          <dt className="text-ink-muted">Map</dt>
          <dd>{task.map?.name ?? 'Any'}</dd>
          <dt className="text-ink-muted">Min level</dt>
          <dd>{task.minPlayerLevel > 0 ? task.minPlayerLevel : 'None'}</dd>
          <dt className="text-ink-muted">XP reward</dt>
          <dd>{formatNumber(task.experience)}</dd>
          {task.factionName !== 'Any' && (
            <>
              <dt className="text-ink-muted">Faction</dt>
              <dd>{task.factionName}</dd>
            </>
          )}
        </dl>

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Prerequisites</h3>
          {task.taskRequirements.length === 0 ? (
            <p className="text-ink-muted">None</p>
          ) : (
            <ul className="space-y-1">
              {task.taskRequirements.map((req) => {
                const prereq = data.tasksById[req.taskId]
                const met = isRequirementMet(req, profile.completedTaskIds)
                return (
                  <li key={req.taskId} className="flex items-center gap-2">
                    {met ? (
                      <Check className="h-4 w-4 shrink-0 text-success" aria-label="Met" />
                    ) : (
                      <Lock className="h-4 w-4 shrink-0 text-ink-dim" aria-label="Not met" />
                    )}
                    <span className={met ? '' : 'text-ink-muted'}>
                      {prereq?.name ?? req.taskId}
                      {!req.status.includes('complete') && (
                        <span className="text-ink-dim"> ({req.status.join('/')})</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {task.otherRequirements.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Also requires
            </h3>
            <ul className="space-y-0.5 text-ink-muted">
              {task.otherRequirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-dim">Not tracked by this app; shown for reference.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTaskCompleted(task.id, status !== 'completed')}
            className="btn"
          >
            <Check className="h-4 w-4" />
            {status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
          </button>
          {task.wikiLink && (
            <a href={task.wikiLink} target="_blank" rel="noreferrer" className="btn">
              <ExternalLink className="h-4 w-4" /> Wiki
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = '',
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" className={`px-3 py-2 text-left font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-accent' : ''}`}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </th>
  )
}

function QuestTable({
  tasks,
  data,
  statuses,
  sort,
  onSort,
  items,
  itemsLoading,
}: {
  tasks: Task[]
  data: GameData
  statuses: Record<string, TaskStatus>
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  items: ItemsById | undefined
  itemsLoading: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-3 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Done</span>
              </th>
              <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
              <SortHeader label="Trader" sortKey="trader" sort={sort} onSort={onSort} className="w-32" />
              <SortHeader label="Map" sortKey="map" sort={sort} onSort={onSort} className="w-40" />
              <SortHeader label="Min lvl" sortKey="minPlayerLevel" sort={sort} onSort={onSort} className="w-24" />
              <th scope="col" className="w-28 px-3 py-2 text-left font-medium">
                Status
              </th>
              <th scope="col" className="w-8 px-2 py-2">
                <span className="sr-only">Expand</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tasks.map((task) => {
              const status = statuses[task.id]
              const expanded = expandedId === task.id
              return (
                <Fragment key={task.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : task.id)}
                    className={`cursor-pointer hover:bg-surface-3 ${expanded ? 'bg-surface-3' : ''} ${
                      status === 'completed' ? 'text-ink-muted' : ''
                    }`}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={status === 'completed'}
                        onChange={(e) => setTaskCompleted(task.id, e.target.checked)}
                        aria-label={`Mark ${task.name} complete`}
                        className="h-4 w-4 align-middle"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${status === 'completed' ? 'line-through decoration-ink-dim' : ''}`}>
                          {task.name}
                        </span>
                        {task.kappaRequired && <KappaBadge />}
                        {task.lightkeeperRequired && <LightkeeperBadge />}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{task.trader.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{task.map?.name ?? <span className="text-ink-dim">Any</span>}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {task.minPlayerLevel > 0 ? task.minPlayerLevel : <span className="text-ink-dim">–</span>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={status} />
                    </td>
                    <td className="px-2 py-2 text-ink-dim">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <TaskDetail
                          task={task}
                          data={data}
                          status={status}
                          items={items}
                          itemsLoading={itemsLoading}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {tasks.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">No quests match these filters.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function QuestsPage() {
  const profile = useProfile()
  const query = useGameData()
  // Items are only needed for objective names/icons, so load them in the background.
  const itemsQuery = useItems()

  const [search, setSearch] = useState('')
  const [trader, setTrader] = useState('all')
  const [map, setMap] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('available')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'minPlayerLevel', dir: 'asc' })

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const derived = useMemo(() => {
    if (!query.data) return null
    const eligible = query.data.tasks.filter((t) => isFactionEligible(t, profile.faction))
    const statuses = computeTaskStatuses(eligible, profile)
    const counts = countStatuses(statuses)

    const needle = search.trim().toLowerCase()
    const filtered = eligible.filter((t) => {
      if (statusFilter !== 'all' && statuses[t.id] !== statusFilter) return false
      if (trader !== 'all' && t.trader.id !== trader) return false
      if (map !== 'all') {
        if (map === MAP_ANY ? t.map !== null : t.map?.id !== map) return false
      }
      if (needle) {
        const hay = `${t.name} ${t.trader.name} ${t.map?.name ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })

    const dir = sort.dir === 'asc' ? 1 : -1
    filtered.sort((a, b) => {
      let r = 0
      switch (sort.key) {
        case 'name':
          r = a.name.localeCompare(b.name)
          break
        case 'trader':
          r = a.trader.name.localeCompare(b.trader.name)
          break
        case 'map':
          r = (a.map?.name ?? 'Any').localeCompare(b.map?.name ?? 'Any')
          break
        case 'minPlayerLevel':
          r = a.minPlayerLevel - b.minPlayerLevel
          break
      }
      if (r === 0) r = a.name.localeCompare(b.name)
      return r * dir
    })

    return { statuses, counts, filtered, total: eligible.length }
  }, [query.data, profile, search, trader, map, statusFilter, sort])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Quests</h1>
          {derived && (
            <p className="text-sm text-ink-muted">
              Showing {derived.filtered.length} of {derived.total} quests for {profile.faction} · level{' '}
              {profile.playerLevel}
            </p>
          )}
        </div>
        {query.data && (
          <p className="text-xs text-ink-dim">
            Data updated {formatTimeAgo(query.data.fetchedAt)}
            {query.isFetching ? ' · refreshing…' : ''}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests…"
            aria-label="Search quests"
            className={`${selectClass} w-56 pl-8`}
          />
        </label>

        <select value={trader} onChange={(e) => setTrader(e.target.value)} aria-label="Trader" className={selectClass}>
          <option value="all">All traders</option>
          {query.data?.traders.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <select value={map} onChange={(e) => setMap(e.target.value)} aria-label="Map" className={selectClass}>
          <option value="all">All maps</option>
          <option value={MAP_ANY}>Any map</option>
          {query.data?.maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <div className="flex rounded border border-line bg-surface-2 p-0.5" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s
            const count = derived ? (s === 'all' ? derived.total : derived.counts[s]) : null
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                aria-pressed={active}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABEL[s]}
                {count != null && <span className="ml-1 opacity-70">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        {query.isError && query.data && (
          <RefreshErrorBanner error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isPending && <LoadingPanel label="quests" />}
        {query.isError && !query.data && (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        )}
        {query.data && derived && (
          <QuestTable
            tasks={derived.filtered}
            data={query.data}
            statuses={derived.statuses}
            sort={sort}
            onSort={onSort}
            items={itemsQuery.data}
            itemsLoading={itemsQuery.isPending}
          />
        )}
        {itemsQuery.isError && (
          <p className="mt-2 text-xs text-danger">
            Item names could not be loaded ({itemsQuery.error instanceof Error ? itemsQuery.error.message : 'error'}).
            Objectives still show, but without item details.
          </p>
        )}
      </div>
    </div>
  )
}
