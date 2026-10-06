import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Maximize2, Minus, Plus } from 'lucide-react'
import { useGameData } from '../api/hooks'
import type { GameData, Task } from '../api/types'
import { KappaBadge, LightkeeperBadge, StatusPill } from '../components/Badges'
import { ErrorPanel, LoadingPanel, RefreshErrorBanner } from '../components/DataState'
import { computeTaskStatuses, isFactionEligible, type TaskStatus } from '../lib/taskStatus'
import { useProfile, useProgressStore, type Profile } from '../store/progress'
import { allPrereqIds, buildUnlocks, layeredLayout, requiredClosure, topoOrder } from './questGraph'

type Mode = 'tree' | 'kappa' | 'lightkeeper'
type Grouping = 'trader' | 'status'

const NODE_W = 200
const NODE_H = 58
const STUB_H = 40
const COL_GAP = 72
const ROW_GAP = 14
const PAD = 16
const MIN_ZOOM = 0.25
const MAX_ZOOM = 1.5

const EXT = 'ext:'

const NODE_CLASS: Record<TaskStatus, string> = {
  completed: 'border-success/50 bg-success/10 text-ink-muted',
  available: 'border-accent bg-accent/15 text-ink',
  locked: 'border-line bg-surface-3 text-ink-dim',
}

const tabClass = (active: boolean) =>
  `rounded px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
  }`

// ---------------------------------------------------------------------------
// Root view
// ---------------------------------------------------------------------------

export function QuestTreeView() {
  const query = useGameData()
  const profile = useProfile()
  const [mode, setMode] = useState<Mode>('tree')
  const [traderId, setTraderId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const data = query.data
  const statuses = useMemo(() => (data ? computeTaskStatuses(data.tasks, profile) : {}), [data, profile])

  const openInTree = (task: Task) => {
    setTraderId(task.trader.id)
    setSelectedId(task.id)
    setMode('tree')
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex flex-wrap items-center gap-1 rounded border border-line bg-surface-2 p-1 w-fit">
        <button type="button" className={tabClass(mode === 'tree')} onClick={() => setMode('tree')}>
          Trader trees
        </button>
        <button type="button" className={tabClass(mode === 'kappa')} onClick={() => setMode('kappa')}>
          Path to Kappa
        </button>
        <button type="button" className={tabClass(mode === 'lightkeeper')} onClick={() => setMode('lightkeeper')}>
          Path to Lightkeeper
        </button>
      </div>

      <div className="mt-4">
        {query.isError && data && <RefreshErrorBanner error={query.error} onRetry={() => void query.refetch()} />}
        {query.isPending && <LoadingPanel label="quests" />}
        {query.isError && !data && (
          <ErrorPanel error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        )}
        {data && mode === 'tree' && (
          <TraderTrees
            data={data}
            profile={profile}
            statuses={statuses}
            traderId={traderId}
            onTrader={(id) => {
              setTraderId(id)
              setSelectedId(null)
            }}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={openInTree}
          />
        )}
        {data && mode !== 'tree' && (
          <PathList data={data} profile={profile} statuses={statuses} target={mode} onOpen={openInTree} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trader trees
// ---------------------------------------------------------------------------

interface PlacedNode {
  id: string
  x: number
  y: number
  h: number
  task: Task
  stub: boolean
}

function TraderTrees({
  data,
  profile,
  statuses,
  traderId,
  onTrader,
  selectedId,
  onSelect,
  onOpen,
}: {
  data: GameData
  profile: Profile
  statuses: Record<string, TaskStatus>
  traderId: string | null
  onTrader: (id: string) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpen: (task: Task) => void
}) {
  const eligible = useMemo(
    () => data.tasks.filter((t) => isFactionEligible(t, profile.faction)),
    [data.tasks, profile.faction],
  )

  const traders = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>()
    for (const t of eligible) {
      const c = counts.get(t.trader.id) ?? { total: 0, done: 0 }
      c.total++
      if (profile.completedTaskIds.has(t.id)) c.done++
      counts.set(t.trader.id, c)
    }
    return data.traders.filter((tr) => counts.has(tr.id)).map((tr) => ({ trader: tr, ...counts.get(tr.id)! }))
  }, [data.traders, eligible, profile.completedTaskIds])

  const activeTraderId = traderId && traders.some((t) => t.trader.id === traderId) ? traderId : traders[0]?.trader.id

  const unlocks = useMemo(() => buildUnlocks(eligible), [eligible])

  const graph = useMemo(() => {
    const own = eligible.filter((t) => t.trader.id === activeTraderId)
    const ownIds = new Set(own.map((t) => t.id))
    const prereqs = new Map<string, string[]>()
    const stubIds = new Set<string>()
    for (const t of own) {
      const list: string[] = []
      for (const p of allPrereqIds(t)) {
        if (ownIds.has(p)) list.push(p)
        else if (data.tasksById[p]) {
          list.push(EXT + p)
          stubIds.add(EXT + p)
        }
      }
      prereqs.set(t.id, list)
    }
    const ids = [...stubIds, ...[...own].sort((a, b) => a.minPlayerLevel - b.minPlayerLevel).map((t) => t.id)]
    const layout = layeredLayout(ids, (id) => prereqs.get(id) ?? [])

    const nodes = new Map<string, PlacedNode>()
    const colHeight = (layer: string[]) =>
      layer.reduce((s, id) => s + (id.startsWith(EXT) ? STUB_H : NODE_H), 0) + Math.max(0, layer.length - 1) * ROW_GAP
    const maxH = Math.max(0, ...layout.layers.map(colHeight))
    layout.layers.forEach((layer, l) => {
      let y = PAD + (maxH - colHeight(layer)) / 2
      for (const id of layer) {
        const stub = id.startsWith(EXT)
        const task = data.tasksById[stub ? id.slice(EXT.length) : id]
        const h = stub ? STUB_H : NODE_H
        nodes.set(id, { id, x: PAD + l * (NODE_W + COL_GAP), y, h, task, stub })
        y += h + ROW_GAP
      }
    })
    const width = PAD * 2 + Math.max(0, layout.layers.length * (NODE_W + COL_GAP) - COL_GAP)
    const height = PAD * 2 + maxH
    return { nodes, edges: layout.edges, width, height }
  }, [eligible, activeTraderId, data.tasksById])

  // Zoom and scrolling (inside the diagram box only).
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fit = () => {
    const el = scrollRef.current
    if (!el || graph.width === 0) return
    const z = Math.min((el.clientWidth - 4) / graph.width, (el.clientHeight - 4) / graph.height, 1)
    setZoom(Math.max(MIN_ZOOM, Math.round(z * 100) / 100))
  }
  const step = (d: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + d) * 100) / 100)))

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0, top: 0 })
  }, [activeTraderId])

  useEffect(() => {
    if (!selectedId) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-node="${selectedId}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId, activeTraderId])

  const selected = selectedId ? data.tasksById[selectedId] : undefined

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap gap-1.5">
        {traders.map(({ trader, total, done }) => {
          const active = trader.id === activeTraderId
          return (
            <button
              key={trader.id}
              type="button"
              onClick={() => onTrader(trader.id)}
              title={`${trader.name}: ${done} of ${total} quests done`}
              className={`flex items-center gap-2 rounded border px-2 py-1 text-sm transition-colors ${
                active ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface-2 text-ink-muted hover:text-ink'
              }`}
            >
              {trader.imageLink ? (
                <img src={trader.imageLink} alt="" className="h-7 w-7 rounded-sm object-cover" />
              ) : (
                <span className="h-7 w-7 rounded-sm bg-surface-3" />
              )}
              <span>{trader.name}</span>
              <span className="text-xs text-ink-dim">
                {done}/{total}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex min-w-0 flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 rounded border border-line bg-surface-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs text-ink-muted">
            <Legend />
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => step(-0.1)}
                className="rounded border border-line p-1 hover:text-ink"
                title="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => step(0.1)}
                className="rounded border border-line p-1 hover:text-ink"
                title="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={fit}
                className="flex items-center gap-1 rounded border border-line px-1.5 py-1 hover:text-ink"
                title="Fit the whole tree in the box"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Fit
              </button>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="max-h-[70vh] min-h-48 overflow-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null)
            }}
          >
            {graph.nodes.size === 0 ? (
              <p className="p-4 text-sm text-ink-muted">This trader has no quests for your faction.</p>
            ) : (
              <div style={{ width: graph.width * zoom, height: graph.height * zoom }}>
                <div
                  className="relative"
                  style={{
                    width: graph.width,
                    height: graph.height,
                    transform: `scale(${zoom})`,
                    transformOrigin: '0 0',
                  }}
                >
                  <svg width={graph.width} height={graph.height} className="pointer-events-none absolute inset-0">
                    {graph.edges.map((e) => {
                      const a = graph.nodes.get(e.from)!
                      const b = graph.nodes.get(e.to)!
                      const x1 = a.x + NODE_W
                      const y1 = a.y + a.h / 2
                      const x2 = b.x
                      const y2 = b.y + b.h / 2
                      const mx = (x1 + x2) / 2
                      const hot = e.to === selectedId || e.from === selectedId
                      const fromDone = profile.completedTaskIds.has(a.task.id)
                      return (
                        <path
                          key={`${e.from}>${e.to}`}
                          d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                          fill="none"
                          stroke={
                            hot ? 'var(--color-accent)' : fromDone ? 'var(--color-success)' : 'var(--color-ink-dim)'
                          }
                          strokeOpacity={hot ? 1 : fromDone ? 0.45 : 0.6}
                          strokeWidth={hot ? 2.5 : 1.5}
                          strokeDasharray={a.stub ? '4 3' : undefined}
                        />
                      )
                    })}
                  </svg>
                  {[...graph.nodes.values()].map((n) => (
                    <TreeNode
                      key={n.id}
                      node={n}
                      status={statuses[n.task.id] ?? 'locked'}
                      selected={n.task.id === selectedId}
                      onClick={() => (n.stub ? onOpen(n.task) : onSelect(n.task.id === selectedId ? null : n.task.id))}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 lg:w-80">
          {selected ? (
            <QuestPanel
              task={selected}
              data={data}
              status={statuses[selected.id] ?? 'locked'}
              statuses={statuses}
              unlocks={unlocks.get(selected.id) ?? []}
              completed={profile.completedTaskIds.has(selected.id)}
              onOpen={onOpen}
            />
          ) : (
            <div className="rounded border border-line bg-surface-2 p-4 text-sm text-ink-muted">
              Click a quest box to see what it needs, what it unlocks, and to tick it off. Dashed boxes are quests from
              other traders that come first; click one to jump to that trader.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-accent bg-accent/15" /> Can do now
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-line bg-surface-3" /> Locked
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-success/50 bg-success/10" /> Done
      </span>
    </div>
  )
}

function TreeNode({
  node,
  status,
  selected,
  onClick,
}: {
  node: PlacedNode
  status: TaskStatus
  selected: boolean
  onClick: () => void
}) {
  const { task } = node
  const pos = { left: node.x, top: node.y, width: NODE_W, height: node.h }
  if (node.stub) {
    return (
      <button
        type="button"
        data-node={task.id}
        onClick={onClick}
        style={pos}
        title={`Needs "${task.name}" from ${task.trader.name} first. Click to open ${task.trader.name}'s tree.`}
        className={`absolute flex flex-col justify-center rounded border border-dashed px-2 text-left text-[11px] leading-tight ${
          status === 'completed' ? 'border-success/50 text-ink-dim' : 'border-ink-dim text-ink-muted'
        } bg-surface hover:text-ink`}
      >
        <span className="text-ink-dim">from {task.trader.name}:</span>
        <span className="truncate">{task.name}</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      data-node={task.id}
      onClick={onClick}
      style={pos}
      title={task.name}
      className={`absolute flex flex-col justify-between rounded border px-2 py-1.5 text-left transition-shadow ${
        NODE_CLASS[status]
      } ${status === 'completed' ? 'opacity-75' : ''} ${selected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-2' : 'hover:brightness-125'}`}
    >
      <span className="line-clamp-2 text-xs font-medium leading-tight">{task.name}</span>
      <span className="flex items-center gap-1 text-[10px] text-ink-dim">
        <span>Lv {Math.max(1, task.minPlayerLevel)}</span>
        {status === 'completed' && <span className="text-success">Done</span>}
        <span className="ml-auto flex gap-1">
          {task.kappaRequired && (
            <span title="Needed for Kappa" className="rounded border border-accent/60 px-1 font-semibold text-accent">
              K
            </span>
          )}
          {task.lightkeeperRequired && (
            <span title="Needed for Lightkeeper" className="rounded border border-info/60 px-1 font-semibold text-info">
              LK
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

function QuestPanel({
  task,
  data,
  status,
  statuses,
  unlocks,
  completed,
  onOpen,
}: {
  task: Task
  data: GameData
  status: TaskStatus
  statuses: Record<string, TaskStatus>
  unlocks: string[]
  completed: boolean
  onOpen: (task: Task) => void
}) {
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  const prereqs = task.taskRequirements
    .map((r) => ({ req: r, task: data.tasksById[r.taskId] }))
    .filter((p): p is { req: (typeof task.taskRequirements)[number]; task: Task } => !!p.task)
  const next = unlocks.map((id) => data.tasksById[id]).filter((t): t is Task => !!t)

  return (
    <div className="rounded border border-line bg-surface-2 p-4 text-sm">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-ink">{task.name}</h3>
        {task.wikiLink && (
          <a
            href={task.wikiLink}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-ink-muted hover:text-accent"
            title="Open on the wiki"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="mt-1 text-xs text-ink-muted">
        {task.trader.name} · level {Math.max(1, task.minPlayerLevel)}
        {task.map ? ` · ${task.map.name}` : ''}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <StatusPill status={status} />
        {task.kappaRequired && <KappaBadge />}
        {task.lightkeeperRequired && <LightkeeperBadge />}
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => setTaskCompleted(task.id, e.target.checked)}
          className="accent-[var(--color-accent)]"
        />
        <span>Mark complete</span>
      </label>

      <PanelList
        title="Needs first"
        empty="Nothing, it is a starting quest."
        items={prereqs.map(({ req, task: t }) => ({
          task: t,
          note: req.status.includes('complete') ? undefined : `must be ${req.status.join(' or ')}`,
        }))}
        statuses={statuses}
        onOpen={onOpen}
      />
      <PanelList
        title="Unlocks"
        empty="No quests follow this one."
        items={next.map((t) => ({ task: t }))}
        statuses={statuses}
        onOpen={onOpen}
      />
      {task.otherRequirements.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">Also requires</div>
          <ul className="mt-1 list-disc pl-4 text-xs text-ink-muted">
            {task.otherRequirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const DOT: Record<TaskStatus, string> = {
  completed: 'bg-success',
  available: 'bg-accent',
  locked: 'bg-ink-dim',
}

function PanelList({
  title,
  empty,
  items,
  statuses,
  onOpen,
}: {
  title: string
  empty: string
  items: { task: Task; note?: string }[]
  statuses: Record<string, TaskStatus>
  onOpen: (task: Task) => void
}) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">{title}</div>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map(({ task, note }) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpen(task)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-surface-3"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[statuses[task.id] ?? 'locked']}`} />
                <span className="min-w-0 flex-1 truncate text-ink">{task.name}</span>
                <span className="shrink-0 text-ink-dim">{note ?? task.trader.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Path to Kappa / Lightkeeper
// ---------------------------------------------------------------------------

function PathList({
  data,
  profile,
  statuses,
  target,
  onOpen,
}: {
  data: GameData
  profile: Profile
  statuses: Record<string, TaskStatus>
  target: 'kappa' | 'lightkeeper'
  onOpen: (task: Task) => void
}) {
  const [grouping, setGrouping] = useState<Grouping>('status')
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  const label = target === 'kappa' ? 'Kappa' : 'Lightkeeper'

  // Lightkeeper: the quests flagged for him plus his own quest line (the flags are sparse, and
  // in PvP absent), so the path covers everything needed to work for him.
  const isTarget = (t: Task) => (target === 'kappa' ? t.kappaRequired : t.lightkeeperRequired || t.trader.normalizedName === 'lightkeeper')

  const { order, flagged } = useMemo(() => {
    const targets = data.tasks.filter(
      (t) => isTarget(t) && isFactionEligible(t, profile.faction),
    )
    const closure = requiredClosure(
      targets.map((t) => t.id),
      data.tasksById,
      profile.completedTaskIds,
      (t) => isFactionEligible(t as Task, profile.faction),
    )
    const ordered = topoOrder(closure, data.tasksById)
      .map((id) => data.tasksById[id])
      .filter((t): t is Task => !!t)
    return { order: ordered, flagged: targets.length }
    // isTarget only depends on target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, target, profile.faction, profile.completedTaskIds])

  const step = new Map(order.map((t, i) => [t.id, i + 1]))
  const nowCount = order.filter((t) => statuses[t.id] === 'available').length
  const targetCount = order.filter(isTarget).length

  const groups: { key: string; title: string; image?: string | null; tasks: Task[] }[] = []
  if (grouping === 'status') {
    const now = order.filter((t) => statuses[t.id] === 'available')
    const later = order.filter((t) => statuses[t.id] !== 'available')
    if (now.length) groups.push({ key: 'now', title: `Can do now (${now.length})`, tasks: now })
    if (later.length) groups.push({ key: 'later', title: `Locked for now (${later.length})`, tasks: later })
  } else {
    for (const tr of data.traders) {
      const list = order.filter((t) => t.trader.id === tr.id)
      if (list.length) groups.push({ key: tr.id, title: `${tr.name} (${list.length})`, image: tr.imageLink, tasks: list })
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink">
          {flagged === 0 ? (
            <span className="text-ink-muted">
              The quest data does not mark any quest as needed for {label} right now, so there is no path to show.
            </span>
          ) : order.length === 0 ? (
            <span className="text-success">Nothing left: every quest needed for {label} is done.</span>
          ) : (
            <>
              <span className="font-semibold">{order.length}</span> quests left for {label},{' '}
              <span className="font-semibold text-accent">{nowCount}</span> can be done now.{' '}
              <span className="text-ink-muted">
                {targetCount} are {label} quests themselves, {order.length - targetCount} are quests you need first.
              </span>
            </>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1 rounded border border-line bg-surface-2 p-1">
          <button type="button" className={tabClass(grouping === 'status')} onClick={() => setGrouping('status')}>
            Can do now / locked
          </button>
          <button type="button" className={tabClass(grouping === 'trader')} onClick={() => setGrouping('trader')}>
            By trader
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Listed in a working order: every quest comes after the quests it needs, lower levels first. Quests for the
        other faction are left out. Some quests also need trader loyalty or story steps the app cannot track.
      </p>

      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <section key={g.key} className="rounded border border-line bg-surface-2">
            <h3 className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm font-semibold text-ink">
              {g.image && <img src={g.image} alt="" className="h-6 w-6 rounded-sm object-cover" />}
              {g.title}
            </h3>
            <ul className="divide-y divide-line">
              {g.tasks.map((t) => {
                const status = statuses[t.id] ?? 'locked'
                return (
                  <li key={t.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(e) => setTaskCompleted(t.id, e.target.checked)}
                      title="Mark complete"
                      aria-label={`Mark ${t.name} complete`}
                      className="accent-[var(--color-accent)]"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-ink-dim">{step.get(t.id)}.</span>
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      className="min-w-0 flex-1 truncate text-left text-ink hover:text-accent"
                      title="Show in the trader tree"
                    >
                      {t.name}
                    </button>
                    {grouping === 'status' && <span className="text-xs text-ink-muted">{t.trader.name}</span>}
                    <span className="w-12 text-xs text-ink-dim">Lv {Math.max(1, t.minPlayerLevel)}</span>
                    <StatusPill status={status} />
                    {isTarget(t) ? (
                      target === 'kappa' ? (
                        <KappaBadge />
                      ) : (
                        <LightkeeperBadge />
                      )
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-ink-dim">Needed first</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
