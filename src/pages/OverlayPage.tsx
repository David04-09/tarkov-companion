import { useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { ItemLookup } from '../components/ItemLookup'
import { TimersCard } from '../desktop/TimersCard'
import { updateDesktopSettings, useDesktopStore } from '../desktop/useDesktop'
import { MapViewer } from '../maps/MapViewer'
import { Legend } from '../maps/overlay/Legend'
import { TaskLayer } from '../maps/overlay/TaskLayer'
import { layerHasFloorHeights } from '../maps/overlay/floors'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { resolveBaseLayer } from '../maps/mapConfig'
import { useMapOptions } from '../maps/useMapOptions'
import { isFactionEligible } from '../lib/taskStatus'
import { useDrawingsStore } from '../store/drawings'
import { useInventoryStore } from '../store/inventory'
import { useLookupStore } from '../store/lookup'
import { taskColor, useMapOverlayStore } from '../store/mapOverlay'
import { useProfile, useProgressStore } from '../store/progress'
import { useUiStore } from '../store/ui'

const STORES = [useProgressStore, useUiStore, useMapOverlayStore, useInventoryStore, useDrawingsStore] as const

/**
 * Compact always-on-top window: current map with checked quests, timers and
 * the item lookup. Shares localStorage with the main window and re-reads it
 * whenever the main window writes, so both stay in step.
 */
export function OverlayPage() {
  const options = useMapOptions()
  const gameData = useGameData()
  const profile = useProfile()
  const lastMapKey = useUiStore((s) => s.lastMapKey)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const baseLayerByMap = useUiStore((s) => s.baseLayerByMap)
  const floorByMap = useUiStore((s) => s.floorByMap)
  const checkedTaskIds = useMapOverlayStore((s) => s.checkedTaskIds)
  const colorIndexByTask = useMapOverlayStore((s) => s.colorIndexByTask)
  const settings = useDesktopStore((s) => s.settings)
  const setLookupOpen = useLookupStore((s) => s.setOpen)

  // Cross-window sync: another window changed a persisted store.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      for (const store of STORES) {
        const persistApi = (store as unknown as { persist?: { getOptions: () => { name?: string }; rehydrate: () => void } }).persist
        if (persistApi && e.key === persistApi.getOptions().name) persistApi.rehydrate()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const selected = options.find((o) => o.key === lastMapKey) ?? options[0]
  const cfg = selected?.cfg
  const layer = cfg ? resolveBaseLayer(cfg, baseLayerByMap[selected.key]) : null
  const mapId = selected?.id ?? null

  const mapTasks = useMemo<MapTask[]>(() => {
    if (!gameData.data || !mapId || !layer) return []
    return buildMapTasks(gameData.data, mapId, layer).filter((m) => isFactionEligible(m.task, profile.faction))
  }, [gameData.data, mapId, layer, profile.faction])
  const shown = useMemo(() => {
    const byId = new Map(mapTasks.map((m) => [m.task.id, m]))
    return checkedTaskIds.map((id) => byId.get(id)).filter((m): m is MapTask => Boolean(m)).map((mapTask) => ({ mapTask, color: taskColor(colorIndexByTask[mapTask.task.id]) }))
  }, [checkedTaskIds, colorIndexByTask, mapTasks])

  if (!selected || !cfg || !layer) return <div className="h-full bg-surface" />
  const activeFloor = floorByMap[selected.key] ?? null
  const opacity = settings?.overlayOpacity ?? 0.9

  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <ItemLookup />
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-2 py-1 text-xs" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="font-semibold">Overlay</span>
        <select
          value={selected.key}
          onChange={(e) => setLastMapKey(e.target.value)}
          aria-label="Map"
          className="rounded border border-line bg-surface px-1.5 py-0.5 text-xs"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>{o.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => setLookupOpen(true)} title="Item lookup (Ctrl+K)" className="rounded border border-line px-1.5 py-0.5 hover:border-accent" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Search className="h-3.5 w-3.5" />
        </button>
        <label className="ml-auto flex items-center gap-1 text-ink-muted" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          Opacity
          <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={(e) => void updateDesktopSettings({ overlayOpacity: Number(e.target.value) })} aria-label="Overlay opacity" className="w-20" />
        </label>
        <button type="button" onClick={() => void window.desktop?.closeOverlay()} aria-label="Hide overlay" className="text-ink-dim hover:text-ink" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-line bg-surface-2 px-2 py-1">
        <TimersCard compact />
      </div>
      <div className="min-h-0 flex-1">
        <MapViewer mapKey={selected.key} layer={layer} floorName={activeFloor}>
          {shown.map(({ mapTask, color }) => (
            <TaskLayer key={mapTask.task.id} mapTask={mapTask} color={color} activeFloor={activeFloor} hasFloors={layerHasFloorHeights(layer)} canvas={false} />
          ))}
          <Legend entries={shown} />
        </MapViewer>
      </div>
      <p className="border-t border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-dim">Drag the top bar to move · resize from the edges · {settings?.overlayHotkey ?? 'Ctrl+Shift+T'} toggles</p>
    </div>
  )
}
