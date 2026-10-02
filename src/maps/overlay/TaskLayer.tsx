import { Fragment, memo } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Popup, Tooltip } from 'react-leaflet'
import type { Position } from '../../api/types'
import { ObjectivePopup } from './ObjectivePopup'
import type { MapTask } from './mapTasks'
import { objectiveIcon } from './objectiveIcons'

const toLatLngs = (outline: Position[]) => outline.map((p) => L.latLng(p.z, p.x))

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
  return (
    <>
      {mapTask.objectives.map((mo) =>
        mo.placements.map((p) => {
          const dim = hasFloors && p.floor !== activeFloor
          const latlng = L.latLng(p.position.z, p.position.x)
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
                    opacity: dim ? 0.25 : 0.9,
                    fillColor: color,
                    fillOpacity: dim ? 0.05 : 0.2,
                  }}
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
                    opacity: dim ? 0.3 : 1,
                    fillColor: color,
                    fillOpacity: dim ? 0.3 : 0.95,
                  }}
                >
                  {popup}
                  <Tooltip direction="top" offset={[0, -6]}>
                    {mapTask.task.name}
                    {p.total > 1 ? ` (${p.index + 1}/${p.total})` : ''}
                  </Tooltip>
                </CircleMarker>
              ) : (
                <Marker
                  position={latlng}
                  icon={objectiveIcon(mo.objective.type, color, p.total > 1 ? p.index + 1 : 0, dim)}
                  zIndexOffset={dim ? -500 : 0}
                  opacity={1}
                >
                  {popup}
                  <Tooltip direction="top" offset={[0, -12]}>
                    {mapTask.task.name}
                    {p.total > 1 ? ` (${p.index + 1}/${p.total})` : ''}
                  </Tooltip>
                </Marker>
              )}
            </Fragment>
          )
        }),
      )}
    </>
  )
})
