import { useEffect } from 'react'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProfile } from '../store/progress'

/**
 * Quests ticked to show on the map are unticked once they are completed (by hand or from
 * the game log), when the "Untick completed quests on the map" setting is on.
 * Runs in the layout, so it works whichever tab is open.
 */
export function AutoUntickCompleted() {
  const enabled = useMapOverlayStore((s) => s.autoUntickCompleted)
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  const completed = useProfile().completedTaskIds
  useEffect(() => {
    if (!enabled) return
    const done = checked.filter((id) => completed.has(id))
    if (done.length) useMapOverlayStore.getState().setTasksChecked(done, false)
  }, [enabled, checked, completed])
  return null
}
