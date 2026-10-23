import { useMemo } from 'react'
import { useGameData, useItems } from '../api/hooks'
import { MapViewer } from '../maps/MapViewer'
import { resolveBaseLayer } from '../maps/mapConfig'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { buildMapTasks } from '../maps/overlay/mapTasks'
import { OtherLayers } from '../maps/overlay/OtherLayers'
import { TaskLayer } from '../maps/overlay/TaskLayer'
import type { MapOption } from '../maps/useMapOptions'
import { isFactionEligible } from '../lib/taskStatus'
import { useModeInventory } from '../store/inventory'
import { taskColor, useMapOverlayStore } from '../store/mapOverlay'
import { useProfile } from '../store/progress'
import { useUiStore } from '../store/ui'

/**
 * The search bar's map: the same picture, extracts and quest markers as the Maps tab (the
 * picture and layers you chose there), with the quests ticked "On map".
 */
export function SearchBarMap({ option }: { option: MapOption }) {
  const gameData = useGameData()
  const items = useItems().data?.items
  const profile = useProfile()
  const inventory = useModeInventory()
  const preferred = useUiStore((s) => s.baseLayerByMap[option.key])
  const storedFloor = useUiStore((s) => s.floorByMap[option.key])
  const toggles = useMapOverlayStore((s) => s.layers)
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  const colors = useMapOverlayStore((s) => s.colorIndexByTask)
  const layer = resolveBaseLayer(option.cfg, preferred)
  const activeFloor = storedFloor ?? null
  const ownedKeyIds = useMemo(() => new Set(inventory.ownedKeyIds), [inventory.ownedKeyIds])

  const shown = useMemo(() => {
    if (!gameData.data || !option.id) return []
    const byId = new Map(buildMapTasks(gameData.data, option.id, layer).filter((m) => isFactionEligible(m.task, profile.faction)).map((m) => [m.task.id, m]))
    return checked.flatMap((id) => {
      const m = byId.get(id)
      return m ? [{ mapTask: m, color: taskColor(colors[id]) }] : []
    })
  }, [gameData.data, option.id, layer, profile.faction, checked, colors])
  const markers = shown.reduce((n, s) => n + s.mapTask.placements.length, 0)

  return (
    <div className="h-72 overflow-hidden rounded-md">
      <MapViewer mapKey={`searchbar:${option.key}:${layer.id}`} layer={layer} floorName={activeFloor}>
        {gameData.data && option.id && <OtherLayers data={gameData.data} mapId={option.id} layer={layer} activeFloor={activeFloor} toggles={toggles} items={items} ownedKeyIds={ownedKeyIds} />}
        {shown.map(({ mapTask, color }) => (
          <TaskLayer key={mapTask.task.id} mapTask={mapTask} color={color} activeFloor={activeFloor} hasFloors={layerHasFloorHeights(layer)} canvas={markers > 200} />
        ))}
      </MapViewer>
    </div>
  )
}
