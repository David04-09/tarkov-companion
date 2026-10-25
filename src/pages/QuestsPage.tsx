import { Fragment, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  KeyRound,
  Lock,
  Search,
  Unlock,
} from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { GameData, GameMap, ItemsById, Task, TaskObjective } from '../api/types'
import type { WikiQuestKind } from '../api/wikiQuests'
import { useWikiQuests } from '../hooks/useWikiQuests'
import { KappaBadge, LightkeeperBadge, StatusPill } from '../components/Badges'
import { ObjectiveFacts } from '../components/ObjectiveFacts'
import { AutoTickBadge } from '../desktop/SyncReview'
import { QuestGuide } from '../components/QuestGuide'
import { ErrorPanel, LoadingPanel, RefreshErrorBanner } from '../components/DataState'
import { formatNumber, formatObjectiveType, formatTimeAgo } from '../lib/format'
import {
  STATUS_LABEL,
  computeTaskStatuses,
  countStatuses,
  isFactionEligible,
  type TaskStatus,
} from '../lib/taskStatus'
import { isRequirementMet, lockReasons, type ProgressContext } from '../lib/progression'
import { useProgressContext } from '../hooks/useProgressContext'
import { requiredClosure } from '../quests/questGraph'
import { useProfile, useProgressStore } from '../store/progress'
import { SegmentButton } from '../components/SegmentButton'
import { QuestTreeView } from '../quests/QuestTree'
import { useLinkParam } from '../lib/linkParam'

type StatusFilter = 'all' | TaskStatus
type SortKey = 'name' | 'trader' | 'map' | 'minPlayerLevel'
type SortDir = 'asc' | 'desc'

const STATUS_FILTERS: StatusFilter[] = ['all', 'available', 'locked', 'completed']
const MAP_ANY = '__any__'

type WikiKinds = Record<WikiQuestKind, boolean>
const WIKI_KEY = 'tc-quests-wiki'
const WIKI_KINDS: WikiQuestKind[] = ['regular', 'event', 'seasonal', 'arena', 'past']
const WIKI_DEFAULT: WikiKinds = { regular: true, event: true, seasonal: false, arena: false, past: false }
const WIKI_LABEL: Record<WikiQuestKind, string> = { regular: 'New', event: 'Event', seasonal: 'Seasonal mode', arena: 'Arena', past: 'Past (removed)' }
const WIKI_TITLE: Record<WikiQuestKind, string> = {
  regular: 'On the EFT Wiki but not in the game data yet (new, or part of a story chapter)',
  event: 'Event quest from the EFT Wiki: given only while its event runs',
  seasonal: 'Only in the Seasonal mode (EFT Wiki)',
  arena: 'Escape from Tarkov: Arena quest (a separate game)',
  past: 'No longer in the game: the EFT Wiki keeps it as history',
}

function loadWikiKinds(): WikiKinds {
  try {
    const saved = JSON.parse(localStorage.getItem(WIKI_KEY) ?? '{}') as Partial<Record<string, unknown>>
    return Object.fromEntries(WIKI_KINDS.map((k) => [k, typeof saved[k] === 'boolean' ? saved[k] : WIKI_DEFAULT[k]])) as WikiKinds
  } catch {
    return { ...WIKI_DEFAULT }
  }
}

/** The game data with the wiki-only quests added (Quests tab list and details). */
function withWiki(data: GameData, wiki: Task[]): GameData {
  if (!wiki.length) return data
  const tasksById = { ...data.tasksById }
  for (const t of wiki) tasksById[t.id] ??= t
  return { ...data, tasks: [...data.tasks, ...wiki], tasksById }
}

/** Map filter: the quest's map, or one of the maps a wiki quest names. */
function onMap(t: Task, mapId: string, maps: GameMap[]): boolean {
  if (t.map?.id === mapId) return true
  const name = maps.find((m) => m.id === mapId)?.name.toLowerCase()
  return Boolean(name && t.wiki?.locations.some((l) => l.toLowerCase() === name))
}

/** Map column text: one map, "Any", or the wiki's list of maps. */
function mapLabel(t: Task): string | null {
  if (t.map) return t.map.name
  const locs = t.wiki?.locations ?? []
  if (!locs.length) return null
  return locs.length <= 2 ? locs.join(', ') : `${locs.slice(0, 2).join(', ')} +${locs.length - 2}`
}

function WikiBadge({ kind }: { kind: WikiQuestKind }) {
  return (
    <span className={`rounded border px-1 text-[10px] ${kind === 'past' ? 'border-line text-ink-dim' : 'border-info/50 text-info'}`} title={WIKI_TITLE[kind]}>
      Wiki{kind === 'regular' ? '' : ` · ${WIKI_LABEL[kind]}`}
    </span>
  )
}

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
            <ObjectiveFacts objective={o} className="block text-xs text-ink-muted" warnClassName="block rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-xs text-warning" />
            <div className="flex flex-wrap items-center gap-1.5">
              {o.type !== 'wiki' && (
                <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
                  {formatObjectiveType(o.type)}
                </span>
              )}
              {o.maps.map((m) => (
                <span key={m.id} className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink-muted">
                  {m.name}
                </span>
              ))}
              <ObjectiveItems objective={o} items={items} itemsLoading={itemsLoading} />
              <ObjectiveNeeds objective={o} items={items} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Keys, gear to wear, weapons to use and markers an objective asks for (from the quest data). */
function ObjectiveNeeds({ objective: o, items }: { objective: TaskObjective; items: ItemsById | undefined }) {
  const name = (id: string) => items?.[id]?.name ?? 'item'
  const chip = 'inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-xs'
  return (
    <>
      {o.requiredKeys.map((group, i) => (
        <span key={`k${i}`} className={chip} title="Key needed for this objective">
          <KeyRound className="h-3 w-3 text-warning" />
          {group.map(name).join(' or ')}
        </span>
      ))}
      {o.markerItemId && (
        <span className={chip} title="Bring this to mark the spot">
          Bring: {name(o.markerItemId)}
        </span>
      )}
      {o.wearingIds.length > 0 && (
        <span className={chip} title={o.wearingIds.map((outfit) => outfit.map(name).join(' + ')).join('\nor ')}>
          Wear: {o.wearingIds[0].map(name).join(' + ')}
          {o.wearingIds.length > 1 ? ` (or ${o.wearingIds.length - 1} other outfit${o.wearingIds.length > 2 ? 's' : ''})` : ''}
        </span>
      )}
      {o.usingWeaponIds.length > 0 && (
        <span className={chip} title={o.usingWeaponIds.map(name).join('\n')}>
          Use: {o.usingWeaponIds.slice(0, 3).map(name).join(', ')}
          {o.usingWeaponIds.length > 3 ? ` or ${o.usingWeaponIds.length - 3} more` : ''}
        </span>
      )}
    </>
  )
}

/** ✓ when met, a lock when not. */
function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Met" /> : <Lock className="h-4 w-4 shrink-0 text-ink-dim" aria-label="Not met" />
}

/** Everything a quest needs before you can take it, each with whether you meet it. */
function RequirementList({ task, data, ctx }: { task: Task; data: GameData; ctx: ProgressContext | null }) {
  const profile = useProfile()
  const completed = ctx?.completed ?? profile.completedTaskIds
  const level = ctx?.level ?? profile.playerLevel
  const traderName = (id: string) => data.traders.find((t) => t.id === id)?.name ?? 'Trader'
  const story = task.otherRequirements.filter((r) => !/loyalty level|reputation/i.test(r))
  return (
    <ul className="space-y-1">
      {task.minPlayerLevel > 0 && (
        <li className="flex items-center gap-2">
          <Mark ok={level >= task.minPlayerLevel} />
          <span>
            Level {task.minPlayerLevel}
            <span className="text-ink-dim"> (you: {level}{level > profile.playerLevel ? ', from your quest XP' : ''})</span>
          </span>
        </li>
      )}
      {task.taskRequirements.map((req) => {
        const prereq = data.tasksById[req.taskId]
        const met = ctx ? isRequirementMet(req.status, req.taskId, ctx) : completed.has(req.taskId)
        const how = req.status.includes('active') && !req.status.includes('complete') ? 'started' : req.status.includes('failed') && !req.status.includes('complete') ? 'failed' : req.status.includes('failed') ? 'done or failed' : 'done'
        return (
          <li key={req.taskId} className="flex items-center gap-2">
            <Mark ok={met} />
            <span className={met ? '' : 'text-ink-muted'}>
              {prereq?.name ?? req.taskId}
              <span className="text-ink-dim"> {how}</span>
              {ctx?.inferred.has(req.taskId) && <span className="text-ink-dim" title="A later quest is done or started, so this one must be done"> · done by deduction</span>}
            </span>
          </li>
        )
      })}
      {task.traderRequirements.map((r, i) => {
        if (r.type === 'level') {
          const have = ctx?.traderLevel[r.traderId] ?? 1
          return (
            <li key={`t${i}`} className="flex items-center gap-2">
              <Mark ok={have >= r.value} />
              <span>
                {traderName(r.traderId)} loyalty level {r.value}
                <span className="text-ink-dim"> (you: {have})</span>
              </span>
            </li>
          )
        }
        const rep = ctx?.reputation[r.traderId]
        return (
          <li key={`t${i}`} className="flex items-center gap-2 text-ink-muted">
            <span className="w-4 shrink-0 text-center text-ink-dim">?</span>
            <span>
              {traderName(r.traderId)} reputation {r.compare} {r.value}
              <span className="text-ink-dim"> ({rep !== undefined ? `${rep.toFixed(2)} from quests; ` : ''}check in game)</span>
            </span>
          </li>
        )
      })}
      {story.map((r, i) => (
        <li key={`o${i}`} className="flex items-center gap-2 text-ink-muted">
          <span className="w-4 shrink-0 text-center text-ink-dim">?</span>
          <span>
            {r}
            <span className="text-ink-dim"> (not tracked; never locks it here)</span>
          </span>
        </li>
      ))}
      {task.minPlayerLevel <= 0 && task.taskRequirements.length === 0 && task.traderRequirements.length === 0 && story.length === 0 && <li className="text-ink-muted">Nothing: it can be taken from the start.</li>}
    </ul>
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
  ctx,
}: {
  task: Task
  data: GameData
  status: TaskStatus
  items: ItemsById | undefined
  itemsLoading: boolean
  ctx: ProgressContext | null
}) {
  const profile = useProfile()
  const mode = useProgressStore((s) => s.gameMode)
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  const setTaskActive = useProgressStore((s) => s.setTaskActiveFor)
  const addCompleted = useProgressStore((s) => s.addCompletedFor)
  const active = profile.activeTaskIds.has(task.id)
  const removed = task.wiki?.kind === 'past'
  const reasons = ctx && status === 'locked' && !removed ? lockReasons(task, ctx, (id) => data.tasksById[id]?.name ?? 'an earlier quest', (id) => data.traders.find((t) => t.id === id)?.name ?? 'the trader') : []
  // Everything before it that is not done yet (not this quest itself).
  const before = ctx ? [...requiredClosure([task.id], data.tasksById, ctx.completed)].filter((id) => id !== task.id) : []
  const keyMaps = task.neededKeys.filter((k) => k.keyIds.length > 0)

  return (
    <div className="grid gap-6 border-t border-line bg-surface px-4 py-4 md:grid-cols-[1fr_280px]">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Objectives</h3>
        <ObjectiveList task={task} items={items} itemsLoading={itemsLoading} />
        <div className="mt-4">
          <QuestGuide task={task} />
        </div>
      </div>

      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-ink-muted">Trader</dt>
          <dd>{task.trader.name}</dd>
          <dt className="text-ink-muted">Map</dt>
          <dd>{task.map?.name ?? (task.wiki?.locations.length ? task.wiki.locations.join(', ') : 'Any')}</dd>
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

        {task.wiki && (
          <div className="rounded border border-info/40 bg-info/10 px-3 py-2 text-xs text-ink-muted">
            <div className="font-semibold uppercase tracking-wide text-info">From the EFT Wiki</div>
            <p className="mt-1">
              {removed
                ? 'No longer in the game: the wiki keeps it as history.'
                : task.wiki.kind === 'arena'
                  ? 'A quest in Escape from Tarkov: Arena, a separate game.'
                  : task.wiki.kind === 'seasonal'
                    ? 'Only in the Seasonal mode. '
                    : task.wiki.kind === 'event'
                      ? 'Part of an event: the trader gives it only while the event runs. '
                      : 'The game data (tarkov.dev) does not have this quest yet. '}
              {!removed && task.wiki.kind !== 'arena' && 'No map spots, and the game log cannot tick it: tick it here by hand.'}
            </p>
          </div>
        )}

        {reasons.length > 0 && (
          <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-warning">Locked because</div>
            <ul className="mt-1 list-disc pl-4 text-ink-muted">
              {reasons.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-dim">Have it in game anyway? Use "I have this quest" below: it counts as open, and everything before it as done.</p>
          </div>
        )}
        {ctx?.inferred.has(task.id) && <p className="text-xs text-ink-muted">Done by deduction: a later quest is done or started, so this one must be finished. Tick it to make it official.</p>}

        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">What it needs</h3>
          <RequirementList task={task} data={data} ctx={ctx} />
        </div>

        {task.wiki && task.wiki.rewards.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Rewards</h3>
            <ul className="list-disc space-y-0.5 pl-4">
              {task.wiki.rewards.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {keyMaps.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Keys</h3>
            <ul className="space-y-0.5">
              {keyMaps.map((k) => (
                <li key={k.mapId}>
                  <span className="text-ink-muted">{data.maps.find((m) => m.id === k.mapId)?.name ?? 'Map'}: </span>
                  {k.keyIds.map((id) => items?.[id]?.name ?? (itemsLoading ? 'Loading…' : 'Key')).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTaskCompleted(task.id, status !== 'completed' || Boolean(ctx?.inferred.has(task.id)))}
            className="btn"
          >
            <Check className="h-4 w-4" />
            {status === 'completed' && !ctx?.inferred.has(task.id) ? 'Mark incomplete' : 'Mark complete'}
          </button>
          {status !== 'completed' && (
            <button type="button" onClick={() => setTaskActive(mode, task.id, !active)} className={`btn ${active ? '!border-success/60 !text-success' : ''}`} title="The game gave you this quest: it counts as open here, and everything before it as done">
              <Unlock className="h-4 w-4" />
              {active ? 'I have this quest ✓' : 'I have this quest'}
            </button>
          )}
          {status !== 'completed' && before.length > 0 && (
            <button type="button" onClick={() => addCompleted(mode, before)} className="btn" title={before.map((id) => data.tasksById[id]?.name).filter(Boolean).join('\n')}>
              <Check className="h-4 w-4" />
              Mark the {before.length} before it done
            </button>
          )}
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
  progress,
}: {
  tasks: Task[]
  data: GameData
  statuses: Record<string, TaskStatus>
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  items: ItemsById | undefined
  itemsLoading: boolean
  progress: ProgressContext | null
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  const gameMode = useProgressStore((s) => s.gameMode)

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
                        onChange={(e) => setTaskCompleted(task.id, e.target.checked || Boolean(progress?.inferred.has(task.id)))}
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
                        {task.wiki && <WikiBadge kind={task.wiki.kind} />}
                        {status === 'completed' && <AutoTickBadge mode={gameMode} taskId={task.id} />}
                        {progress?.inferred.has(task.id) && <span className="rounded border border-line px-1 text-[10px] text-ink-dim" title="A later quest is done or started, so this one must be finished">by deduction</span>}
                        {status !== 'completed' && progress?.active.has(task.id) && <span className="rounded border border-success/50 px-1 text-[10px] text-success" title="Started in game (from the log) or marked I have this quest">started</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{task.trader.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap" title={task.wiki?.locations.join(', ') || undefined}>{mapLabel(task) ?? <span className="text-ink-dim">Any</span>}</td>
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
                          ctx={progress}
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

type QuestsView = 'list' | 'tree'
const VIEW_KEY = 'tc-quests-view'

/** Quests tab: the filterable list, or the trader trees / Kappa and Lightkeeper paths. */
export function QuestsPage() {
  const [view, setViewState] = useState<QuestsView>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'tree' ? 'tree' : 'list'
    } catch {
      return 'list'
    }
  })
  const setView = (v: QuestsView) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // remembering the view is only a convenience
    }
  }
  // A quest asked for by name ("show quest Debut") is shown in the list.
  useLinkParam('q', () => setViewState('list'))
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div className="flex items-center gap-1 rounded border border-line bg-surface-2 p-0.5">
          <SegmentButton label="List" active={view === 'list'} onClick={() => setView('list')} />
          <SegmentButton label="Tree & Kappa path" active={view === 'tree'} onClick={() => setView('tree')} />
        </div>
      </div>
      {view === 'list' ? (
        <QuestList />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Quest tree</h1>
          <p className="mb-4 text-sm text-ink-muted">Each trader's quests as a chain, and everything still needed for Kappa or Lightkeeper.</p>
          <QuestTreeView />
        </>
      )}
    </div>
  )
}

function QuestList() {
  const profile = useProfile()
  const mode = useProgressStore((s) => s.gameMode)
  const addCompleted = useProgressStore((s) => s.addCompletedFor)
  const query = useGameData()
  // Quests only the EFT Wiki has (new, event, Seasonal, Arena, past), behind their own switches.
  const [wikiKinds, setWikiKinds] = useState<WikiKinds>(loadWikiKinds)
  const toggleWikiKind = (k: WikiQuestKind) => {
    const next = { ...wikiKinds, [k]: !wikiKinds[k] }
    setWikiKinds(next)
    try {
      localStorage.setItem(WIKI_KEY, JSON.stringify(next))
    } catch {
      // remembering the switches is only a convenience
    }
  }
  const wiki = useWikiQuests(wikiKinds.past)
  const progress = useProgressContext(wiki.tasks)
  const data = useMemo(() => (query.data ? withWiki(query.data, wiki.tasks) : undefined), [query.data, wiki.tasks])
  const wikiCounts = useMemo(() => {
    const out: Partial<Record<WikiQuestKind, number>> = {}
    for (const t of wiki.tasks) if (t.wiki && isFactionEligible(t, profile.faction)) out[t.wiki.kind] = (out[t.wiki.kind] ?? 0) + 1
    return out
  }, [wiki.tasks, profile.faction])
  // Items are only needed for objective names/icons, so load them in the background.
  const itemsQuery = useItems()

  // "?q=Debut" (links from the assistant) opens the list searched for that quest, any status.
  const [params] = useSearchParams()
  const [search, setSearch] = useState(() => params.get('q') ?? '')
  const [trader, setTrader] = useState('all')
  const [map, setMap] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => (params.get('q') ? 'all' : 'available'))
  // Also while the tab is open ("show quest Debut" by voice).
  useLinkParam('q', (q) => {
    setSearch(q)
    setStatusFilter('all')
    setTrader('all')
    setMap('all')
  })
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'minPlayerLevel', dir: 'asc' })

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const derived = useMemo(() => {
    if (!data) return null
    const eligible = data.tasks.filter((t) => isFactionEligible(t, profile.faction) && (!t.wiki || wikiKinds[t.wiki.kind]))
    const statuses = computeTaskStatuses(eligible, profile, progress ?? undefined)
    // Removed quests can be ticked (history) but are never "available".
    for (const t of eligible) if (t.wiki?.kind === 'past' && statuses[t.id] === 'available') statuses[t.id] = 'locked'
    const counts = countStatuses(statuses)

    const needle = search.trim().toLowerCase()
    const filtered = eligible.filter((t) => {
      if (statusFilter !== 'all' && statuses[t.id] !== statusFilter) return false
      if (trader !== 'all' && t.trader.id !== trader) return false
      if (map !== 'all') {
        if (map === MAP_ANY ? t.map !== null || Boolean(t.wiki?.locations.length) : !onMap(t, map, data.maps)) return false
      }
      if (needle) {
        const hay = `${t.name} ${t.trader.name} ${t.map?.name ?? ''} ${t.wiki?.locations.join(' ') ?? ''}`.toLowerCase()
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
          r = (mapLabel(a) ?? 'Any').localeCompare(mapLabel(b) ?? 'Any')
          break
        case 'minPlayerLevel':
          r = a.minPlayerLevel - b.minPlayerLevel
          break
      }
      if (r === 0) r = a.name.localeCompare(b.name)
      return r * dir
    })

    return { statuses, counts, filtered, total: eligible.length }
  }, [data, profile, progress, search, trader, map, statusFilter, sort, wikiKinds])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Quests</h1>
          {derived && (
            <p className="text-sm text-ink-muted">
              Showing {derived.filtered.length} of {derived.total} quests for {profile.faction} · level{' '}
              {progress?.level ?? profile.playerLevel}
              {progress && progress.level > profile.playerLevel ? ' (from your quest XP)' : ''}
            </p>
          )}
          {progress && progress.inferred.size > 0 && (
            <p className="mt-1 text-sm text-ink-muted">
              {progress.inferred.size} earlier quest{progress.inferred.size === 1 ? ' counts' : 's count'} as done because a later one is done or started.{' '}
              <button type="button" onClick={() => addCompleted(mode, [...progress.inferred])} className="text-accent underline">
                Tick {progress.inferred.size === 1 ? 'it' : 'them'}
              </button>
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

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-ink-muted" title="Quests the EFT Wiki lists that the game data (tarkov.dev) does not have">Also from the EFT Wiki:</span>
        {WIKI_KINDS.map((k) => {
          const on = wikiKinds[k]
          const count = wikiCounts[k]
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleWikiKind(k)}
              aria-pressed={on}
              title={WIKI_TITLE[k]}
              className={`rounded border px-2 py-0.5 transition-colors ${on ? 'border-info/60 bg-info/10 text-info' : 'border-line text-ink-muted hover:text-ink'}`}
            >
              {on ? '✓ ' : ''}
              {WIKI_LABEL[k]}
              {count != null && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}
        {wiki.loading && <span className="text-ink-dim">reading the wiki…</span>}
        {wiki.error != null && (
          <span className="text-danger">
            The wiki could not be read ({wiki.error instanceof Error ? wiki.error.message : 'error'}).{' '}
            <button type="button" onClick={wiki.retry} className="underline">
              Try again
            </button>
          </span>
        )}
      </div>

      <div className="mt-4">
        {query.isError && query.data && (
          <RefreshErrorBanner error={query.error} onRetry={() => void query.refetch()} />
        )}
        {query.isPending && <LoadingPanel label="quests" />}
        {query.isError && !query.data && (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        )}
        {data && derived && (
          <QuestTable
            tasks={derived.filtered}
            data={data}
            progress={progress}
            statuses={derived.statuses}
            sort={sort}
            onSort={onSort}
            items={itemsQuery.data?.items}
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
