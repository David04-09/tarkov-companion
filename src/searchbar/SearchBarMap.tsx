import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { ChevronLeft, ChevronRight, Crosshair, Info } from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { Position } from '../api/types'
import { MapViewer } from '../maps/MapViewer'
import { resolveBaseLayer } from '../maps/mapConfig'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { OtherLayers } from '../maps/overlay/OtherLayers'
import { buildSpawnModel } from '../maps/overlay/spawns'
import { TaskLayer } from '../maps/overlay/TaskLayer'
import type { MapOption } from '../maps/useMapOptions'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { useModeInventory } from '../store/inventory'
import { taskColor, useMapOverlayStore } from '../store/mapOverlay'
import { useProfile } from '../store/progress'
import { useUiStore } from '../store/ui'

/** A spot to mark on the map besides quests: a key's lock, or where the key lies around. */
export interface MapPin {
  position: Position
  label: string
  kind: 'lock' | 'spawn'
}

const PIN_STYLE: Record<MapPin['kind'], L.CircleMarkerOptions> = {
  lock: { color: '#ffffff', weight: 2, fillColor: '#ef4444', fillOpacity: 1, radius: 8 },
  spawn: { color: '#0b0b0b', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.95, radius: 6 },
}

/** Zooms to the pins once (a key's lock and spawn spots). */
function FitPins({ pins, maxZoom }: { pins: MapPin[]; maxZoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (!pins.length) return
    const pts = pins.map((p) => L.latLng(p.position.z, p.position.x))
    // The lock matters most: fit the locks if there are any, the spawns otherwise.
    const locks = pins.filter((p) => p.kind === 'lock').map((p) => L.latLng(p.position.z, p.position.x))
    const target = locks.length ? locks : pts
    if (target.length === 1) map.setView(target[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else map.fitBounds(L.latLngBounds(target).pad(0.4), { maxZoom: maxZoom - 0.5, animate: false })
  }, [map, pins, maxZoom])
  return null
}

/**
 * Zooms to a quest: the one the map was opened for, then whatever is picked in the list. Requests
 * made before the map opened are ignored (the Maps tab's last focus must not pull this map away).
 */
function QuestFocus({ mapTasks, maxZoom, initial }: { mapTasks: MapTask[]; maxZoom: number; initial?: string }) {
  const map = useMap()
  const request = useMapOverlayStore((s) => s.focusRequest)
  const [since] = useState(() => request?.nonce ?? 0)
  const fresh = request && request.nonce > since ? request : null
  const target = fresh?.taskId ?? initial
  const stamp = `${target}:${fresh?.nonce ?? 0}`
  const done = useRef('')
  useEffect(() => {
    if (!target || done.current === stamp) return
    const mt = mapTasks.find((m) => m.task.id === target)
    if (!mt) return
    done.current = stamp
    const points = mt.placements.flatMap((p) => [L.latLng(p.position.z, p.position.x), ...(p.outline ?? []).map((o) => L.latLng(o.z, o.x))])
    const bounds = L.latLngBounds(points)
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) map.setView(points[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else map.fitBounds(bounds.pad(0.35), { maxZoom, animate: false })
  }, [map, mapTasks, maxZoom, target, stamp])
  return null
}

/** A place picked in the list (an extract, a boss's spawn): zoomed to and ringed in yellow. */
interface Spot {
  points: Position[]
  label: string
  nonce: number
}

const SPOT_STYLE: L.CircleMarkerOptions = { color: '#facc15', weight: 2.5, dashArray: '4 3', fillColor: '#facc15', fillOpacity: 0.15 }

function SpotLayer({ spot, maxZoom }: { spot: Spot | null; maxZoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (!spot?.points.length) return
    const pts = spot.points.map((p) => L.latLng(p.z, p.x))
    if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: maxZoom - 0.5, animate: false })
  }, [map, spot, maxZoom])
  if (!spot) return null
  return (
    <>
      {spot.points.map((p, i) => (
        <CircleMarker key={`${spot.nonce}:${i}`} center={[p.z, p.x]} radius={14} pathOptions={SPOT_STYLE} interactive={false}>
          {i === 0 && (
            <Tooltip direction="top" offset={[0, -14]} permanent>
              {spot.label}
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  )
}

type Tab = 'quests' | 'extracts' | 'bosses'
const TAB_KEY = 'tc-searchbar-map-tab'
const TABS: { id: Tab; label: string }[] = [
  { id: 'quests', label: 'Quests' },
  { id: 'extracts', label: 'Extracts' },
  { id: 'bosses', label: 'Bosses' },
]

function readTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return v === 'extracts' || v === 'bosses' ? v : 'quests'
  } catch {
    return 'quests'
  }
}

const FACTION_LABEL = { pmc: 'PMC', scav: 'Scav', shared: 'Both' } as const

/**
 * The search bar's map: the same picture, extracts and quest markers as the Maps tab (the
 * picture and layers you chose there), with the quests ticked "On map", optional pins (a key's
 * lock), and a list on the right (it folds away) with this map's quests, extracts and bosses:
 * tick quests, zoom to anything, open a quest's details beside the card.
 */
export function SearchBarMap({
  option,
  pins = [],
  focus: initialFocus,
  sidebar,
  onSidebar,
  tall,
  onQuestInfo,
}: {
  option: MapOption
  pins?: MapPin[]
  focus?: string
  sidebar: boolean
  onSidebar: (open: boolean) => void
  tall: boolean
  onQuestInfo: (taskId: string) => void
}) {
  const gameData = useGameData()
  const items = useItems().data?.items
  const profile = useProfile()
  const inventory = useModeInventory()
  const preferred = useUiStore((s) => s.baseLayerByMap[option.key])
  const storedFloor = useUiStore((s) => s.floorByMap[option.key])
  const toggles = useMapOverlayStore((s) => s.layers)
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  const colors = useMapOverlayStore((s) => s.colorIndexByTask)
  const setChecked = useMapOverlayStore((s) => s.setTaskChecked)
  const requestFocus = useMapOverlayStore((s) => s.requestFocus)
  const [tab, setTabState] = useState<Tab>(readTab)
  const [spot, setSpot] = useState<Spot | null>(null)
  const spotCount = useRef(0)
  const layer = resolveBaseLayer(option.cfg, preferred)
  const activeFloor = storedFloor ?? null
  const ownedKeyIds = useMemo(() => new Set(inventory.ownedKeyIds), [inventory.ownedKeyIds])
  const data = gameData.data
  const details = data && option.id ? data.mapDetails[option.id] : undefined

  const setTab = (t: Tab) => {
    setTabState(t)
    try {
      localStorage.setItem(TAB_KEY, t)
    } catch {
      // only a convenience
    }
  }

  const mapTasks = useMemo(
    () => (data && option.id ? buildMapTasks(data, option.id, layer).filter((m) => isFactionEligible(m.task, profile.faction) && m.placements.length > 0) : []),
    [data, option.id, layer, profile.faction],
  )
  const statuses = useMemo(() => computeTaskStatuses(mapTasks.map((m) => m.task), profile), [mapTasks, profile])
  const shown = useMemo(() => {
    const byId = new Map(mapTasks.map((m) => [m.task.id, m]))
    return checked.flatMap((id) => {
      const m = byId.get(id)
      return m ? [{ mapTask: m, color: taskColor(colors[id]) }] : []
    })
  }, [mapTasks, checked, colors])
  const markers = shown.reduce((n, s) => n + s.mapTask.placements.length, 0)
  // Quests ticked on this map first, then the ones you can do here now.
  const questList = useMemo(() => {
    const on = new Set(checked)
    return mapTasks
      .filter((m) => on.has(m.task.id) || statuses[m.task.id] === 'available')
      .sort((a, b) => Number(on.has(b.task.id)) - Number(on.has(a.task.id)) || a.task.name.localeCompare(b.task.name))
  }, [mapTasks, checked, statuses])
  // Extracts (one row per name; some maps repeat them) and transits, PMC first.
  const extracts = useMemo(() => {
    const seen = new Set<string>()
    const order = { pmc: 0, shared: 1, scav: 2 } as const
    return (details?.extracts ?? [])
      .filter((e) => !seen.has(`${e.faction}:${e.name}`) && seen.add(`${e.faction}:${e.name}`))
      .sort((a, b) => order[a.faction] - order[b.faction] || a.name.localeCompare(b.name))
  }, [details])
  const spawnModel = useMemo(() => (data && option.id && tab === 'bosses' ? buildSpawnModel(data, option.id) : null), [data, option.id, tab])
  const focus = (taskId: string) => {
    setChecked(taskId, true)
    requestFocus(taskId)
  }
  const zoomTo = (points: Position[], label: string) => points.length && setSpot({ points, label, nonce: ++spotCount.current })
  const mapName = (id: string | null) => data?.maps.find((m) => m.id === id)?.name ?? 'another map'

  return (
    <div className={`flex ${tall ? 'h-[26rem]' : 'h-72'} gap-1.5`}>
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
        <MapViewer mapKey={`searchbar:${option.key}:${layer.id}`} layer={layer} floorName={activeFloor}>
          {data && option.id && <OtherLayers data={data} mapId={option.id} layer={layer} activeFloor={activeFloor} toggles={toggles} items={items} ownedKeyIds={ownedKeyIds} />}
          {shown.map(({ mapTask, color }) => (
            <TaskLayer key={mapTask.task.id} mapTask={mapTask} color={color} activeFloor={activeFloor} hasFloors={layerHasFloorHeights(layer)} canvas={markers > 200} />
          ))}
          {pins.map((p, i) => (
            <CircleMarker key={i} center={[p.position.z, p.position.x]} radius={PIN_STYLE[p.kind].radius ?? 7} pathOptions={PIN_STYLE[p.kind]}>
              <Tooltip direction="top" offset={[0, -8]} permanent={p.kind === 'lock'}>
                {p.label}
              </Tooltip>
            </CircleMarker>
          ))}
          {pins.length > 0 && <FitPins pins={pins} maxZoom={layer.maxZoom} />}
          <QuestFocus mapTasks={mapTasks} maxZoom={layer.maxZoom} initial={initialFocus} />
          <SpotLayer spot={spot} maxZoom={layer.maxZoom} />
        </MapViewer>
        <button
          type="button"
          onClick={() => onSidebar(!sidebar)}
          title={sidebar ? 'Hide the list' : 'Quests, extracts and bosses on this map'}
          aria-label={sidebar ? 'Hide the quest list' : 'Show the quest list'}
          className="absolute right-0 top-1/2 z-[1000] flex h-10 w-4 -translate-y-1/2 items-center justify-center rounded-l bg-black/70 text-white/70 hover:text-white"
        >
          {sidebar ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>
      {sidebar && (
        <div className="flex w-52 shrink-0 flex-col overflow-hidden rounded-md bg-white/5">
          <div role="tablist" className="flex border-b border-white/10 text-[11px]">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex-1 px-1 py-1 uppercase tracking-wide ${tab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-0.5 text-[12px] [scrollbar-width:thin]">
            {tab === 'quests' && (
              <>
                {questList.length === 0 && <li className="px-2 py-1.5 text-[11px] text-white/55">No quests you can do have spots on this map.</li>}
                {questList.map((m) => {
                  const on = checked.includes(m.task.id)
                  return (
                    <li key={m.task.id} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5">
                      <input type="checkbox" checked={on} onChange={(e) => setChecked(m.task.id, e.target.checked)} aria-label={`Show ${m.task.name} on the map`} className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
                      {on && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: taskColor(colors[m.task.id]) }} />}
                      <button type="button" onClick={() => focus(m.task.id)} title="Show and zoom to it" className="min-w-0 flex-1 truncate text-left hover:text-white">
                        {m.task.name}
                      </button>
                      <button type="button" onClick={() => focus(m.task.id)} aria-label={`Zoom to ${m.task.name}`} title="Zoom to it" className="shrink-0 text-white/45 hover:text-white">
                        <Crosshair className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onQuestInfo(m.task.id)} aria-label={`Details of ${m.task.name}`} title="Details beside the map (keys, items, pictures)" className="shrink-0 text-white/45 hover:text-white">
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
                {extracts.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => zoomTo([e.position], e.name)} title="Zoom to it" className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left hover:bg-white/5 hover:text-white">
                      <span className={`w-9 shrink-0 text-[10px] ${e.faction === 'pmc' ? 'text-sky-300' : e.faction === 'scav' ? 'text-amber-300' : 'text-green-300'}`}>{FACTION_LABEL[e.faction]}</span>
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    </button>
                  </li>
                ))}
                {(details?.transits ?? []).map((t) => (
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
                  const points = b.spawns.flatMap((s) => s.locations.flatMap((l) => l.positions))
                  const places = [...new Set(b.spawns.flatMap((s) => s.locations.map((l) => l.name)).filter((n) => n && !/^[a-z]+_?\d*$/i.test(n)))]
                  return (
                    <li key={b.key}>
                      <button type="button" disabled={!points.length} onClick={() => zoomTo(points, b.name)} title={points.length ? 'Zoom to where it spawns' : 'No spawn spots in the data'} className="flex w-full items-start gap-1.5 px-2 py-0.5 text-left hover:bg-white/5 hover:text-white disabled:cursor-default">
                        <span className="w-9 shrink-0 tabular-nums text-[11px] text-white/60">{Math.round(b.spawnChance * 100)}%</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{b.name}</span>
                          {places.length > 0 && <span className="block truncate text-[10px] text-white/45">{places.join(', ')}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
