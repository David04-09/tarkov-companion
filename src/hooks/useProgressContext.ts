import { useMemo } from 'react'
import { useGameData, useItems } from '../api/hooks'
import { buildProgressContext, type ProgressContext } from '../lib/progression'
import { isFactionEligible } from '../lib/taskStatus'
import { useModeInventory } from '../store/inventory'
import { usePrefs } from '../store/prefs'
import { useProfile } from '../store/progress'

/**
 * The one picture of your progress every page uses: quests done (ticked or by deduction), the
 * player level (set, or reached by quest XP), reputation and loyalty level per trader. The items
 * document (for the level table) is used only when it is already loaded; this never downloads it.
 */
export function useProgressContext(): ProgressContext | null {
  const data = useGameData().data
  const levelTable = useItems(false).data?.playerLevels ?? null
  const profile = useProfile()
  const inventory = useModeInventory()
  const startingReputation = usePrefs((p) => p.startingReputation)
  return useMemo(
    () =>
      data
        ? buildProgressContext(
            data.tasks.filter((t) => isFactionEligible(t, profile.faction)),
            data.traders,
            profile,
            { startingReputation, manualTraderLevels: inventory.traderLevels, levelTable },
          )
        : null,
    [data, profile, inventory.traderLevels, startingReputation, levelTable],
  )
}
