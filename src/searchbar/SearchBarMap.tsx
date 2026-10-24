import { useCallback, useContext, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, DoorOpen, Gem, Info, KeyRound, Layers, ListChecks, Ruler, Skull } from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { Position } from '../api/types'
import { MapViewer } from '../maps/MapViewer'
import { floorIsDrawable, resolveBaseLayer } from '../maps/mapConfig'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { LootLayer } from '../maps/overlay/LootLayer'
import { buildBringList } from '../maps/overlay/bringList'
import { buildLootGroups } from '../maps/overlay/lootGroups'
import { buildMapTasks } from '../maps/overlay/mapTasks'
import { OtherLayers } from '../maps/overlay/OtherLayers'
import { PositionLayer } from '../maps/overlay/PositionLayer'
import { SpawnLayer } from '../maps/overlay/SpawnLayer'
import { buildSpawnModel, spawnKey, toggleKeyFor } from '../maps/overlay/spawns'
import { TaskLayer } from '../maps/overlay/TaskLayer'
import type { MapOption } from '../maps/useMapOptions'
import { formatRoubles } from '../lib/format'
import { remainingFor } from '../lib/needs'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { useProgressContext } from '../hooks/useProgressContext'
import type { PlayerPosition } from '../shared/desktop-api'
import { taskColor, useMapOverlayStore } from '../store/mapOverlay'
import { useProfile } from '../store/progress'
import { useUiStore } from '../store/ui'
import { DetailsContext } from './detailsContext'
import { HazardLayer, LootSpotLayer, PinsLayer, QuestFocus, RulerLayer, SpotLayer, type MapPin, type Spot } from './mapLayers'
import { distance, neededOnMap, neededSpots, valuableSpots } from './overlayLogic'
import { LAYER_INFO, useOverlayPrefs, type MapTab, type OverlayLayer } from './overlayPrefs'
import type { Flip } from './shell'

export type { MapPin } from './mapLayers'

const TABS: { id: MapTab; label: string; icon: typeof ListChecks }[] = [
  { id: 'quests', label: 'Quests', icon: ListChecks },
  { id: 'extracts', label: 'Extracts', icon: DoorOpen },
  { id: 'bosses', label: 'Bosses and spawns', icon: Skull },
  { id: 'locks', label: 'Locked doors and keys', icon: KeyRound },
  { id: 'loot', label: 'Loot', icon: Gem },
  { id: 'layers', label: 'Layers, floors and picture', icon: Layers },
]

const FACTION_LABEL = { pmc: 'PMC', scav: 'Scav', shared: 'Both' } as const
const NO_KEYS: ReadonlySet<string> = new Set()

/**
 * The search bar's map: the Maps tab's picture with this bar's own layers (quests ticked "On map",
 * extracts, bosses at their exact spawn points, sniper scavs, PMC/scav spawns, locked doors,
 * containers, valuable loose loot, loot you still need, hazards), your screenshot position, a
 * ruler, and a list on the right (it folds away) to tick, find and zoom to all of it.
 */
export function SearchBarMap({
  option,
  pins = [],
  focus: initialFocus,
  spot: initialSpot,
  flip,
  position,
}: {
  option: MapOption
  pins?: MapPin[]
  focus?: string
  spot?: { points: Position[]; label: string; fit?: Position[] }
  flip: Flip
  position: PlayerPosition | null
}) {
  const ctx = useContext(DetailsContext)
  const gameData = useGameData()
  const items = useItems().data?.items
  const profile = useProfile()
  const preferred = useUiStore((s) => s.baseLayerByMap[option.key])
  const storedFloor = useUiStore((s) => s.floorByMap[option.key])
  const setFloor = useUiStore((s) => s.setFloor)
  const setBaseLayer = useUiStore((s) => s.setBaseLayer)
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  const colors = useMapOverlayStore((s) => s.colorIndexByTask)
  const setChecked = useMapOverlayStore((s) => s.setTaskChecked)
  const setManyChecked = useMapOverlayStore((s) => s.setTasksChecked)
  const requestFocus = useMapOverlayStore((s) => s.requestFocus)
  const p = useOverlayPrefs()
  const [spot, setSpot] = useState<Spot | null>(() => (initialSpot ? { ...initialSpot, nonce: 1 } : null))
  const spotCount = useRef(1)
  const [ruler, setRuler] = useState(false)
  // The filter box belongs to one tab: switching tabs starts it empty.
  const [filterState, setFilterState] = useState({ tab: '', text: '' })
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const layer = useMemo(() => resolveBaseLayer(option.cfg, preferred), [option.cfg, preferred])
  const floors = layer.floors.filter((f) => floorIsDrawable(f, layer))
  const activeFloor = storedFloor === undefined ? (floors.find((f) => f.show)?.name ?? null) : storedFloor
  const hasFloors = layerHasFloorHeights(layer)
  const data = gameData.data
  const details = data && option.id ? data.mapDetails[option.id] : undefined
  const zoom = p.scale / 100
  const w = Math.min(size?.w ?? p.mapW, Math.max(240, window.screen.availWidth - (p.sidebar ? p.sideW * zoom : 0) - 80))
  const h = Math.min(size?.h ?? p.mapH, Math.max(180, window.screen.availHeight - 170))
  const { layers, tab, sidebar } = p
  const filter = filterState.tab === tab ? filterState.text : ''
  const setFilter = (text: string) => setFilterState({ tab, text })

  const mapTasks = useMemo(
    () => (data && option.id ? buildMapTasks(data, option.id, layer).filter((m) => isFactionEligible(m.task, profile.faction) && m.placements.length > 0) : []),
    [data, option.id, layer, profile.faction],
  )
  const progress = useProgressContext()
  const statuses = useMemo(() => computeTaskStatuses(mapTasks.map((m) => m.task), profile, progress ?? undefined), [mapTasks, profile, progress])
  const shown = useMemo(() => {
    if (!layers.quests) return []
    const byId = new Map(mapTasks.map((m) => [m.task.id, m]))
    return checked.flatMap((id) => {
      const m = byId.get(id)
      return m ? [{ mapTask: m, color: taskColor(colors[id]) }] : []
    })
  }, [mapTasks, checked, colors, layers.quests])
  const markers = shown.reduce((n, s) => n + s.mapTask.placements.length, 0)

  // Spawns: one model per map, built only when a spawn layer or the Bosses tab needs it.
  const wantSpawns = layers.bosses || layers.snipers || layers.pmcSpawns || layers.scavSpawns || (sidebar && tab === 'bosses')
  const spawnModel = useMemo(() => (data && option.id && wantSpawns ? buildSpawnModel(data, option.id) : null), [data, option.id, wantSpawns])
  const spawnToggles = useMemo(() => {
    const t: Record<string, boolean> = { pmc: layers.pmcSpawns, scav: layers.scavSpawns, sniper: layers.snipers }
    for (const e of spawnModel?.bosses ?? []) {
      t[toggleKeyFor(e)] = layers.bosses
      t[spawnKey.guards(e.key)] = layers.guards
    }
    return t
  }, [spawnModel, layers.bosses, layers.guards, layers.pmcSpawns, layers.scavSpawns, layers.snipers])
  const otherToggles = useMemo(
    () => ({ extractsPmc: layers.extractsPmc, extractsScav: layers.extractsScav, transits: layers.transits, locks: layers.locks, switches: layers.switches, stationary: layers.stationary, btr: layers.btr }),
    [layers.extractsPmc, layers.extractsScav, layers.transits, layers.locks, layers.switches, layers.stationary, layers.btr],
  )

  // Loot.
  const needs = ctx?.needs
  const collected = ctx?.collected
  const neededIds = useMemo(() => {
    const ids = new Set<string>()
    if (!needs || !collected) return ids
    for (const [id, need] of needs) if (remainingFor(need, collected[id] ?? 0) > 0) ids.add(id)
    return ids
  }, [needs, collected])
  const wantLoot = layers.valuables || layers.needed || (sidebar && tab === 'loot')
  const valuable = useMemo(() => (wantLoot ? valuableSpots(details, items, p.lootMin, p.lootPerSlot) : []), [wantLoot, details, items, p.lootMin, p.lootPerSlot])
  const needed = useMemo(() => (wantLoot ? neededSpots(details, neededIds) : []), [wantLoot, details, neededIds])
  const neededList = useMemo(() => (sidebar && tab === 'loot' ? neededOnMap(details, neededIds) : []), [sidebar, tab, details, neededIds])
  const lootGroups = useMemo(() => (data && (layers.containers || tab === 'loot') ? buildLootGroups(details, data.lootContainerNames) : []), [data, details, layers.containers, tab])
  const containersShown = useMemo(() => lootGroups.filter((g) => !p.containersOff.includes(g.name)), [lootGroups, p.containersOff])

  // Lists.
  // With your screenshot position on this map: metres to each quest's nearest spot and each extract, nearest first.
  const fromX = position?.x
  const fromY = position?.y
  const fromZ = position?.z
  const questList = useMemo(() => {
    const on = new Set(checked)
    const from = fromX !== undefined && fromZ !== undefined ? { x: fromX, y: fromY ?? 0, z: fromZ } : null
    return mapTasks
      .filter((m) => on.has(m.task.id) || statuses[m.task.id] === 'available')
      .map((m) => ({ m, d: from ? Math.min(...m.placements.map((pl) => distance(from, pl.position))) : null }))
      .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : Number(on.has(b.m.task.id)) - Number(on.has(a.m.task.id)) || a.m.task.name.localeCompare(b.m.task.name)))
  }, [mapTasks, checked, statuses, fromX, fromY, fromZ])
  const extractSide = p.extractSide
  const extracts = useMemo(() => {
    const seen = new Set<string>()
    const order = { pmc: 0, shared: 1, scav: 2 } as const
    const from = fromX !== undefined && fromZ !== undefined ? { x: fromX, y: fromY ?? 0, z: fromZ } : null
    return (details?.extracts ?? [])
      .filter((e) => !seen.has(`${e.faction}:${e.name}`) && seen.add(`${e.faction}:${e.name}`))
      .filter((e) => extractSide === 'all' || e.faction === 'shared' || e.faction === extractSide)
      .map((e) => ({ e, d: from ? distance(from, e.position) : null }))
      .sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : order[a.e.faction] - order[b.e.faction] || a.e.name.localeCompare(b.e.name)))
  }, [details, extractSide, fromX, fromY, fromZ])
  // What to take for the ticked quests (keys, items to place, markers, gear).
  const completed = ctx?.completed
  const bring = useMemo(() => (tab === 'quests' ? buildBringList(shown.map((s) => s.mapTask).filter((m) => !completed?.has(m.task.id))) : []), [tab, shown, completed])
  // Keys the open quests here need (for the Locks filter).
  const questKeyIds = useMemo(() => new Set(mapTasks.filter((m) => !completed?.has(m.task.id)).flatMap((m) => [...m.keyIds, ...m.task.objectives.flatMap((o) => o.requiredKeys.flat())])), [mapTasks, completed])
  const [lockFilter, setLockFilter] = useState<'all' | 'owned' | 'quest'>('all')
  const locks = useMemo(() => {
    if (!details || tab !== 'locks') return []
    const by = new Map<string, { keyId: string; positions: Position[]; types: Set<string> }>()
    for (const l of details.locks) {
      const g = by.get(l.keyId) ?? { keyId: l.keyId, positions: [], types: new Set<string>() }
      g.positions.push(l.position)
      g.types.add(l.lockType)
      by.set(l.keyId, g)
    }
    return [...by.values()].sort((a, b) => (items?.[a.keyId]?.shortName ?? '').localeCompare(items?.[b.keyId]?.shortName ?? ''))
  }, [details, tab, items])

  const openPanel = ctx?.open
  const openItem = useCallback((id: string) => openPanel?.({ kind: 'item', id }), [openPanel])
  const zoomTo = (points: Position[], label: string, fit?: Position[]) => {
    if (points.length || fit?.length) setSpot({ points, label, fit, nonce: ++spotCount.current })
  }
  const focus = (taskId: string) => {
    setChecked(taskId, true)
    requestFocus(taskId)
  }
  const mapName = (id: string | null) => data?.maps.find((m) => m.id === id)?.name ?? 'another map'
  const f = filter.trim().toLowerCase()
  const match = (s: string) => !f || s.toLowerCase().includes(f)

  // Drag the corner to resize the map (kept when you let go).
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const onResizeDown = (e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    resize.current = { x: e.screenX, y: e.screenY, w, h }
  }
  const onResizeMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = resize.current
    if (!r) return
    const dx = (e.screenX - r.x) * (flip.left ? -1 : 1)
    const dy = (e.screenY - r.y) * (flip.up ? -1 : 1)
    setSize({ w: Math.min(900, window.screen.availWidth - 300, Math.max(240, Math.round(r.w + dx))), h: Math.min(900, window.screen.availHeight - 160, Math.max(180, Math.round(r.h + dy))) })
  }
  const onResizeUp = () => {
    resize.current = null
    if (size) p.set({ mapW: size.w, mapH: size.h })
    setSize(null)
  }

  const filterBox = (placeholder: string) => (
    <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="mx-1.5 my-1 rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-white placeholder:text-white/35 focus:outline-none" />
  )
  const layerCheck = (id: OverlayLayer, label?: string) => {
    const info = LAYER_INFO.find((l) => l.id === id)!
    return (
      <label key={id} className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 hover:bg-white/5" title={info.hint}>
        <input type="checkbox" checked={layers[id]} onChange={() => p.toggleLayer(id)} className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
        <span className="min-w-0 flex-1 truncate">{label ?? info.label}</span>
      </label>
    )
  }

  return (
    <div className={`flex gap-1.5 ${flip.left ? 'flex-row-reverse' : ''}`} style={{ height: h }}>
      <div className="relative shrink-0 overflow-hidden rounded-md" style={{ width: w }}>
        <MapViewer mapKey={`searchbar:${option.key}:${layer.id}`} layer={layer} floorName={activeFloor}>
          {data && option.id && <OtherLayers data={data} mapId={option.id} layer={layer} activeFloor={activeFloor} toggles={otherToggles} items={items} ownedKeyIds={ctx?.ownedKeyIds ?? NO_KEYS} />}
          {layers.containers && containersShown.length > 0 && <LootLayer groups={containersShown} clusterBelowZoom={layer.maxZoom - 1} />}
          {layers.hazards && details && details.hazards.length > 0 && <HazardLayer hazards={details.hazards} />}
          {spawnModel && <SpawnLayer model={spawnModel} toggles={spawnToggles} clusterBelowZoom={layer.maxZoom - 1} />}
          {layers.valuables && <LootSpotLayer spots={valuable} items={items} kind="valuable" onPick={openItem} />}
          {layers.needed && <LootSpotLayer spots={needed} items={items} kind="needed" onPick={openItem} />}
          {shown.map(({ mapTask, color }) => (
            <TaskLayer key={mapTask.task.id} mapTask={mapTask} color={color} activeFloor={activeFloor} hasFloors={hasFloors} canvas={markers > 200} />
          ))}
          {pins.length > 0 && <PinsLayer pins={pins} maxZoom={layer.maxZoom} />}
          <QuestFocus mapTasks={mapTasks} maxZoom={layer.maxZoom} initial={initialFocus} />
          <SpotLayer spot={spot} maxZoom={layer.maxZoom} />
          {position && <PositionLayer pos={position} />}
          {ruler && <RulerLayer from={position ? { x: position.x, y: position.y, z: position.z } : null} />}
        </MapViewer>
        <button
          type="button"
          onClick={() => setRuler(!ruler)}
          title={ruler ? 'Stop measuring' : position ? 'Measure from where you are: click a point for the distance in metres' : 'Measure: click two points for the distance in metres'}
          aria-label="Ruler"
          className={`absolute bottom-1.5 z-[1000] rounded border border-white/20 p-1 ${flip.left ? 'right-1.5' : 'left-1.5'} ${ruler ? 'bg-sky-500/80 text-white' : 'bg-black/70 text-white/75 hover:text-white'}`}
        >
          <Ruler className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => p.set({ sidebar: !sidebar })}
          title={sidebar ? 'Hide the list' : 'Quests, extracts, bosses, keys and loot on this map'}
          aria-label={sidebar ? 'Hide the quest list' : 'Show the quest list'}
          className={`absolute top-1/2 z-[1000] flex h-10 w-4 -translate-y-1/2 items-center justify-center bg-black/70 text-white/70 hover:text-white ${flip.left ? 'left-0 rounded-r' : 'right-0 rounded-l'}`}
        >
          {sidebar !== flip.left ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        <span
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          title="Drag to resize the map"
          aria-label="Resize the map"
          className={`absolute bottom-0 z-[1000] h-4 w-4 touch-none ${flip.left ? 'left-0 cursor-nesw-resize' : 'right-0 cursor-nwse-resize'}`}
          style={{ background: `linear-gradient(${flip.left ? '225deg' : '135deg'}, transparent 50%, rgba(255,255,255,0.45) 50%)` }}
        />
      </div>
      {sidebar && (
        <div className="flex shrink-0 flex-col overflow-hidden rounded-md bg-white/5 text-[12px]" style={{ width: p.sideW, zoom }}>
          <div role="tablist" className="flex border-b border-white/10">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} title={t.label} aria-label={t.label} onClick={() => p.set({ tab: t.id })} className={`flex flex-1 items-center justify-center py-1 ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
                <t.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-white/45">{TABS.find((t) => t.id === tab)?.label}</div>
          {(tab === 'quests' || tab === 'extracts' || tab === 'locks') && filterBox(tab === 'locks' ? 'Find a key…' : 'Filter…')}
          <ul className="min-h-0 flex-1 overflow-y-auto py-0.5 [scrollbar-width:thin]">
            {tab === 'quests' && (
              <>
                {questList.length === 0 && <li className="px-2 py-1.5 text-[11px] text-white/55">No quests you can do have spots on this map.</li>}
                {questList.length > 1 && (
                  <li className="flex gap-1 px-2 pb-1">
                    <button type="button" onClick={() => setManyChecked(questList.map(({ m }) => m.task.id), true)} className="flex-1 rounded border border-white/15 px-1 py-0.5 text-[10px] hover:bg-white/10" title="Show every quest in this list on the map">
                      Tick all
                    </button>
                    <button type="button" onClick={() => setManyChecked(questList.map(({ m }) => m.task.id), false)} className="flex-1 rounded border border-white/15 px-1 py-0.5 text-[10px] hover:bg-white/10" title="Hide them all">
                      Untick all
                    </button>
                  </li>
                )}
                {bring.length > 0 && (
                  <li className="mx-1.5 mb-1 rounded bg-white/5 px-1.5 py-1">
                    <div className="text-[10px] uppercase tracking-wide text-white/45">Bring for the ticked quests</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {bring.map((b) => {
                        const it = items?.[b.itemIds[0]]
                        const name = b.questItemName ?? it?.shortName ?? 'Item'
                        return (
                          <button
                            key={`${b.kind}:${b.itemIds.join('|')}:${b.questItemName ?? ''}`}
                            type="button"
                            onClick={() => it && ctx?.open({ kind: 'item', id: it.id })}
                            title={`${name}${b.itemIds.length > 1 ? ` or ${b.itemIds.length - 1} other${b.itemIds.length > 2 ? 's' : ''}` : ''} · for ${b.quests.join(', ')}${b.optional ? ' (optional)' : ''}`}
                            className={`flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] ${b.optional ? 'border-white/10 text-white/50' : 'border-white/20'} hover:bg-white/10`}
                          >
                            {it?.iconLink && <img src={it.iconLink} alt="" loading="lazy" className="h-4 w-4 object-contain" />}
                            {b.count > 1 ? `${b.count}× ` : ''}
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )}
                {questList
                  .filter(({ m }) => match(m.task.name))
                  .map(({ m, d }) => {
                    const on = checked.includes(m.task.id)
                    return (
                      <li key={m.task.id} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5">
                        <input type="checkbox" checked={on} onChange={(e) => setChecked(m.task.id, e.target.checked)} aria-label={`Show ${m.task.name} on the map`} className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
                        {on && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: taskColor(colors[m.task.id]) }} />}
                        <button type="button" onClick={() => focus(m.task.id)} title="Show and zoom to it" className="min-w-0 flex-1 truncate text-left hover:text-white">
                          {m.task.name}
                        </button>
                        {d !== null && <span className="shrink-0 text-[10px] tabular-nums text-sky-300">{Math.round(d)} m</span>}
                        <button type="button" onClick={() => focus(m.task.id)} aria-label={`Zoom to ${m.task.name}`} title="Zoom to it" className="shrink-0 text-white/45 hover:text-white">
                          <Crosshair className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => ctx?.open({ kind: 'quest', id: m.task.id })} aria-label={`Details of ${m.task.name}`} title="Details beside the map (keys, items, pictures)" className="shrink-0 text-white/45 hover:text-white">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
              </>
            )}
            {tab === 'extracts' && (
              <>
                {extracts.length === 0 && (details?.transits ?? []).length === 0 && <li className="px-2 py-1.5 text-[11px] text-white/55">No extracts in the data for this map.</li>}
                <li className="flex gap-1 px-2 pb-1">
                  {(['all', 'pmc', 'scav'] as const).map((side) => (
                    <button key={side} type="button" onClick={() => p.set({ extractSide: side })} className={`flex-1 rounded border px-1 py-0.5 text-[10px] ${extractSide === side ? 'border-white/50 bg-white/15' : 'border-white/15 hover:bg-white/10'}`}>
                      {side === 'all' ? 'All' : side === 'pmc' ? 'PMC' : 'Scav'}
                    </button>
                  ))}
                </li>
                {extracts
                  .filter(({ e }) => match(e.name))
                  .map(({ e, d }) => (
                    <li key={`${e.faction}:${e.name}`}>
                      <button type="button" onClick={() => zoomTo([e.position], e.name)} title="Zoom to it" className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left hover:bg-white/5 hover:text-white">
                        <span className={`w-9 shrink-0 text-[10px] ${e.faction === 'pmc' ? 'text-sky-300' : e.faction === 'scav' ? 'text-amber-300' : 'text-green-300'}`}>{FACTION_LABEL[e.faction]}</span>
                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                        {d !== null && <span className="shrink-0 text-[10px] tabular-nums text-sky-300">{Math.round(d)} m</span>}
                      </button>
                    </li>
                  ))}
                {(details?.transits ?? [])
                  .filter((t) => match(mapName(t.targetMapId)))
                  .map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => zoomTo([t.position], `Transit to ${mapName(t.targetMapId)}`)} title="Zoom to it" className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left hover:bg-white/5 hover:text-white">
                        <span className="w-9 shrink-0 text-[10px] text-violet-300">Transit</span>
                        <span className="min-w-0 flex-1 truncate">to {mapName(t.targetMapId)}</span>
                      </button>
                    </li>
                  ))}
              </>
            )}
            {tab === 'bosses' && spawnModel && (
              <>
                {spawnModel.goonsHere && <li className="px-2 py-1 text-[11px] text-amber-300">The Goons were last reported on this map.</li>}
                {spawnModel.bosses.length === 0 && <li className="px-2 py-1.5 text-[11px] text-white/55">No bosses in the data for this map.</li>}
                {spawnModel.bosses.map((b) => {
                  // Ring only its spots (where the portraits are) and zoom to the areas around them too: a ring
                  // on every corner of every area used to clutter the map.
                  const shownSpots = b.spots.filter((s) => s.kind !== 'data')
                  const points = shownSpots.map((s) => s.centre)
                  const fit = [...b.areas.flatMap((a) => a.polygon.map(([x, z]) => ({ x, y: 0, z }))), ...shownSpots.flatMap((s) => s.points)]
                  const dataOnly = b.spots.filter((s) => s.kind === 'data').reduce((n, s) => n + s.points.length, 0)
                  const places = shownSpots.map((s) => `${s.kind === 'reported' ? '◌ ' : ''}${s.name}${s.share > 0 ? ` ${Math.round(s.share * 100)}%` : ''}`)
                  return (
                    <li key={b.key} className="flex items-start">
                      <button
                        type="button"
                        disabled={!points.length}
                        onClick={() => {
                          p.toggleLayer('bosses', true)
                          zoomTo(points, b.name, fit)
                        }}
                        title={points.length ? 'Show where it spawns (◌ = players report it there, EFT Wiki map)' : 'No spawn spots in the data'}
                        className="flex min-w-0 flex-1 items-start gap-1.5 px-2 py-0.5 text-left hover:bg-white/5 hover:text-white disabled:cursor-default"
                      >
                        <span className="w-9 shrink-0 tabular-nums text-[11px] text-white/60">{Math.round(b.spawnChance * 100)}%</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{b.name}</span>
                          {places.length > 0 && <span className="block text-[10px] text-white/45">{places.join(' · ')}</span>}
                          {dataOnly > 0 && <span className="block text-[10px] text-white/30">+{dataOnly} point{dataOnly === 1 ? '' : 's'} only in the game data</span>}
                          {b.note && <span className="block text-[10px] text-amber-300/80">{b.note}</span>}
                        </span>
                      </button>
                      <button type="button" onClick={() => ctx?.open({ kind: 'boss', id: b.key })} aria-label={`How ${b.name} behaves`} title="How it behaves, every map, the wiki's maps (beside the map)" className="mr-1 mt-1 shrink-0 text-white/45 hover:text-white">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
                <li className="mt-1 border-t border-white/10 pt-1">
                  {layerCheck('bosses', 'Show all bosses')}
                  {layerCheck('guards')}
                  {layerCheck('snipers', `Sniper scavs (${spawnModel.sniper.length})`)}
                  {layerCheck('pmcSpawns', `PMC spawns (${spawnModel.pmc.length})`)}
                  {layerCheck('scavSpawns', `Scav spawns (${spawnModel.scav.length})`)}
                </li>
              </>
            )}
            {tab === 'locks' && (
              <>
                <li>{layerCheck('locks', `Show all locked doors (${details?.locks.length ?? 0})`)}</li>
                <li className="flex gap-1 px-2 pb-1">
                  {(['all', 'owned', 'quest'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setLockFilter(f)} className={`flex-1 rounded border px-1 py-0.5 text-[10px] ${lockFilter === f ? 'border-white/50 bg-white/15' : 'border-white/15 hover:bg-white/10'}`}>
                      {f === 'all' ? 'All' : f === 'owned' ? 'I have' : 'For quests'}
                    </button>
                  ))}
                </li>
                {locks
                  .filter((g) => lockFilter === 'all' || (lockFilter === 'owned' ? ctx?.ownedKeyIds.has(g.keyId) : questKeyIds.has(g.keyId)))
                  .filter((g) => match(`${items?.[g.keyId]?.name ?? ''} ${items?.[g.keyId]?.shortName ?? ''}`))
                  .map((g) => {
                    const key = items?.[g.keyId]
                    const owned = ctx?.ownedKeyIds.has(g.keyId)
                    return (
                      <li key={g.keyId} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${owned ? 'bg-green-400' : 'bg-red-400'}`} title={owned ? 'You have this key' : 'Not marked as owned'} />
                        {key?.iconLink && <img src={key.iconLink} alt="" loading="lazy" className="h-5 w-5 shrink-0 object-contain" />}
                        <button type="button" onClick={() => zoomTo(g.positions, key?.shortName ?? 'Lock')} title={`Zoom to its lock (${[...g.types].join(', ')})`} className="min-w-0 flex-1 truncate text-left hover:text-white">
                          {key?.shortName ?? 'Key'}
                          {g.positions.length > 1 ? ` ×${g.positions.length}` : ''}
                        </button>
                        <button type="button" onClick={() => ctx?.open({ kind: 'item', id: g.keyId })} aria-label="Key details" title="Key details beside the map" className="shrink-0 text-white/45 hover:text-white">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    )
                  })}
              </>
            )}
            {tab === 'loot' && (
              <>
                <li>{layerCheck('needed', `Loot you still need (${needed.length} spots)`)}</li>
                {neededList.slice(0, 40).map((r) => {
                  const it = items?.[r.itemId]
                  return (
                    <li key={r.itemId} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5">
                      {it?.iconLink && <img src={it.iconLink} alt="" loading="lazy" className="h-5 w-5 shrink-0 object-contain" />}
                      <button type="button" onClick={() => zoomTo(r.spots, `${it?.shortName ?? 'Item'} can lie here`)} className="min-w-0 flex-1 truncate text-left hover:text-white" title="Ring its spots">
                        {it?.shortName ?? 'Item'} <span className="text-white/45">· {r.spots.length}</span>
                      </button>
                      <button type="button" onClick={() => ctx?.open({ kind: 'item', id: r.itemId })} aria-label="Item details" className="shrink-0 text-white/45 hover:text-white">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
                <li className="mt-1 border-t border-white/10 pt-1">{layerCheck('valuables', `Valuable loose loot (${valuable.length})`)}</li>
                <li className="px-2 text-[10px] text-white/45">
                  Worth {formatRoubles(p.lootMin)}
                  {p.lootPerSlot ? ' per slot' : ''} or more · change it in the bar's settings
                </li>
                <li className="mt-1 border-t border-white/10 pt-1">{layerCheck('containers', 'Containers')}</li>
                {lootGroups.map((g) => (
                  <li key={g.name}>
                    <label className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 hover:bg-white/5">
                      <input type="checkbox" checked={!p.containersOff.includes(g.name)} onChange={() => p.toggleContainer(g.name)} className="h-3 w-3 shrink-0 accent-[var(--color-accent)]" />
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: g.color }} />
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span className="text-[10px] text-white/45">{g.positions.length}</span>
                    </label>
                  </li>
                ))}
                <li className="px-2 pt-1 text-[10px] text-white/40">Spots are tarkov.dev's; spawn chances are not in the data.</li>
              </>
            )}
            {tab === 'layers' && (
              <>
                {(['Map', 'Spawns', 'Loot'] as const).map((group) => (
                  <li key={group}>
                    <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-white/40">{group}</div>
                    {LAYER_INFO.filter((l) => l.group === group).map((l) => layerCheck(l.id))}
                  </li>
                ))}
                {floors.length > 0 && (
                  <li>
                    <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-white/40">Floor</div>
                    <div className="flex flex-wrap gap-1 px-2 py-0.5">
                      {[null, ...floors.map((fl) => fl.name)].map((name) => (
                        <button key={name ?? 'ground'} type="button" onClick={() => setFloor(option.key, name)} className={`rounded border px-1.5 py-0.5 text-[11px] ${activeFloor === name ? 'border-white/50 bg-white/15' : 'border-white/15 hover:bg-white/10'}`}>
                          {name ?? 'Ground'}
                        </button>
                      ))}
                    </div>
                  </li>
                )}
                {option.cfg.baseLayers.length > 1 && (
                  <li>
                    <div className="px-2 pt-1 text-[10px] uppercase tracking-wide text-white/40">Picture</div>
                    <div className="flex flex-wrap gap-1 px-2 py-0.5">
                      {option.cfg.baseLayers.map((bl) => (
                        <button key={bl.id} type="button" onClick={() => setBaseLayer(option.key, bl.id)} className={`rounded border px-1.5 py-0.5 text-[11px] ${layer.id === bl.id ? 'border-white/50 bg-white/15' : 'border-white/15 hover:bg-white/10'}`}>
                          {bl.label}
                        </button>
                      ))}
                    </div>
                  </li>
                )}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
