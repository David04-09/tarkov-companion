import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronUp, Crosshair, PanelRightClose, Search } from 'lucide-react'
import type { ItemsById, Trader } from '../../api/types'
import { KappaBadge, StatusPill } from '../../components/Badges'
import { STATUS_LABEL, type TaskStatus } from '../../lib/taskStatus'
import { OVERLAY_LAYERS, taskColor, useMapOverlayStore } from '../../store/mapOverlay'
import { useProgressStore } from '../../store/progress'
import { Briefing, type BriefingProps } from './Briefing'
import { KeyBadge } from './KeyBadge'
import type { LootGroup } from './lootGroups'
import type { MapTask } from './mapTasks'
import { OBJECTIVE_TYPE_LABEL } from './objectiveIcons'
import { QuestGuide } from '../../components/QuestGuide'
import type { SpawnModel } from './spawns'
import { SpawnsSection } from './SpawnsSection'

type StatusFilter = 'all' | TaskStatus
type PanelTab = 'quests' | 'briefing' | 'layers'
const STATUS_FILTERS: StatusFilter[] = ['available', 'locked', 'completed', 'all']
const STATUS_ORDER: Record<TaskStatus, number> = { available: 0, locked: 1, completed: 2 }

const selectClass =
  'rounded border border-line bg-surface px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none'

function TaskRow({ mt, status, color, checked, items, hasFloors }: { mt: MapTask; status: TaskStatus; color: string | null; checked: boolean; items: ItemsById | undefined; hasFloors: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const setTaskChecked = useMapOverlayStore((s) => s.setTaskChecked)
  const requestFocus = useMapOverlayStore((s) => s.requestFocus)
  const setTaskCompleted = useProgressStore((s) => s.setTaskCompleted)
  const task = mt.task
  return (
    <li className={`border-b border-line ${checked ? 'bg-surface-3/60' : ''}`}>
      <div className="flex items-start gap-2 px-2 py-1.5">
        <input type="checkbox" checked={checked} onChange={(e) => setTaskChecked(task.id, e.target.checked)} aria-label={`Show ${task.name} on the map`} title="Show on map" className="mt-1 h-4 w-4 shrink-0" />
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border" style={{ background: color ?? 'transparent', borderColor: color ? 'rgba(255,255,255,0.6)' : 'var(--color-line)' }} aria-hidden />
        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`text-sm font-medium ${status === 'completed' ? 'text-ink-muted line-through' : ''}`}>{task.name}</span>
            {task.kappaRequired && <KappaBadge />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
            <span>{task.trader.name}</span>
            {task.minPlayerLevel > 0 && <span>Lv {task.minPlayerLevel}</span>}
            <StatusPill status={status} />
            <span className="text-ink-dim">{mt.placements.length > 0 ? `${mt.placements.length} spot${mt.placements.length === 1 ? '' : 's'}` : 'anywhere'}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => { if (!checked) setTaskChecked(task.id, true); requestFocus(task.id) }} disabled={mt.placements.length === 0} title="Focus the map on this task" aria-label={`Focus on ${task.name}`} className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-accent disabled:opacity-30">
            <Crosshair className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-label="Toggle objectives" className="rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-2 border-t border-line/60 bg-surface px-3 py-2 text-xs">
          {mt.keyIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-ink-muted"><span>Keys for this map:</span><KeyBadge keyIds={mt.keyIds} items={items} /></div>
          )}
          <ol className="space-y-1.5">
            {mt.objectives.map((mo, i) => {
              const floors = hasFloors ? [...new Set(mo.placements.map((p) => p.floor ?? 'Ground'))].join(', ') : ''
              return (
                <li key={mo.objective.id} className="flex gap-2">
                  <span className="w-4 shrink-0 text-right text-ink-dim">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div>
                      <span className="mr-1.5 rounded border border-line px-1 py-px text-[10px] uppercase tracking-wide text-ink-muted">{OBJECTIVE_TYPE_LABEL[mo.objective.type] ?? mo.objective.type}</span>
                      <span>{mo.objective.description}</span>
                      {mo.objective.optional && <span className="text-ink-dim"> (optional)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ink-dim">
                      {mo.anywhere ? <span>Anywhere on this map</span> : <span>{mo.placements.length === 1 ? '1 spot' : `${mo.placements.length} possible spots`}{floors ? ` · ${floors}` : ''}</span>}
                      {mo.keyIds.length > 0 && <KeyBadge keyIds={mo.keyIds} items={items} compact approximate={mo.keySource === 'nearby'} />}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
          <QuestGuide task={task} compact />
          <label className="flex items-center gap-2 pt-1 text-ink"><input type="checkbox" checked={status === 'completed'} onChange={(e) => setTaskCompleted(task.id, e.target.checked)} className="h-4 w-4" /> Mark complete</label>
        </div>
      )}
    </li>
  )
}

export interface QuestPanelProps {
  mapName: string
  mapTasks: MapTask[]
  statuses: Record<string, TaskStatus>
  traders: Trader[]
  items: ItemsById | undefined
  hasFloors: boolean
  lootGroups: LootGroup[]
  spawnModel: SpawnModel | null
  briefing: BriefingProps | null
}

/** Right-side panel (bottom drawer on narrow screens) with Quests, Briefing and Layers tabs. */
export function QuestPanel({ mapName, mapTasks, statuses, traders, items, hasFloors, lootGroups, spawnModel, briefing }: QuestPanelProps) {
  const checkedTaskIds = useMapOverlayStore((s) => s.checkedTaskIds)
  const colorIndexByTask = useMapOverlayStore((s) => s.colorIndexByTask)
  const setTasksChecked = useMapOverlayStore((s) => s.setTasksChecked)
  const clearChecked = useMapOverlayStore((s) => s.clearChecked)
  const layers = useMapOverlayStore((s) => s.layers)
  const toggleLayer = useMapOverlayStore((s) => s.toggleLayer)
  const lootOn = useMapOverlayStore((s) => s.lootGroups)
  const setLootGroup = useMapOverlayStore((s) => s.setLootGroup)
  const setLootGroups = useMapOverlayStore((s) => s.setLootGroups)
  const collapsed = useMapOverlayStore((s) => s.panelCollapsed)
  const setCollapsed = useMapOverlayStore((s) => s.setPanelCollapsed)

  const [tab, setTab] = useState<PanelTab>('quests')
  const [search, setSearch] = useState('')
  const [lootSearch, setLootSearch] = useState('')
  const [trader, setTrader] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('available')

  const checked = useMemo(() => new Set(checkedTaskIds), [checkedTaskIds])
  const tradersHere = useMemo(() => {
    const ids = new Set(mapTasks.map((m) => m.task.trader.id))
    return traders.filter((t) => ids.has(t.id))
  }, [mapTasks, traders])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return mapTasks
      .filter((m) => {
        const st = statuses[m.task.id]
        if (statusFilter !== 'all' && st !== statusFilter) return false
        if (trader !== 'all' && m.task.trader.id !== trader) return false
        if (needle && !`${m.task.name} ${m.task.trader.name}`.toLowerCase().includes(needle)) return false
        return true
      })
      .sort((a, b) => STATUS_ORDER[statuses[a.task.id]] - STATUS_ORDER[statuses[b.task.id]] || a.task.minPlayerLevel - b.task.minPlayerLevel || a.task.name.localeCompare(b.task.name))
  }, [mapTasks, statuses, statusFilter, trader, search])

  const availableHere = useMemo(() => mapTasks.filter((m) => statuses[m.task.id] === 'available').map((m) => m.task.id), [mapTasks, statuses])
  const checkedHere = mapTasks.filter((m) => checked.has(m.task.id)).length
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: mapTasks.length, available: 0, locked: 0, completed: 0 }
    for (const m of mapTasks) c[statuses[m.task.id]] += 1
    return c
  }, [mapTasks, statuses])
  const lootFiltered = useMemo(() => {
    const n = lootSearch.trim().toLowerCase()
    return n ? lootGroups.filter((g) => g.name.toLowerCase().includes(n)) : lootGroups
  }, [lootGroups, lootSearch])

  if (collapsed) {
    return (
      <div className="flex shrink-0 items-center justify-center border-t border-line bg-surface-2 md:w-10 md:flex-col md:border-l md:border-t-0">
        <button type="button" onClick={() => setCollapsed(false)} title="Show quest panel" className="flex h-10 w-full items-center justify-center gap-2 text-xs text-ink-muted hover:text-accent md:h-full md:w-10 md:flex-col">
          <ChevronLeft className="hidden h-4 w-4 md:block" />
          <ChevronUp className="h-4 w-4 md:hidden" />
          <span className="md:[writing-mode:vertical-rl]">Show quest panel {checkedHere > 0 ? `(${checkedHere} on map)` : ''}</span>
        </button>
      </div>
    )
  }

  return (
    <aside className="flex h-[46vh] shrink-0 flex-col border-t border-line bg-surface-2 md:h-auto md:w-[380px] md:border-l md:border-t-0">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <div className="flex flex-1 rounded border border-line bg-surface p-0.5" role="tablist">
          {(['quests', 'briefing', 'layers'] as PanelTab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex-1 rounded px-2 py-1 text-xs font-medium capitalize ${tab === t ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>
              {t === 'quests' ? `Quests (${mapTasks.length})` : t}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setCollapsed(true)} title="Hide this panel to make the map bigger" className="flex items-center gap-1 rounded border border-line px-1.5 py-1 text-xs text-ink-muted hover:border-accent hover:text-accent">
          <PanelRightClose className="hidden h-4 w-4 md:block" />
          <ChevronDown className="h-4 w-4 md:hidden" />
          Hide
        </button>
      </div>

      {tab === 'quests' && (
        <>
          <div className="space-y-2 border-b border-line px-3 py-2">
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-dim" />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search quests on ${mapName}…`} aria-label="Search quests on this map" className={`${selectClass} w-full pl-7`} />
              </label>
              <select value={trader} onChange={(e) => setTrader(e.target.value)} aria-label="Trader" className={selectClass}>
                <option value="all">All traders</option>
                {tradersHere.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex rounded border border-line bg-surface p-0.5" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((s) => (
                <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s} className={`flex-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${statusFilter === s ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'}`}>
                  {s === 'all' ? 'All' : STATUS_LABEL[s]} <span className="opacity-70">{counts[s]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <button type="button" onClick={() => setTasksChecked(availableHere, true)} className="btn !px-2 !py-0.5 !text-[11px]">Show all available ({availableHere.length})</button>
              <button type="button" onClick={clearChecked} disabled={checkedTaskIds.length === 0} className="btn !px-2 !py-0.5 !text-[11px]">Clear all</button>
              <span className="ml-auto self-center text-ink-dim">{checkedHere} shown here</span>
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-muted">No quests match on this map.</li>}
            {filtered.map((mt) => (
              <TaskRow key={mt.task.id} mt={mt} status={statuses[mt.task.id]} color={checked.has(mt.task.id) ? taskColor(colorIndexByTask[mt.task.id]) : null} checked={checked.has(mt.task.id)} items={items} hasFloors={hasFloors} />
            ))}
          </ul>
        </>
      )}

      {tab === 'briefing' && (briefing ? <Briefing {...briefing} /> : <p className="p-3 text-xs text-ink-muted">Loading…</p>)}

      {tab === 'layers' && (
        <div className="min-h-0 flex-1 overflow-y-auto text-xs">
          <section className="border-b border-line px-3 py-2">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Map layers</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {OVERLAY_LAYERS.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5" title={l.hint}>
                  <input type="checkbox" checked={layers[l.id]} onChange={() => toggleLayer(l.id)} className="h-3.5 w-3.5" />
                  {l.label}
                </label>
              ))}
            </div>
          </section>
          {spawnModel && <SpawnsSection model={spawnModel} />}
          <section className="px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Loot containers</h3>
              <button type="button" onClick={() => setLootGroups(lootFiltered.map((g) => g.name), true)} className="ml-auto text-[11px] text-accent underline">all</button>
              <button type="button" onClick={() => setLootGroups(lootGroups.map((g) => g.name), false)} className="text-[11px] text-accent underline">none</button>
            </div>
            <input type="search" value={lootSearch} onChange={(e) => setLootSearch(e.target.value)} placeholder="Search container types…" aria-label="Search loot container types" className={`${selectClass} mb-1 w-full`} />
            <ul className="space-y-0.5">
              {lootFiltered.map((g) => (
                <li key={g.name}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(lootOn[g.name])} onChange={(e) => setLootGroup(g.name, e.target.checked)} className="h-3.5 w-3.5" />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    <span className="text-ink-dim">{g.positions.length}</span>
                  </label>
                </li>
              ))}
              {lootGroups.length === 0 && <li className="text-ink-dim">No container data for this map.</li>}
            </ul>
            <p className="mt-1 text-ink-dim">Dots cluster when zoomed out; click a cluster to zoom in.</p>
          </section>
        </div>
      )}
    </aside>
  )
}
