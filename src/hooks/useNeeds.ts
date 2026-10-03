import { useMemo } from 'react'
import { useCrafts, useGameData, useHideout, useItems } from '../api/hooks'
import { computeNeeds, type ItemNeed } from '../lib/needs'
import { useInventoryStore, useModeInventory } from '../store/inventory'
import { useProfile } from '../store/progress'

/** Item needs for the active mode, plus the queries they depend on. */
export function useNeeds() {
  const gameData = useGameData()
  const hideout = useHideout()
  const crafts = useCrafts()
  const items = useItems()
  const profile = useProfile()
  const inventory = useModeInventory()
  const favoriteCraftIds = useInventoryStore((s) => s.favoriteCraftIds)

  const needs = useMemo<Map<string, ItemNeed>>(() => {
    if (!gameData.data) return new Map()
    return computeNeeds({
      tasks: gameData.data.tasks,
      completedTaskIds: profile.completedTaskIds,
      faction: profile.faction,
      stations: hideout.data ?? [],
      stationLevels: inventory.stationLevels,
      crafts: crafts.data ?? [],
      favoriteCraftIds,
      items: items.data?.items,
    })
  }, [gameData.data, profile.completedTaskIds, profile.faction, hideout.data, inventory.stationLevels, crafts.data, favoriteCraftIds, items.data])

  return { needs, gameData, hideout, crafts, items, inventory, loading: gameData.isPending || items.isPending }
}
