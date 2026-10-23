import { useMemo } from 'react'
import { useGameData } from '../api/hooks'
import type { MapOption } from '../maps/useMapOptions'
import { useMapOverlayStore } from '../store/mapOverlay'

/** How many of the ticked quests have something on this map. */
export function useTickedOnMap(option: MapOption | null): number {
  const gameData = useGameData()
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  return useMemo(() => {
    if (!option?.id || !gameData.data) return 0
    const set = new Set(checked)
    return gameData.data.tasks.filter((t) => set.has(t.id) && (t.map?.id === option.id || t.objectives.some((o) => o.maps.some((m) => m.id === option.id)))).length
  }, [option, gameData.data, checked])
}
