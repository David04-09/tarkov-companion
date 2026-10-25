import { useMemo } from 'react'
import { useItems } from '../api/hooks'
import type { TaskObjective } from '../api/types'
import { factsLookup, shootFacts, staleText } from '../lib/objectiveFacts'

/**
 * "What counts" for a kill objective, written from the conditions the game checks, plus a warning
 * when the quest text in the data is older than those (Hunting Trip). Uses item names only when the
 * items list is already loaded (it never fetches it). Renders spans, so it fits inside text rows.
 */
export function ObjectiveFacts({ objective, className, warnClassName }: { objective: TaskObjective; className: string; warnClassName: string }) {
  const items = useItems(false).data
  const look = useMemo(() => factsLookup(items?.items, items?.categoryNames), [items])
  const facts = shootFacts(objective, look)
  if (!facts) return null
  const stale = staleText(objective)
  return (
    <>
      {stale && <span className={warnClassName}>{stale}</span>}
      <span className={className} title="Written from the conditions the game checks">
        What counts: {facts}
      </span>
    </>
  )
}
