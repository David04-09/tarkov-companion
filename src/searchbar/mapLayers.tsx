import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Polygon, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { ItemsById, MapHazard, Position } from '../api/types'
import { formatRoubles } from '../lib/format'
import type { MapTask } from '../maps/overlay/mapTasks'
import { useMapOverlayStore } from '../store/mapOverlay'
import { distance2d, itemValue, valueColor, type LootSpot } from './overlayLogic'

const ll = (p: Position) => L.latLng(p.z, p.x)

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

/** Pins (a key's lock and where the key lies), zoomed to once: the locks if any, else all. */
export function PinsLayer({ pins, maxZoom }: { pins: MapPin[]; maxZoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (!pins.length) return
    const locks = pins.filter((p) => p.kind === 'lock').map((p) => ll(p.position))
    const target = locks.length ? locks : pins.map((p) => ll(p.position))
    if (target.length === 1) map.setView(target[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else map.fitBounds(L.latLngBounds(target).pad(0.4), { maxZoom: maxZoom - 0.5, animate: false })
  }, [map, pins, maxZoom])
  return (
    <>
      {pins.map((p, i) => (
        <CircleMarker key={i} center={ll(p.position)} radius={PIN_STYLE[p.kind].radius ?? 7} pathOptions={PIN_STYLE[p.kind]}>
          <Tooltip direction="top" offset={[0, -8]} permanent={p.kind === 'lock'}>
            {p.label}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

/**
 * Zooms to a quest: the one the map was opened for, then whatever is picked in the list. Requests
 * made before the map opened are ignored (the Maps tab's last focus must not pull this map away).
 */
export function QuestFocus({ mapTasks, maxZoom, initial }: { mapTasks: MapTask[]; maxZoom: number; initial?: string }) {
  const map = useMap()
  const request = useMapOverlayStore((s) => s.focusRequest)
  const [since] = useState(() => request?.nonce ?? 0)
  const fresh = request && request.nonce > since ? request : null
  const target = fresh?.taskId ?? initial
  const stamp = `${target}:${fresh?.nonce ?? 0}`
  const done = useRef(new Set<string>())
  useEffect(() => {
    if (!target || done.current.has(stamp)) return
    const mt = mapTasks.find((m) => m.task.id === target)
    if (!mt) return
    done.current.add(stamp)
    // Once anything was zoomed to, the opening quest never pulls the map back by itself.
    done.current.add(`${initial}:0`)
    const points = mt.placements.flatMap((p) => [ll(p.position), ...(p.outline ?? []).map(ll)])
    const bounds = L.latLngBounds(points)
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) map.setView(points[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else map.fitBounds(bounds.pad(0.35), { maxZoom, animate: false })
  }, [map, mapTasks, maxZoom, target, stamp, initial])
  return null
}

/** A place picked in a list (an extract, a boss's spawn, a lock, an item's spots): zoomed to and ringed in yellow. */
export interface Spot {
  points: Position[]
  label: string
  /** Zoomed to as well, but not ringed (a boss's reported areas: the boss layer draws those itself). */
  fit?: Position[]
  nonce: number
}

const SPOT_STYLE: L.CircleMarkerOptions = { color: '#facc15', weight: 2.5, dashArray: '4 3', fillColor: '#facc15', fillOpacity: 0.15 }
/** The rings only show where something is, then get out of the way (a click on the map clears them sooner). */
const SPOT_SHOW_MS = 6000

export function SpotLayer({ spot, maxZoom }: { spot: Spot | null; maxZoom: number }) {
  const map = useMap()
  const [hidden, setHidden] = useState(0)
  useMapEvents({ click: () => spot && setHidden(spot.nonce) })
  useEffect(() => {
    if (!spot) return
    const pts = [...spot.points, ...(spot.fit ?? [])].map(ll)
    if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), maxZoom - 1), { animate: false })
    else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: maxZoom - 0.5, animate: false })
    const t = setTimeout(() => setHidden(spot.nonce), SPOT_SHOW_MS)
    return () => clearTimeout(t)
  }, [map, spot, maxZoom])
  if (!spot || hidden === spot.nonce) return null
  return (
    <>
      {spot.points.slice(0, 300).map((p, i) => (
        <CircleMarker key={`${spot.nonce}:${i}`} center={ll(p)} radius={spot.points.length > 20 ? 9 : 14} pathOptions={SPOT_STYLE} interactive={false}>
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

const NEEDED_COLOR = '#22c55e'
const styleCache = new Map<string, L.PathOptions>()
const dotStyle = (color: string) => {
  let s = styleCache.get(color)
  if (!s) styleCache.set(color, (s = { color: '#0b0b0b', weight: 1, fillColor: color, fillOpacity: 0.95 }))
  return s
}

/**
 * Loose-loot spots (valuable, or holding items you still need) as dots, clustered into grid cells
 * while zoomed out (re-clustered per whole zoom level only). Hover lists what can lie there.
 */
export const LootSpotLayer = memo(function LootSpotLayer({ spots, items, kind, onPick }: { spots: LootSpot[]; items: ItemsById | undefined; kind: 'valuable' | 'needed'; onPick?: (itemId: string) => void }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => Math.floor(map.getZoom()))
  useMapEvents({ zoomend: () => setZoom(Math.floor(map.getZoom())) })
  const clusterBelow = map.getMaxZoom() - 2
  const { clusters, singles } = useMemo(() => {
    if (zoom >= clusterBelow) return { clusters: [] as { key: string; lat: number; lng: number; n: number; best: number }[], singles: spots }
    const cells = new Map<string, { sx: number; sz: number; n: number; best: number; one: LootSpot }>()
    for (const s of spots) {
      const px = map.project(ll(s.position), zoom)
      const key = `${Math.floor(px.x / 44)}:${Math.floor(px.y / 44)}`
      const c = cells.get(key)
      if (c) {
        c.sx += s.position.x
        c.sz += s.position.z
        c.n += 1
        c.best = Math.max(c.best, s.best)
      } else cells.set(key, { sx: s.position.x, sz: s.position.z, n: 1, best: s.best, one: s })
    }
    const clusters: { key: string; lat: number; lng: number; n: number; best: number }[] = []
    const singles: LootSpot[] = []
    for (const [key, c] of cells) {
      if (c.n === 1) singles.push(c.one)
      else clusters.push({ key, lat: c.sz / c.n, lng: c.sx / c.n, n: c.n, best: c.best })
    }
    return { clusters, singles }
  }, [spots, zoom, clusterBelow, map])
  const colorOf = (best: number) => (kind === 'needed' ? NEEDED_COLOR : valueColor(best))
  const label = (s: LootSpot) => {
    const names = s.itemIds.slice(0, 4).map((id) => {
      const it = items?.[id]
      return it ? `${it.shortName}${kind === 'valuable' ? ` ${formatRoubles(itemValue(it))}` : ''}` : 'item'
    })
    return `${kind === 'needed' ? 'You need: ' : ''}${names.join(', ')}${s.itemIds.length > 4 ? ` +${s.itemIds.length - 4} more` : ''}`
  }
  return (
    <>
      {clusters.map((c) => (
        <CircleMarker
          key={c.key}
          center={[c.lat, c.lng]}
          radius={c.n >= 20 ? 11 : 8}
          pathOptions={{ color: colorOf(c.best), weight: 2, fillColor: colorOf(c.best), fillOpacity: 0.35 }}
          eventHandlers={{ click: () => map.setView([c.lat, c.lng], Math.min(map.getMaxZoom(), map.getZoom() + 2)) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{`${c.n} ${kind === 'needed' ? 'spots with loot you need' : 'valuable loot spots'} (click to zoom)`}</Tooltip>
        </CircleMarker>
      ))}
      {singles.map((s, i) => (
        <CircleMarker key={`${s.position.x}:${s.position.z}:${i}`} center={ll(s.position)} radius={4.5} pathOptions={dotStyle(colorOf(s.best))} eventHandlers={onPick ? { click: () => onPick(s.itemIds[0]) } : undefined}>
          <Tooltip direction="top" offset={[0, -5]}>{label(s)}</Tooltip>
        </CircleMarker>
      ))}
    </>
  )
})

/** Minefields, sniper zones and other hazards: the area is only drawn; its name shows on the centre dot. */
export const HazardLayer = memo(function HazardLayer({ hazards }: { hazards: MapHazard[] }) {
  return (
    <>
      {hazards.map((h, i) => (
        <Fragment key={`${h.id}:${i}`}>
          {h.outline.length > 2 && <Polygon positions={h.outline.map(ll)} interactive={false} pathOptions={{ color: '#ef4444', weight: 1.5, dashArray: '5 4', fillColor: '#ef4444', fillOpacity: 0.12 }} />}
          <CircleMarker center={ll(h.position)} radius={5} pathOptions={{ color: '#0b0b0b', weight: 1, fillColor: '#ef4444', fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -5]}>{`${h.name || h.type}${h.name && h.type && h.name !== h.type ? ` (${h.type})` : ''}`}</Tooltip>
          </CircleMarker>
        </Fragment>
      ))}
    </>
  )
})

/** Ruler (mounted only while measuring): click two points for the straight distance in metres (a third click starts again). */
export function RulerLayer({ from }: { from?: Position | null }) {
  // With your screenshot position, measuring starts from you: one click gives the distance.
  const [pts, setPts] = useState<Position[]>(() => (from ? [from] : []))
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = 'crosshair'
    return () => {
      el.style.cursor = ''
    }
  }, [map])
  useMapEvents({
    click: (e) => {
      const p = { x: e.latlng.lng, y: 0, z: e.latlng.lat }
      setPts((old) => (old.length >= 2 ? (from ? [from, p] : [p]) : [...old, p]))
    },
  })
  if (pts.length === 0) return null
  const d = pts.length === 2 ? distance2d(pts[0], pts[1]) : 0
  return (
    <>
      {pts.length === 2 && <Polyline positions={pts.map(ll)} pathOptions={{ color: '#38bdf8', weight: 2.5, dashArray: '6 4' }} interactive={false} />}
      {pts.map((p, i) => (
        <CircleMarker key={i} center={ll(p)} radius={5} pathOptions={{ color: '#0b0b0b', weight: 1, fillColor: '#38bdf8', fillOpacity: 1 }} interactive={false}>
          {i === 1 && (
            <Tooltip direction="top" offset={[0, -6]} permanent>
              {Math.round(d)} m
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  )
}
