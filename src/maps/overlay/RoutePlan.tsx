import { useMemo } from 'react'
import L from 'leaflet'
import { Marker, Polyline, Tooltip } from 'react-leaflet'
import { useRoutePlanStore } from '../../store/routePlan'

const iconCache = new Map<number, L.DivIcon>()
function numberIcon(n: number): L.DivIcon {
  let icon = iconCache.get(n)
  if (!icon) {
    icon = L.divIcon({
      html: `<div class="tc-route-pin">${n}</div>`,
      className: 'tc-divicon',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      tooltipAnchor: [0, -13],
    })
    iconCache.set(n, icon)
  }
  return icon
}

/** Numbered, draggable route markers joined by a polyline (session scratch pad). */
export function RoutePlanLayer({ mapKey }: { mapKey: string }) {
  const planMap = useRoutePlanStore((s) => s.mapKey)
  const points = useRoutePlanStore((s) => s.points)
  const movePoint = useRoutePlanStore((s) => s.movePoint)
  const latlngs = useMemo(() => points.map((p) => L.latLng(p.z, p.x)), [points])
  if (planMap !== mapKey || points.length === 0) return null
  return (
    <>
      <Polyline positions={latlngs} pathOptions={{ color: '#ffd166', weight: 4, opacity: 0.9, dashArray: '8 6' }} />
      {points.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.z, p.x]}
          icon={numberIcon(i + 1)}
          draggable
          zIndexOffset={1000}
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng()
              movePoint(p.id, ll.lng, ll.lat)
            },
          }}
        >
          <Tooltip direction="top">{`${i + 1}. ${p.label}`}</Tooltip>
        </Marker>
      ))}
    </>
  )
}
