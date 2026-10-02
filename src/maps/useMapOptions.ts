import { useMemo } from 'react'
import { useGameData } from '../api/hooks'
import { MAP_CONFIGS, findMapConfig, mapOrderIndex, type MapConfig } from './mapConfig'

export interface MapOption {
  /** API normalizedName (also used as the "remember last map" key). */
  key: string
  /** API map id (for extracts/objectives lookups); null while the API is unavailable. */
  id: string | null
  name: string
  cfg: MapConfig
}

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

/** Every map the API knows that we have imagery for (config-only fallback while loading). */
export function useMapOptions(): MapOption[] {
  const gameData = useGameData()
  return useMemo<MapOption[]>(() => {
    let list: MapOption[]
    if (gameData.data) {
      list = []
      for (const m of gameData.data.maps) {
        const cfg = findMapConfig(m.normalizedName)
        if (cfg) list.push({ key: m.normalizedName, id: m.id, name: m.name, cfg })
      }
    } else {
      list = MAP_CONFIGS.map((cfg) => ({ key: cfg.normalizedName, id: null, name: titleCase(cfg.normalizedName), cfg }))
    }
    return list.sort((a, b) => mapOrderIndex(a.key) - mapOrderIndex(b.key) || a.name.localeCompare(b.name))
  }, [gameData.data])
}
