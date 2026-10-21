import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet'
import type { Position } from '../api/types'
import { MapViewer } from '../maps/MapViewer'
import { findMapConfig, resolveBaseLayer, type BaseLayerConfig } from '../maps/mapConfig'
import { floorForPosition } from '../maps/overlay/floors'
import { useUiStore } from '../store/ui'
import type { MapCard, MapPoint } from './engine'

const STYLE: Record<MapPoint['kind'], L.CircleMarkerOptions> = {
  you: { color: '#0b0b0b', weight: 2, fillColor: '#38bdf8', fillOpacity: 1, radius: 8 },
  quest: { color: '#0b0b0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 1, radius: 8 },
  place: { color: '#0b0b0b', weight: 2, fillColor: '#a78bfa', fillOpacity: 1, radius: 8 },
  extract: { color: '#0b0b0b', weight: 1.5, fillColor: '#22c55e', fillOpacity: 0.95, radius: 6 },
  loot: { color: '#0b0b0b', weight: 1.5, fillColor: '#facc15', fillOpacity: 0.95, radius: 6 },
}

function Fit({ points, layer }: { points: Position[]; layer: BaseLayerConfig }) {
  const map = useMap()
  useEffect(() => {
    const pts = points.map((p) => L.latLng(p.z, p.x))
    if (pts.length === 1) map.setView(pts[0], Math.min(map.getMaxZoom(), layer.maxZoom - 1), { animate: false })
    else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.35), { animate: false, maxZoom: layer.maxZoom - 0.5 })
  }, [map, points, layer])
  return null
}

/** The small map under the chat: the spots of an answer and a straight line between them. */
export function AssistantMap({ card }: { card: MapCard }) {
  const cfg = findMapConfig(card.map.normalizedName)
  const preferred = useUiStore((s) => (cfg ? s.baseLayerByMap[cfg.key] : undefined))
  const points = useMemo(() => [...card.points.map((p) => p.position), ...(card.path ?? [])], [card])
  if (!cfg) return <p className="text-xs text-ink-dim">No map picture for {card.map.name}.</p>
  const layer = resolveBaseLayer(cfg, preferred)
  const floor = floorForPosition(layer, card.points[0].position)
  const few = card.points.length <= 4
  return (
    <div className="h-72 overflow-hidden rounded border border-line">
      <MapViewer mapKey={`assistant:${cfg.key}:${card.points.map((p) => p.id).join(',')}`} layer={layer} floorName={floor}>
        <Fit points={points} layer={layer} />
        {card.path ? (
          <>
            <Polyline positions={card.path.map((p) => [p.z, p.x] as [number, number])} pathOptions={{ color: '#0b0b0b', weight: 7, opacity: 0.6 }} />
            <Polyline positions={card.path.map((p) => [p.z, p.x] as [number, number])} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 1 }} />
          </>
        ) : (
          card.route && <Polyline positions={card.route.map((p) => [p.z, p.x] as [number, number])} pathOptions={{ color: '#f59e0b', weight: 4, dashArray: '8 8', opacity: 0.95 }} />
        )}
        {card.points.map((p) => (
          <CircleMarker key={p.id} center={[p.position.z, p.position.x]} radius={STYLE[p.kind].radius ?? 7} pathOptions={STYLE[p.kind]}>
            <Tooltip direction="top" offset={[0, -8]} permanent={few}>
              {p.label}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapViewer>
    </div>
  )
}

