import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { useMapOverlayStore } from '../../store/mapOverlay'
import type { MapTask } from './mapTasks'

/** Pans/zooms to a task's markers when the panel's Focus button is pressed. */
export function FocusController({ mapTasks, maxZoom }: { mapTasks: MapTask[]; maxZoom: number }) {
  const map = useMap()
  const request = useMapOverlayStore((s) => s.focusRequest)

  useEffect(() => {
    if (!request) return
    const mt = mapTasks.find((m) => m.task.id === request.taskId)
    if (!mt || mt.placements.length === 0) return
    const points = mt.placements.flatMap((p) => [
      L.latLng(p.position.z, p.position.x),
      ...(p.outline ?? []).map((o) => L.latLng(o.z, o.x)),
    ])
    const bounds = L.latLngBounds(points)
    if (points.length === 1 || bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setView(points[0], Math.max(map.getZoom(), maxZoom - 1), { animate: true })
    } else {
      map.fitBounds(bounds.pad(0.35), { maxZoom: maxZoom, animate: true })
    }
  }, [request, mapTasks, map, maxZoom])

  return null
}
