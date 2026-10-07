// Kept apart from scanStore (loaded at start-up) so the scanner's learning code stays in the
// scanner's own chunk.
import { useInventoryStore } from '../store/inventory'
import { useLearnedStore } from './learned'
import { useScanStore } from './scanStore'
/** Puts Item Collection back to how it was before the last Apply and forgets what that Apply taught the scanner. */
export async function undoLastApply(): Promise<boolean> {
  const last = useScanStore.getState().lastApply
  if (!last) return false
  const inv = useInventoryStore.getState()
  for (const [id, count] of Object.entries(last.previous)) inv.setCollected(last.mode, id, count)
  const learned = useLearnedStore.getState()
  for (const id of last.learnedIds) await learned.remove(id).catch(() => undefined)
  useScanStore.getState().setLastApply(null)
  return true
}
