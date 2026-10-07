import { memo, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Position } from '../../api/types'
import type { LootGroup } from './lootGroups'

interface Point {
  group: LootGroup
  position: Position
  /** Stable key for React (index in the full list). */
  id: number
}

interface Cluster {
  key: string
  lat: number
  lng: number
  count: number
  color: string
  label: string
}

const CELL_PX = 56
/** One style object per colour, so react-leaflet does not restyle every dot on each render. */
const dotStyles = new Map<string, L.PathOptions>()
function dotStyle(color: string): L.PathOptions {
  let st = dotStyles.get(color)
  if (!st) dotStyles.set(color, (st = { color: '#111', weight: 0.75, fillColor: color, fillOpacity: 0.95 }))
  return st
}
const clusterIconCache = new Map<string, L.DivIcon>()
function clusterIcon(count: number, color: string): L.DivIcon {
  const key = `${count}|${color}`
  let icon = clusterIconCache.get(key)
  if (!icon) {
    const size = count >= 100 ? 34 : count >= 20 ? 30 : 26
    icon = L.divIcon({
      html: `<div class="tc-cluster" style="--c:${color};width:${size}px;height:${size}px">${count}</div>`,
      className: 'tc-divicon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
    clusterIconCache.set(key, icon)
  }
  return icon
}

/**
 * Loot containers as coloured dots, clustered into grid cells while zoomed
 * out. Clusters are recomputed on zoom (not on every pan: cells are in map
 * pixel space so panning never changes membership).
 */
export const LootLayer = memo(function LootLayer({ groups, clusterBelowZoom }: { groups: LootGroup[]; clusterBelowZoom: number }) {
  const map = useMap()
  // Whole zoom levels only: the map zooms in quarter steps, and re-clustering (and re-drawing
  // every dot) on each step made wheel zooming stutter on dense maps.
  const [zoom, setZoom] = useState(() => Math.floor(map.getZoom()))
  useMapEvents({ zoomend: () => setZoom(Math.floor(map.getZoom())) })

  const points = useMemo<Point[]>(() => {
    let id = 0
    return groups.flatMap((g) => g.positions.map((position) => ({ group: g, position, id: id++ })))
  }, [groups])

  const { clusters, singles } = useMemo(() => {
    if (zoom >= clusterBelowZoom) return { clusters: [] as Cluster[], singles: points }
    const cells = new Map<string, { pts: Point[]; sumX: number; sumZ: number }>()
    for (const p of points) {
      const px = map.project(L.latLng(p.position.z, p.position.x), zoom)
      const key = `${Math.floor(px.x / CELL_PX)}:${Math.floor(px.y / CELL_PX)}`
      let cell = cells.get(key)
      if (!cell) cells.set(key, (cell = { pts: [], sumX: 0, sumZ: 0 }))
      cell.pts.push(p)
      cell.sumX += p.position.x
      cell.sumZ += p.position.z
    }
    const clusters: Cluster[] = []
    const singles: Point[] = []
    for (const [key, cell] of cells) {
      if (cell.pts.length === 1) {
        singles.push(cell.pts[0])
        continue
      }
      const counts = new Map<LootGroup, number>()
      for (const p of cell.pts) counts.set(p.group, (counts.get(p.group) ?? 0) + 1)
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      clusters.push({
        key,
        lat: cell.sumZ / cell.pts.length,
        lng: cell.sumX / cell.pts.length,
        count: cell.pts.length,
        color: dominant.color,
        label: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([g, n]) => `${g.name} ×${n}`)
          .join(', '),
      })
    }
    return { clusters, singles }
  }, [points, zoom, clusterBelowZoom, map])

  return (
    <>
      {clusters.map((c) => (
        <Marker
          key={c.key}
          position={[c.lat, c.lng]}
          icon={clusterIcon(c.count, c.color)}
          zIndexOffset={-400}
          eventHandlers={{ click: () => map.setView([c.lat, c.lng], Math.min(map.getMaxZoom(), map.getZoom() + 2)) }}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {c.label}
          </Tooltip>
        </Marker>
      ))}
      {singles.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.position.z, p.position.x]}
          radius={3.5}
          pathOptions={dotStyle(p.group.color)}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            {p.group.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
})

/** Top-right legend (under the fullscreen button) for the loot groups currently shown. */
export function LootLegend({ groups }: { groups: LootGroup[] }) {
  if (groups.length === 0) return null
  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control !mr-2 !mt-14 max-h-[34vh] max-w-[220px] overflow-y-auto rounded border border-line bg-surface-2/95 px-2.5 py-2 text-xs shadow-lg">
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
              <span className="min-w-0 flex-1 truncate text-ink">{g.name}</span>
              <span className="text-ink-dim">{g.positions.length}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
