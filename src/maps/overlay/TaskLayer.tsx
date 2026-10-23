import { Fragment, memo, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Popup, Tooltip } from 'react-leaflet'
import type { Position } from '../../api/types'
import { ObjectivePopup } from './ObjectivePopup'
import type { MapTask } from './mapTasks'
import { objectiveIcon } from './objectiveIcons'
import { useMapOverlayStore } from '../../store/mapOverlay'
import { useProgressStore } from '../../store/progress'

const toLatLngs = (outline: Position[]) => outline.map((p) => L.latLng(p.z, p.x))

/** The tick drawn above a spot that was double-clicked as done. */
const DONE_ICON = L.divIcon({ className: 'tc-done-badge', html: '<span>✓</span>', iconSize: [18, 18], iconAnchor: [9, 32] })
/** How faint a done spot is drawn. */
const DONE_OPACITY = 0.4

interface TaskLayerProps {
  mapTask: MapTask
  color: string
  /** Active floor name (null = ground). */
  activeFloor: string | null
  /** Whether this imagery has floor heights (enables dimming). */
  hasFloors: boolean
  /** Render as lightweight canvas circles instead of DOM icons. */
  canvas: boolean
}

/**
 * All markers and zones for one task. Memoised: the props only change when the
 * task's colour, the floor, or the render mode changes, so checking another
 * task does not re-render this one.
 */
export const TaskLayer = memo(function TaskLayer({ mapTask, color, activeFloor, hasFloors, canvas }: TaskLayerProps) {
  // Spots ticked off by double-clicking them (per PvP/PvE); double-click again to undo.
  const mode = useProgressStore((s) => s.gameMode)
  const doneList = useMapOverlayStore((s) => s.doneSpots[mode])
  const toggleDone = useMapOverlayStore((s) => s.toggleDoneSpot)
  const done = useMemo(() => new Set(doneList ?? []), [doneList])
  return (
    <>
      {mapTask.objectives.map((mo) =>
        mo.placements.map((p) => {
          const dim = hasFloors && p.floor !== activeFloor
          const latlng = L.latLng(p.position.z, p.position.x)
          const spot = `${mo.objective.id}:${p.id}`
          const isDone = done.has(spot)
          // Double-click ticks the spot off (or back on); the map does not zoom.
          const onDouble = {
            dblclick: (e: L.LeafletMouseEvent) => {
              L.DomEvent.stop(e)
              toggleDone(mode, spot)
            },
          }
          const fade = isDone ? DONE_OPACITY : 1
          const hint = isDone ? ' · done (double-click to undo)' : ' · double-click when done'
          const popup = (
            <Popup maxWidth={320}>
              <ObjectivePopup task={mapTask.task} mo={mo} placement={p} color={color} hasFloors={hasFloors} />
            </Popup>
          )
          return (
            <Fragment key={p.id}>
              {p.outline && (
                <Polygon
                  positions={toLatLngs(p.outline)}
                  pathOptions={{
                    color,
                    weight: 1.5,
                    opacity: (dim ? 0.25 : 0.9) * fade,
                    fillColor: color,
                    fillOpacity: (dim ? 0.05 : 0.2) * fade,
                  }}
                  bubblingMouseEvents={false}
                  eventHandlers={onDouble}
                >
                  {popup}
                  <Tooltip sticky>{mapTask.task.name}</Tooltip>
                </Polygon>
              )}
              {canvas ? (
                <CircleMarker
                  center={latlng}
                  radius={6}
                  pathOptions={{
                    color: '#ffffff',
                    weight: 1.5,
                    opacity: (dim ? 0.3 : 1) * fade,
                    fillColor: color,
                    fillOpacity: (dim ? 0.3 : 0.95) * fade,
                  }}
                  bubblingMouseEvents={false}
                  eventHandlers={onDouble}
                >
                  {popup}
                  <Tooltip direction="top" offset={[0, -6]}>
                    {mapTask.task.name}
                    {p.total > 1 ? ` (${p.index + 1}/${p.total})` : ''}
                    {hint}
                  </Tooltip>
                </CircleMarker>
              ) : (
                <Marker
                  position={latlng}
                  icon={objectiveIcon(mo.objective.type, color, p.total > 1 ? p.index + 1 : 0, dim)}
                  zIndexOffset={dim ? -500 : 0}
                  opacity={fade}
                  eventHandlers={onDouble}
                >
                  {popup}
                  <Tooltip direction="top" offset={[0, -12]}>
                    {mapTask.task.name}
                    {p.total > 1 ? ` (${p.index + 1}/${p.total})` : ''}
                    {hint}
                  </Tooltip>
                </Marker>
              )}
              {isDone && <Marker position={latlng} icon={DONE_ICON} interactive={false} zIndexOffset={600} />}
            </Fragment>
          )
        }),
      )}
    </>
  )
})
