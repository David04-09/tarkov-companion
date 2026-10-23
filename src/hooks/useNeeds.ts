import { useMemo } from 'react'
import { useGameData, useHideout, useItems } from '../api/hooks'
import { computeNeeds, type ItemNeed } from '../lib/needs'
import { useModeInventory } from '../store/inventory'
import { useProfile } from '../store/progress'

/** Item needs for the active mode (quests and hideout), plus the queries they depend on. */
export function useNeeds() {
  const gameData = useGameData()
  const hideout = useHideout()
  const items = useItems()
  const profile = useProfile()
  const inventory = useModeInventory()

  const needs = useMemo<Map<string, ItemNeed>>(() => {
    if (!gameData.data) return new Map()
    return computeNeeds({
      tasks: gameData.data.tasks,
      completedTaskIds: profile.completedTaskIds,
      faction: profile.faction,
      stations: hideout.data ?? [],
      stationLevels: inventory.stationLevels,
      // The Crafts tab is gone (2.5.0), so favourite crafts no longer count.
      crafts: [],
      favoriteCraftIds: [],
      items: items.data?.items,
    })
  }, [gameData.data, profile.completedTaskIds, profile.faction, hideout.data, inventory.stationLevels, items.data])

  return { needs, gameData, hideout, items, inventory, loading: gameData.isPending || items.isPending }
}
