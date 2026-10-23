import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Tooltip, useMap } from 'react-leaflet'
import { ChevronLeft, ChevronRight, Crosshair } from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import type { Position } from '../api/types'
import { MapViewer } from '../maps/MapViewer'
import { resolveBaseLayer } from '../maps/mapConfig'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { OtherLayers } from '../maps/overlay/OtherLayers'
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

/**
 * The search bar's map: the same picture, extracts and quest markers as the Maps tab (the
 * picture and layers you chose there), with the quests ticked "On map", optional pins (a key's
 * lock), and a collapsible list on the right to tick quests or jump to them.
 */
export function SearchBarMap({ option, pins = [], focus: initialFocus, sidebar, onSidebar }: { option: MapOption; pins?: MapPin[]; focus?: string; sidebar: boolean; onSidebar: (open: boolean) => void }) {
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
  const layer = resolveBaseLayer(option.cfg, preferred)
  const activeFloor = storedFloor ?? null
  const ownedKeyIds = useMemo(() => new Set(inventory.ownedKeyIds), [inventory.ownedKeyIds])

  const mapTasks = useMemo(
    () => (gameData.data && option.id ? buildMapTasks(gameData.data, option.id, layer).filter((m) => isFactionEligible(m.task, profile.faction) && m.placements.length > 0) : []),
    [gameData.data, option.id, layer, profile.faction],
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
  // The list: quests ticked on this map first, then the ones you can do here now.
  const list = useMemo(() => {
    const on = new Set(checked)
    return mapTasks
      .filter((m) => on.has(m.task.id) || statuses[m.task.id] === 'available')
      .sort((a, b) => Number(on.has(b.task.id)) - Number(on.has(a.task.id)) || a.task.name.localeCompare(b.task.name))
  }, [mapTasks, checked, statuses])
  const focus = (taskId: string) => {
    setChecked(taskId, true)
    requestFocus(taskId)
  }

  return (
    <div className="flex h-72 gap-1.5">
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-md">
        <MapViewer mapKey={`searchbar:${option.key}:${layer.id}`} layer={layer} floorName={activeFloor}>
          {gameData.data && option.id && <OtherLayers data={gameData.data} mapId={option.id} layer={layer} activeFloor={activeFloor} toggles={toggles} items={items} ownedKeyIds={ownedKeyIds} />}
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
        </MapViewer>
        <button
          type="button"
          onClick={() => onSidebar(!sidebar)}
          title={sidebar ? 'Hide the quest list' : 'Quests on this map'}
          aria-label={sidebar ? 'Hide the quest list' : 'Show the quest list'}
          className="absolute right-0 top-1/2 z-[1000] flex h-10 w-4 -translate-y-1/2 items-center justify-center rounded-l bg-black/70 text-white/70 hover:text-white"
        >
          {sidebar ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>
      {sidebar && (
        <div className="flex w-52 shrink-0 flex-col overflow-hidden rounded-md bg-white/5">
          <div className="border-b border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-white/55">Quests here</div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-0.5">
            {list.length === 0 && <li className="px-2 py-1.5 text-[11px] text-white/55">No quests you can do have spots on this map.</li>}
            {list.map((m) => {
              const on = checked.includes(m.task.id)
              return (
                <li key={m.task.id} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/5">
                  <input type="checkbox" checked={on} onChange={(e) => setChecked(m.task.id, e.target.checked)} aria-label={`Show ${m.task.name} on the map`} className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
                  {on && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: taskColor(colors[m.task.id]) }} />}
                  <button type="button" onClick={() => focus(m.task.id)} title="Show and zoom to it" className="min-w-0 flex-1 truncate text-left text-[12px] hover:text-white">
                    {m.task.name}
                  </button>
                  <button type="button" onClick={() => focus(m.task.id)} aria-label={`Zoom to ${m.task.name}`} className="shrink-0 text-white/45 hover:text-white">
                    <Crosshair className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
