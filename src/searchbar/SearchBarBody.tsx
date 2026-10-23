import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ExternalLink, GripVertical, Map as MapIcon, Maximize2, Minimize2, Search, SlidersHorizontal, X } from 'lucide-react'
import { readOnlyPersistOptions } from '../api/persist'
import { queryClient } from '../api/queryClient'
import type { Item, Task } from '../api/types'
import { useNeeds } from '../hooks/useNeeds'
import { followOtherWindows } from '../lib/crossWindow'
import { matchesSearch, rankMatch, searchWords } from '../lib/fleaSearch'
import { formatRoubles } from '../lib/format'
import { computeTaskStatuses, isFactionEligible, STATUS_LABEL } from '../lib/taskStatus'
import { useMapOptions, type MapOption } from '../maps/useMapOptions'
import { useInventoryStore } from '../store/inventory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProfile, useProgressStore } from '../store/progress'
import { useUiStore } from '../store/ui'
import { ItemDetails, OnMapBox, PictureDetails, QuestDetails, SideButton } from './details'
import { DetailsContext, panelKey, type DetailsCtx, type KeyMap, type Panel } from './detailsContext'
import { columnClass, readFlag, saveFlag, type DragProps, type Flip, type Look } from './shell'
import type { MapPin } from './SearchBarMap'
import { useTickedOnMap } from './tickedOnMap'

// The map (Leaflet) loads only when a map is opened.
const SearchBarMap = lazy(() => import('./SearchBarMap').then((m) => ({ default: m.SearchBarMap })))

/** Other names people use for maps. */
const MAP_NICKNAMES: Record<string, string> = { 'the-lab': 'labs lab', 'streets-of-tarkov': 'streets', 'ground-zero': 'gz', 'ground-zero-21': 'gz', 'night-factory': 'night' }

type Hit = { kind: 'item'; item: Item } | { kind: 'quest'; task: Task } | { kind: 'map'; map: MapOption; pins?: MapPin[]; title?: string; focus?: string }

const SIDEBAR_KEY = 'tc-searchbar-sidebar'
const TALL_KEY = 'tc-searchbar-tall-map'

const MAX_ITEMS = 6
const MAX_QUESTS = 5
const MAX_MAPS = 3
/** Side panels at once (newest first). */
const MAX_PANELS = 3
const CARD_W = 'w-[372px]'

/** The tallest a card or the panel column may get (the window itself is capped by the screen). */
const heightCap = () => Math.max(240, Math.round(window.screen.availHeight * 0.8) - 70)

export interface BodyProps {
  flip: Flip
  expanded: boolean
  setExpanded: (on: boolean) => void
  glass: ReactElement
  grip: DragProps
  look: Look
  setLook: (l: Look) => void
  onState: (busy: boolean, clear: boolean, preview: boolean) => void
}

export default function SearchBarBody(props: BodyProps) {
  // Ticks, levels and map choices made in the app window show here too (and the other way round).
  useEffect(() => followOtherWindows([useProgressStore, useInventoryStore, useMapOverlayStore, useUiStore]), [])
  // Unloaded after a while with nothing open: let the game data go with it.
  useEffect(() => () => queryClient.clear(), [])
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={readOnlyPersistOptions(queryClient)}>
      <Body {...props} />
    </PersistQueryClientProvider>
  )
}

function Body({ flip, expanded, setExpanded, glass, grip, look, setLook, onState }: BodyProps) {
  const { needs, gameData, items, inventory } = useNeeds()
  const profile = useProfile()
  const mapOptions = useMapOptions()
  const onMap = useMapOverlayStore((s) => s.checkedTaskIds)
  const setOnMap = useMapOverlayStore((s) => s.setTaskChecked)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [picked, setPicked] = useState<Hit | null>(null)
  const [panels, setPanels] = useState<Panel[]>([])
  const [sidebar, setSidebarState] = useState(() => readFlag(SIDEBAR_KEY, true))
  const [tall, setTallState] = useState(() => readFlag(TALL_KEY, false))
  const [lookOpen, setLookOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const setSidebar = (on: boolean) => {
    setSidebarState(on)
    saveFlag(SIDEBAR_KEY, on)
  }
  const setTall = (on: boolean) => {
    setTallState(on)
    saveFlag(TALL_KEY, on)
  }

  useEffect(() => {
    if (expanded) input.current?.focus()
    else setLookOpen(false)
  }, [expanded])

  const mapShown = picked?.kind === 'map'
  useEffect(() => onState(mapShown || panels.length > 0 || picked !== null, mapShown || panels.length > 0, preview), [onState, mapShown, panels.length, picked, preview])

  const tasks = useMemo(() => (gameData.data?.tasks ?? []).filter((t) => isFactionEligible(t, profile.faction)), [gameData.data, profile.faction])
  const statuses = useMemo(() => computeTaskStatuses(tasks, profile), [tasks, profile])
  const itemList = useMemo(() => (items.data ? Object.values(items.data.items) : []), [items.data])
  const itemText = useMemo(() => new Map(itemList.map((it) => [it.id, `${it.name}\n${it.shortName}`.toLowerCase()])), [itemList])

  const hits = useMemo<Hit[]>(() => {
    const w = searchWords(query)
    if (w.join('').length < 2) return []
    const its = itemList
      .filter((it) => matchesSearch(itemText.get(it.id) ?? '', w))
      .sort((a, b) => rankMatch(a.name, a.shortName, w) - rankMatch(b.name, b.shortName, w) || a.name.length - b.name.length)
      .slice(0, MAX_ITEMS)
    const qs = tasks
      .filter((t) => matchesSearch(t.name.toLowerCase(), w))
      .sort((a, b) => rankMatch(a.name, '', w) - rankMatch(b.name, '', w) || a.name.length - b.name.length)
      .slice(0, MAX_QUESTS)
    const ms = mapOptions.filter((m) => !/night/.test(m.key) && matchesSearch(`${m.name} ${MAP_NICKNAMES[m.key] ?? ''}`.toLowerCase(), w)).slice(0, MAX_MAPS)
    return [...ms.map((map) => ({ kind: 'map' as const, map })), ...its.map((item) => ({ kind: 'item' as const, item })), ...qs.map((task) => ({ kind: 'quest' as const, task }))]
  }, [query, itemList, itemText, tasks, mapOptions])

  const openPanel = (p: Panel) => setPanels((ps) => [p, ...ps.filter((x) => panelKey(x) !== panelKey(p))].slice(0, MAX_PANELS))
  const closePanel = (p: Panel) => setPanels((ps) => ps.filter((x) => panelKey(x) !== panelKey(p)))
  // Ticking "On map" also opens that quest's map here, zoomed to it.
  const tickQuest = (task: Task, on: boolean) => {
    setOnMap(task.id, on)
    if (!on) return
    const mapId = task.map?.id ?? task.objectives.flatMap((o) => o.maps)[0]?.id
    const option = mapOptions.find((m) => m.id === mapId)
    if (option) setPicked({ kind: 'map', map: option, focus: task.id })
  }
  // A key: its lock(s), and where it lies around, per map.
  const keyMaps = (it: Item): KeyMap[] => {
    const data = gameData.data
    if (!data || !it.types.includes('keys')) return []
    return mapOptions
      .filter((m) => m.id && !/night/.test(m.key))
      .map((option) => {
        const details = data.mapDetails[option.id!]
        const locks = (details?.locks ?? []).filter((l) => l.keyId === it.id).map((l) => ({ position: l.position, label: `Lock: ${it.shortName}`, kind: 'lock' as const }))
        const spawns = (details?.lootLoose ?? []).filter((l) => l.itemIds.includes(it.id)).map((l) => ({ position: l.position, label: `${it.shortName} lies here`, kind: 'spawn' as const }))
        return { option, pins: [...locks, ...spawns] }
      })
      .filter((x) => x.pins.some((p) => p.kind === 'lock'))
  }
  const showKey = (it: Item, k: KeyMap) => setPicked({ kind: 'map', map: k.option, pins: k.pins, title: `${it.shortName}: lock${k.pins.filter((p) => p.kind === 'lock').length > 1 ? 's' : ''} on ${k.option.name}` })
  const traderName = (id: string) => gameData.data?.traders.find((t) => t.id === id)?.name ?? 'Trader'
  const clear = () => {
    setQuery('')
    setPicked(null)
    setCursor(0)
  }
  const openInApp = (h: Hit | Panel) => {
    const t = String(Date.now())
    let to: string
    if (h.kind === 'map') to = `/maps?${new URLSearchParams({ map: h.map.key, t })}`
    else if (h.kind === 'picture') return void window.desktop?.openExternal(h.image.full)
    else {
      const task = h.kind === 'quest' ? ('task' in h ? h.task : gameData.data?.tasksById[h.id]) : undefined
      const item = h.kind === 'item' ? ('item' in h ? h.item : items.data?.items[h.id]) : undefined
      if (task) to = `/quests?${new URLSearchParams({ q: task.name, t })}`
      else if (item) to = item.types.includes('keys') ? `/keys?${new URLSearchParams({ key: item.id, t })}` : `/flea?${new URLSearchParams({ q: item.name, t })}`
      else return
    }
    void window.desktop?.openInApp(to)
  }

  const ctx = useMemo<DetailsCtx | null>(
    () =>
      gameData.data
        ? {
            data: gameData.data,
            items: items.data?.items,
            statuses,
            completed: profile.completedTaskIds,
            needs,
            collected: inventory.collected,
            onMap,
            tickQuest,
            keyMaps,
            showKey,
            open: openPanel,
            traderName,
          }
        : null,
    // The callbacks only read state through setters and the data listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameData.data, items.data, statuses, profile.completedTaskIds, needs, inventory.collected, onMap, mapOptions],
  )

  const showResults = expanded && query.trim().length > 0 && !picked
  const cap = heightCap()

  const bar = (
    <div data-solid className={`flex ${CARD_W} items-center gap-1.5 rounded-lg border border-white/15 bg-black/80 py-2 pl-1 pr-2 shadow-2xl`}>
      <span {...grip} title="Drag to move" aria-label="Drag to move the search bar" className="flex shrink-0 cursor-grab touch-none items-center text-white/35 hover:text-white active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </span>
      <Search className="h-4 w-4 shrink-0 text-white/60" />
      <input
        ref={input}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setPicked(null)
          setCursor(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setCursor((c) => Math.min(hits.length - 1, c + 1))
          else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1))
          else if (e.key === 'Enter') {
            const h = hits[cursor]
            if (h) setPicked(h)
          } else if (e.key === 'Escape') {
            if (picked) setPicked(null)
            else if (query) clear()
            else setExpanded(false)
          } else return
          e.preventDefault()
        }}
        placeholder={items.isPending ? 'Loading items…' : 'Search maps, items, keys, quests…'}
        aria-label="Search maps, items, keys and quests"
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
      />
      {query && (
        <button type="button" onClick={clear} aria-label="Clear" className="rounded p-0.5 text-white/55 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={() => setLookOpen(!lookOpen)} aria-label="See-through and position" title="See-through and position" className={`rounded p-0.5 hover:text-white ${lookOpen ? 'text-white' : 'text-white/55'}`}>
        <SlidersHorizontal className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <>
      <div className={columnClass(flip)}>
        {expanded ? bar : glass}

        {expanded && lookOpen && (
          <div data-solid className={`${CARD_W} space-y-2 rounded-lg border border-white/15 bg-black/85 p-3 text-xs shadow-2xl`}>
            <Slider label="See-through at rest" value={look.idle} onChange={(idle) => setLook({ ...look, idle })} onPreview={setPreview} />
            <Slider label="With a map or side panels open" value={look.map} onChange={(map) => setLook({ ...look, map })} onPreview={setPreview} />
            <p className="text-white/50">It is always fully visible while the mouse is over it. Drag the magnifying glass, or the grip at the left of the bar, to move it anywhere.</p>
            <button type="button" onClick={() => void window.desktop?.searchBarHome()} className="rounded border border-white/20 bg-white/10 px-2 py-0.5 hover:bg-white/20">
              Back to the top-left corner
            </button>
          </div>
        )}

        {showResults && (
          <ul data-solid role="listbox" aria-label="Results" className={`${CARD_W} overflow-hidden rounded-lg border border-white/15 bg-black/85 py-1 shadow-2xl`}>
            {hits.length === 0 && <li className="px-3 py-2 text-white/55">{items.isPending ? 'Loading items…' : 'Nothing matches.'}</li>}
            {hits.map((h, i) => (
              <li key={h.kind === 'item' ? h.item.id : h.kind === 'quest' ? h.task.id : h.map.key} role="option" aria-selected={i === cursor} className={`flex items-center ${i === cursor ? 'bg-white/10' : ''}`}>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => setPicked(h)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1 text-left">
                  {h.kind === 'map' ? (
                    <>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-white/80"><MapIcon className="h-3.5 w-3.5" /></span>
                      <span className="min-w-0 flex-1 truncate">{h.map.name}</span>
                      <span className="shrink-0 text-xs text-white/55">map</span>
                    </>
                  ) : h.kind === 'item' ? (
                    <>
                      {h.item.iconLink ? <img src={h.item.iconLink} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" /> : <span className="h-6 w-6 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{h.item.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-white/55">{h.item.types.includes('noFlea') ? 'no flea' : h.item.avg24hPrice ? formatRoubles(h.item.avg24hPrice) : '—'}</span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] text-white/70">Q</span>
                      <span className="min-w-0 flex-1 truncate">{h.task.name}</span>
                      <span className="shrink-0 text-xs text-white/55">{STATUS_LABEL[statuses[h.task.id] ?? 'locked']}</span>
                    </>
                  )}
                </button>
                {h.kind === 'quest' && <OnMapBox checked={onMap.includes(h.task.id)} onChange={(on) => tickQuest(h.task, on)} />}
                {h.kind !== 'map' && <SideButton label="Open beside" onClick={() => openPanel(h.kind === 'item' ? { kind: 'item', id: h.item.id } : { kind: 'quest', id: h.task.id })} />}
              </li>
            ))}
          </ul>
        )}

        {picked?.kind === 'map' && (
          <MapCard
            key={picked.focus ?? picked.title ?? picked.map.key}
            option={picked.map}
            pins={picked.pins}
            focus={picked.focus}
            title={picked.title}
            sidebar={sidebar}
            onSidebar={setSidebar}
            tall={tall}
            onTall={setTall}
            onQuestInfo={(id) => openPanel({ kind: 'quest', id })}
            onBack={() => setPicked(null)}
            onOpen={() => openInApp(picked)}
          />
        )}
        {expanded && ctx && (picked?.kind === 'item' || picked?.kind === 'quest') && (
          <DetailsContext.Provider value={ctx}>
            <div data-solid className={`${CARD_W} overflow-y-auto rounded-lg border border-white/15 bg-black/85 p-3 shadow-2xl [scrollbar-width:thin]`} style={{ maxHeight: cap }}>
              {picked.kind === 'item' ? <ItemDetails item={picked.item} /> : <QuestDetails task={picked.task} />}
              <div className="mt-2 flex justify-between text-xs">
                <button type="button" onClick={() => setPicked(null)} className="text-white/60 hover:text-white">← Results</button>
                <button type="button" onClick={() => openInApp(picked)} className="inline-flex items-center gap-1 text-white/60 hover:text-white">
                  Open in the app <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          </DetailsContext.Provider>
        )}
      </div>

      {ctx && panels.length > 0 && (
        <DetailsContext.Provider value={ctx}>
          <div className={`flex w-[300px] flex-col gap-1 ${flip.up ? 'flex-col-reverse' : ''}`} style={{ maxHeight: cap + 60 }}>
            {panels.map((p) => {
              const task = p.kind === 'quest' ? ctx.data.tasksById[p.id] : undefined
              const item = p.kind === 'item' ? ctx.items?.[p.id] : undefined
              const title = p.kind === 'picture' ? p.title : task?.name ?? item?.shortName ?? ''
              return (
                <PanelFrame key={panelKey(p)} title={title} onClose={() => closePanel(p)} onOpen={() => openInApp(p)}>
                  {p.kind === 'picture' ? <PictureDetails image={p.image} /> : task ? <QuestDetails task={task} /> : item ? <ItemDetails item={item} /> : <p className="text-white/55">Not in the data any more.</p>}
                </PanelFrame>
              )
            })}
          </div>
        </DetailsContext.Provider>
      )}
    </>
  )
}

function Slider({ label, value, onChange, onPreview }: { label: string; value: number; onChange: (v: number) => void; onPreview: (on: boolean) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-white/70">
        {label} <span className="tabular-nums text-white">{value}%</span>
      </span>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // While the slider is held, show the real see-through level (not the full hover look).
        onPointerDown={() => onPreview(true)}
        onPointerUp={() => onPreview(false)}
        onPointerCancel={() => onPreview(false)}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  )
}

function PanelFrame({ title, onClose, onOpen, children }: { title: string; onClose: () => void; onOpen: () => void; children: ReactNode }) {
  return (
    <section data-solid className="flex min-h-0 shrink flex-col rounded-lg border border-white/15 bg-black/85 shadow-2xl">
      <header className="flex items-center gap-1 border-b border-white/10 px-2.5 py-1">
        <span className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-wide text-white/55">{title}</span>
        <button type="button" onClick={onOpen} title="Open in the app" aria-label="Open in the app" className="p-0.5 text-white/45 hover:text-white">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onClose} title="Close" aria-label="Close this panel" className="p-0.5 text-white/45 hover:text-white">
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto p-2.5 [scrollbar-width:thin]">{children}</div>
    </section>
  )
}

function MapCard({
  option,
  pins,
  focus,
  title,
  sidebar,
  onSidebar,
  tall,
  onTall,
  onQuestInfo,
  onBack,
  onOpen,
}: {
  option: MapOption
  pins?: MapPin[]
  focus?: string
  title?: string
  sidebar: boolean
  onSidebar: (on: boolean) => void
  tall: boolean
  onTall: (on: boolean) => void
  onQuestInfo: (taskId: string) => void
  onBack: () => void
  onOpen: () => void
}) {
  const ticked = useTickedOnMap(option)
  return (
    <div data-solid className={`${sidebar ? 'w-[588px]' : CARD_W} rounded-lg border border-white/20 bg-black/85 p-2 shadow-2xl`}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate font-medium">{title ?? option.name}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/55">
          {pins?.length ? 'Red = lock, green = where it lies around' : ticked ? `${ticked} quest${ticked === 1 ? '' : 's'} shown` : 'Tick quests in the list to show them'}
          <button type="button" onClick={() => onTall(!tall)} title={tall ? 'Smaller map' : 'Bigger map'} aria-label={tall ? 'Smaller map' : 'Bigger map'} className="p-0.5 text-white/55 hover:text-white">
            {tall ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </span>
      </div>
      <Suspense fallback={<div className={`${tall ? 'h-[26rem]' : 'h-72'} rounded-md bg-white/5`} />}>
        <SearchBarMap option={option} pins={pins} focus={focus} sidebar={sidebar} onSidebar={onSidebar} tall={tall} onQuestInfo={onQuestInfo} />
      </Suspense>
      <div className="mt-1.5 flex justify-between px-1 text-xs">
        <button type="button" onClick={onBack} className="text-white/60 hover:text-white">← Results</button>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-white/60 hover:text-white">
          Open in the app <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
