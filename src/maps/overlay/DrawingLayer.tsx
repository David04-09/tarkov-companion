import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useMap } from 'react-leaflet'
import { Trash2, Undo2 } from 'lucide-react'
import { gameDistanceMeters } from '../projection'
import { useDrawingsStore, type Drawing, type DrawingShape, type LatLngTuple } from '../../store/drawings'

// Only layers that opt in (the user's drawings) get Geoman handles; overlay markers stay untouched.
L.PM.setOptIn(true)

const COLORS = ['#f9c74f', '#f94144', '#4cc9f0', '#90be6d', '#b5179e', '#ffffff']
const MAX_HISTORY = 30

/** Layers created by the route planner carry this flag so they are not persisted as drawings. */
export const ROUTE_LAYER_FLAG = '__tcRoute'
/** Set on layers the user drew (or we restored); everything else on the map is left alone. */
const DRAWING_FLAG = '__tcDrawing'

type AnyLayer = L.Layer & { [ROUTE_LAYER_FLAG]?: boolean; [DRAWING_FLAG]?: boolean; __tcId?: string; options: L.PathOptions & { textMarker?: boolean; text?: string } }

const tuple = (ll: L.LatLng): LatLngTuple => [ll.lat, ll.lng]

function polylineLengthMeters(latlngs: L.LatLng[]): number {
  let m = 0
  for (let i = 1; i < latlngs.length; i++) {
    m += gameDistanceMeters({ x: latlngs[i - 1].lng, z: latlngs[i - 1].lat }, { x: latlngs[i].lng, z: latlngs[i].lat })
  }
  return m
}

/** Length label on routes ("1.2 km" / "340 m"). */
function bindLength(layer: L.Polyline) {
  const update = () => {
    const ll = layer.getLatLngs() as L.LatLng[]
    if (!Array.isArray(ll) || ll.length < 2 || !(ll[0] instanceof L.LatLng)) return
    const m = polylineLengthMeters(ll)
    layer.bindTooltip(m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`, { sticky: true })
  }
  update()
  layer.on('pm:edit pm:dragend pm:markerdragend', update)
}

function serialize(layer: AnyLayer): Drawing | null {
  const color = String(layer.options.color ?? COLORS[0])
  const weight = Number(layer.options.weight ?? 3)
  const id = layer.__tcId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  layer.__tcId = id
  let shape: DrawingShape | null = null
  if (layer instanceof L.Circle) shape = { type: 'circle', latlng: tuple(layer.getLatLng()), radius: layer.getRadius() }
  else if (layer instanceof L.Rectangle) shape = { type: 'rectangle', latlngs: (layer.getLatLngs()[0] as L.LatLng[]).map(tuple) }
  else if (layer instanceof L.Polygon) shape = { type: 'polygon', latlngs: (layer.getLatLngs()[0] as L.LatLng[]).map(tuple) }
  else if (layer instanceof L.Polyline) shape = { type: 'polyline', latlngs: (layer.getLatLngs() as L.LatLng[]).map(tuple) }
  else if (layer instanceof L.Marker) {
    const pm = (layer as unknown as { pm?: { getText?: () => string } }).pm
    const text = layer.options.textMarker ? (pm?.getText?.() ?? layer.options.text ?? '') : null
    shape = text !== null ? { type: 'text', latlng: tuple(layer.getLatLng()), text } : { type: 'marker', latlng: tuple(layer.getLatLng()) }
  }
  return shape ? { id, shape, color, weight } : null
}

function deserialize(d: Drawing): L.Layer | null {
  const opts: L.PathOptions & { pmIgnore?: boolean } = { color: d.color, weight: d.weight, fillColor: d.color, fillOpacity: 0.15, pmIgnore: false }
  const s = d.shape
  let layer: L.Layer | null = null
  switch (s.type) {
    case 'circle':
      layer = L.circle(s.latlng, { ...opts, radius: s.radius })
      break
    case 'rectangle':
      layer = L.rectangle(s.latlngs, opts)
      break
    case 'polygon':
      layer = L.polygon(s.latlngs, opts)
      break
    case 'polyline':
      layer = L.polyline(s.latlngs, opts)
      break
    case 'marker':
      layer = L.marker(s.latlng, { pmIgnore: false } as L.MarkerOptions)
      break
    case 'text':
      layer = L.marker(s.latlng, { textMarker: true, text: s.text, pmIgnore: false } as L.MarkerOptions)
      break
  }
  if (layer) {
    ;(layer as AnyLayer).__tcId = d.id
    ;(layer as AnyLayer)[DRAWING_FLAG] = true
  }
  return layer
}

/**
 * Geoman drawing tools: routes, shapes, text and markers, persisted per map
 * and game mode in game coordinates (so they survive image/alignment changes).
 */
export function DrawingLayer({ storageKey }: { storageKey: string }) {
  const map = useMap()
  const setDrawings = useDrawingsStore((s) => s.setDrawings)
  const [color, setColor] = useState(COLORS[0])
  const [weight, setWeight] = useState(3)
  const [confirmClear, setConfirmClear] = useState(false)
  const [historyLen, setHistoryLen] = useState(0)
  const history = useRef<Drawing[][]>([])
  const loading = useRef(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  // Persist current layers (skipping route-plan layers).
  const persist = () => {
    if (loading.current) return
    const list: Drawing[] = []
    for (const layer of drawingLayers()) {
      const d = serialize(layer)
      if (d) list.push(d)
    }
    const prev = useDrawingsStore.getState().byKey[storageKey] ?? []
    history.current.push(prev)
    if (history.current.length > MAX_HISTORY) history.current.shift()
    setHistoryLen(history.current.length)
    setDrawings(storageKey, list)
  }

  /** Only the user's drawings: quest/extract/spawn markers also get a Geoman `pm` instance and must not be touched. */
  const drawingLayers = () => (map.pm.getGeomanLayers() as AnyLayer[]).filter((l) => l[DRAWING_FLAG] && !l[ROUTE_LAYER_FLAG])

  const loadFromStore = (list: Drawing[]) => {
    loading.current = true
    for (const layer of drawingLayers()) layer.remove()
    for (const d of list) {
      const layer = deserialize(d)
      if (!layer) continue
      layer.addTo(map)
      if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) bindLength(layer)
    }
    loading.current = false
  }

  useEffect(() => {
    setContainer(map.getContainer().parentElement)
    map.pm.addControls({
      position: 'topleft',
      drawCircleMarker: false,
      cutPolygon: false,
      rotateMode: false,
      drawText: true,
    })
    map.pm.setGlobalOptions({ continueDrawing: false })

    const onCreate = (e: { layer: L.Layer }) => {
      const layer = e.layer as AnyLayer
      layer[DRAWING_FLAG] = true
      if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) bindLength(layer)
      layer.on('pm:edit pm:dragend pm:textchange pm:markerdragend', persist)
      persist()
    }
    const onRemove = () => persist()
    map.on('pm:create', onCreate)
    map.on('pm:remove', onRemove)

    history.current = []
    setHistoryLen(0)
    loadFromStore(useDrawingsStore.getState().byKey[storageKey] ?? [])
    for (const layer of drawingLayers()) layer.on('pm:edit pm:dragend pm:textchange pm:markerdragend', persist)

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:remove', onRemove)
      map.pm.removeControls()
      for (const layer of drawingLayers()) layer.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, storageKey])

  useEffect(() => {
    map.pm.setPathOptions({ color, weight, fillColor: color, fillOpacity: 0.15 })
    map.pm.setGlobalOptions({ templineStyle: { color }, hintlineStyle: { color, dashArray: '4 4' } })
  }, [map, color, weight])

  const undo = () => {
    const prev = history.current.pop()
    if (!prev) return
    setHistoryLen(history.current.length)
    setDrawings(storageKey, prev)
    loadFromStore(prev)
  }

  const clear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    setConfirmClear(false)
    history.current.push(useDrawingsStore.getState().byKey[storageKey] ?? [])
    setHistoryLen(history.current.length)
    setDrawings(storageKey, [])
    loadFromStore([])
  }

  if (!container) return null
  return createPortal(
    <div className="absolute left-14 top-2.5 z-[1000] flex items-center gap-1 rounded border border-line bg-surface-2/95 px-1.5 py-1 shadow-lg" onDoubleClick={(e) => e.stopPropagation()}>
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setColor(c)}
          aria-label={`Colour ${c}`}
          aria-pressed={color === c}
          className={`h-5 w-5 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
      <select value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-label="Line width" className="ml-1 rounded border border-line bg-surface px-1 py-0.5 text-[11px] text-ink">
        {[2, 3, 4, 6, 8].map((w) => (
          <option key={w} value={w}>{w}px</option>
        ))}
      </select>
      <button type="button" onClick={undo} disabled={historyLen === 0} title="Undo" className="rounded p-1 text-ink-muted hover:text-ink disabled:opacity-30">
        <Undo2 className="h-4 w-4" />
      </button>
      <button type="button" onClick={clear} title="Clear this map's drawings" className={`rounded p-1 ${confirmClear ? 'text-danger' : 'text-ink-muted hover:text-ink'}`}>
        <Trash2 className="h-4 w-4" />
      </button>
      {confirmClear && <span className="text-[11px] text-danger">Click again to clear</span>}
    </div>,
    container,
  )
}
