import { useEffect, useMemo } from 'react'
import { Image as ImageIcon, Info, Layers } from 'lucide-react'
import { useGameData, useItems } from '../api/hooks'
import { SegmentButton } from '../components/SegmentButton'
import { MapCredits } from '../maps/MapCredits'
import { MapViewer } from '../maps/MapViewer'
import { floorIsDrawable, resolveBaseLayer } from '../maps/mapConfig'
import { FocusController } from '../maps/overlay/FocusController'
import { Legend } from '../maps/overlay/Legend'
import { OtherLayers } from '../maps/overlay/OtherLayers'
import { QuestPanel } from '../maps/overlay/QuestPanel'
import { TaskLayer } from '../maps/overlay/TaskLayer'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { useMapOptions } from '../maps/useMapOptions'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { taskColor, useMapOverlayStore } from '../store/mapOverlay'
import { useProfile } from '../store/progress'
import { useUiStore } from '../store/ui'

/** Above this many markers on screen, quest markers switch to canvas circles. */
const CANVAS_THRESHOLD = 200

export function MapsPage() {
  const options = useMapOptions()
  const gameData = useGameData()
  // Items are only needed for key names/prices and popup item names; load in the background.
  const itemsQuery = useItems()
  const profile = useProfile()
  const lastMapKey = useUiStore((s) => s.lastMapKey)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const baseLayerByMap = useUiStore((s) => s.baseLayerByMap)
  const setBaseLayer = useUiStore((s) => s.setBaseLayer)
  const floorByMap = useUiStore((s) => s.floorByMap)
  const setFloor = useUiStore((s) => s.setFloor)
  const checkedTaskIds = useMapOverlayStore((s) => s.checkedTaskIds)
  const colorIndexByTask = useMapOverlayStore((s) => s.colorIndexByTask)
  const layerToggles = useMapOverlayStore((s) => s.layers)

  const selected = options.find((o) => o.key === lastMapKey) ?? options[0]

  useEffect(() => {
    if (selected && selected.key !== lastMapKey) setLastMapKey(selected.key)
  }, [selected, lastMapKey, setLastMapKey])

  const cfg = selected?.cfg
  const layer = cfg ? resolveBaseLayer(cfg, baseLayerByMap[selected.key]) : null
  const mapId = selected?.id ?? null

  // Tasks with objectives on this map, positions resolved. Memoised per map/layer/data.
  const mapTasks = useMemo<MapTask[]>(() => {
    if (!gameData.data || !mapId || !layer) return []
    return buildMapTasks(gameData.data, mapId, layer).filter((m) => isFactionEligible(m.task, profile.faction))
  }, [gameData.data, mapId, layer, profile.faction])

  const statuses = useMemo(
    () => computeTaskStatuses(mapTasks.map((m) => m.task), profile),
    [mapTasks, profile],
  )

  const shown = useMemo(() => {
    const byId = new Map(mapTasks.map((m) => [m.task.id, m]))
    return checkedTaskIds
      .map((id) => byId.get(id))
      .filter((m): m is MapTask => Boolean(m))
      .map((mapTask) => ({ mapTask, color: taskColor(colorIndexByTask[mapTask.task.id]) }))
  }, [checkedTaskIds, colorIndexByTask, mapTasks])

  if (!selected || !cfg || !layer) return null
  const floors = layer.floors.filter((f) => floorIsDrawable(f, layer))
  const storedFloor = floorByMap[selected.key]
  const activeFloor = storedFloor === undefined ? (floors.find((f) => f.show)?.name ?? null) : storedFloor
  const hasFloors = layerHasFloorHeights(layer)
  const markerCount = shown.reduce((n, s) => n + s.mapTask.placements.length, 0)
  const canvas = markerCount > CANVAS_THRESHOLD

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 md:px-4">
        <h1 className="mr-2 text-lg font-semibold">Maps</h1>

        <select
          value={selected.key}
          onChange={(e) => setLastMapKey(e.target.value)}
          aria-label="Select map"
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>

        {floors.length > 0 && (
          <div className="flex items-center gap-1 rounded border border-line bg-surface p-0.5" role="group" aria-label="Floor">
            <Layers className="ml-1 h-4 w-4 text-ink-dim" aria-hidden />
            <SegmentButton label="Ground" active={activeFloor === null} onClick={() => setFloor(selected.key, null)} />
            {floors.map((f) => (
              <SegmentButton key={f.name} label={f.name} active={activeFloor === f.name} onClick={() => setFloor(selected.key, f.name)} />
            ))}
          </div>
        )}

        {cfg.baseLayers.length > 1 && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
            <ImageIcon className="h-4 w-4 text-ink-dim" aria-hidden />
            <select
              value={layer.id}
              onChange={(e) => setBaseLayer(selected.key, e.target.value)}
              aria-label="Map image"
              className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              {cfg.baseLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {layer.note && (
        <p role="note" className="flex items-center gap-2 border-b border-line bg-surface-3 px-3 py-1 text-[11px] text-ink-muted md:px-4">
          <Info className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          {layer.note}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 min-w-0 flex-1">
          <MapViewer mapKey={selected.key} layer={layer} floorName={activeFloor}>
            {gameData.data && mapId && (
              <OtherLayers
                data={gameData.data}
                mapId={mapId}
                layer={layer}
                activeFloor={activeFloor}
                toggles={layerToggles}
                items={itemsQuery.data?.items}
              />
            )}
            {shown.map(({ mapTask, color }) => (
              <TaskLayer
                key={mapTask.task.id}
                mapTask={mapTask}
                color={color}
                activeFloor={activeFloor}
                hasFloors={hasFloors}
                canvas={canvas}
              />
            ))}
            <FocusController mapTasks={mapTasks} maxZoom={layer.maxZoom} />
            <Legend entries={shown} />
          </MapViewer>
        </div>

        <QuestPanel
          mapName={selected.name}
          mapTasks={mapTasks}
          statuses={statuses}
          traders={gameData.data?.traders ?? []}
          items={itemsQuery.data?.items}
          hasFloors={hasFloors}
        />
      </div>

      <MapCredits cfg={cfg} mapName={selected.name} activeLayer={layer} />
    </div>
  )
}
