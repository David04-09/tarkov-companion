import { useEffect } from 'react'
import { useGameData } from '../api/hooks'
import { isWikiTaskId, wikiRenames } from '../api/wikiQuests'
import { isFactionEligible } from '../lib/taskStatus'
import { useProfile, useProgressStore } from '../store/progress'

const hasWikiMarks = (ids: ReadonlySet<string>) => [...ids].some(isWikiTaskId)

/**
 * A quest ticked while only the wiki knew it ("wiki:Honest Review") keeps its tick once the game
 * data adds it: the mark moves to the real quest id. Loads nothing unless such a mark exists.
 */
export function WikiTickCarryOver() {
  const has = useProgressStore((s) => {
    const p = s.profiles[s.gameMode]
    return hasWikiMarks(p.completedTaskIds) || hasWikiMarks(p.activeTaskIds) || hasWikiMarks(p.failedTaskIds)
  })
  return has ? <CarryOver /> : null
}

function CarryOver() {
  const data = useGameData().data
  const profile = useProfile()
  const mode = useProgressStore((s) => s.gameMode)
  const rename = useProgressStore((s) => s.renameTasksFor)
  useEffect(() => {
    if (!data) return
    const ids = [...profile.completedTaskIds, ...profile.activeTaskIds, ...profile.failedTaskIds]
    const renames = wikiRenames(ids, data.tasks.filter((t) => isFactionEligible(t, profile.faction)))
    if (Object.keys(renames).length) rename(mode, renames)
  }, [data, profile, mode, rename])
  return null
}
