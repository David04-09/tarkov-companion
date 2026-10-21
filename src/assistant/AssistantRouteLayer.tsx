import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet'
import { useAssistantRouteStore } from '../store/assistantRoute'

/** Route already zoomed to, so coming back to the Maps tab keeps the user's own view. */
let fittedAt = 0

/** The assistant's walking route on the Maps tab (orange line with start and end), until cleared. */
export function AssistantRouteLayer({ mapKey }: { mapKey: string }) {
  const route = useAssistantRouteStore()
  const latlngs = useMemo(() => route.path.map((p) => [p.z, p.x] as [number, number]), [route.path])
  const map = useMap()
  const show = route.mapKey === mapKey && latlngs.length >= 2
  useEffect(() => {
    if (!show || fittedAt === route.at) return
    fittedAt = route.at
    map.fitBounds(L.latLngBounds(latlngs).pad(0.25), { animate: false })
  }, [show, route.at, latlngs, map])
  if (route.mapKey !== mapKey || latlngs.length < 2) return null
  const end = latlngs[latlngs.length - 1]
  return (
    <>
      <Polyline positions={latlngs} pathOptions={{ color: '#0b0b0b', weight: 8, opacity: 0.55, interactive: false }} />
      <Polyline positions={latlngs} pathOptions={{ color: '#f59e0b', weight: 5, opacity: 1 }}>
        <Tooltip sticky>Assistant route: {route.fromLabel} → {route.toLabel}</Tooltip>
      </Polyline>
      <CircleMarker center={latlngs[0]} radius={8} pathOptions={{ color: '#0b0b0b', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>{route.fromLabel}</Tooltip>
      </CircleMarker>
      <CircleMarker center={end} radius={8} pathOptions={{ color: '#0b0b0b', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }}>
        <Tooltip direction="top" offset={[0, -8]} permanent>{route.toLabel}</Tooltip>
      </CircleMarker>
    </>
  )
}
