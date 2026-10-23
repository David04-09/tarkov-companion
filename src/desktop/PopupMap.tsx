import { useEffect, useMemo } from 'react'
import type { GameMap } from '../api/types'
import { AssistantMap } from '../assistant/AssistantMap'
import type { MapCard } from '../assistant/engine'
import type { PopupMap as PopupMapData } from '../shared/desktop-api'

/** The pop-up's mini-map: the answer's spots (and route) on the map picture the Maps tab uses. */
export function PopupMap({ map, onReady }: { map: PopupMapData; onReady: () => void }) {
  const card = useMemo<MapCard>(
    () => ({
      // The map view only needs the map's name and key.
      map: { name: map.mapName, normalizedName: map.mapKey } as GameMap,
      points: map.points.map((p, i) => ({ id: `p${i}`, position: { x: p.x, y: p.y, z: p.z }, label: p.label, kind: p.kind })),
      route: null,
      path: map.path,
      view: map.focus || map.zoomDelta ? { focus: map.focus, zoomDelta: map.zoomDelta } : undefined,
    }),
    [map],
  )
  useEffect(() => onReady(), [onReady, card])
  return (
    <div className="tc-popup-map mt-2">
      <AssistantMap card={card} className="h-52 rounded-lg" />
    </div>
  )
}
