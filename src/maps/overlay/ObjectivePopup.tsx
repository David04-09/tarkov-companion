import { useItems } from '../../api/hooks'
import type { Task } from '../../api/types'
import { formatNumber } from '../../lib/format'
import { KeyBadge } from './KeyBadge'
import type { MapObjective, Placement } from './mapTasks'
import { OBJECTIVE_TYPE_LABEL } from './objectiveIcons'

/** Popup body for a quest marker or zone. */
export function ObjectivePopup({
  task,
  mo,
  placement,
  color,
  hasFloors,
}: {
  task: Task
  mo: MapObjective
  placement: Placement | null
  color: string
  hasFloors: boolean
}) {
  const items = useItems()
  const o = mo.objective
  const firstItem = o.itemIds.length > 0 ? items.data?.items[o.itemIds[0]] : null

  return (
    <div className="min-w-[220px] max-w-[300px] text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="font-semibold text-ink">{task.name}</span>
      </div>
      <div className="mt-0.5 text-ink-muted">
        {task.trader.name} · {OBJECTIVE_TYPE_LABEL[o.type] ?? o.type}
        {o.optional ? ' · optional' : ''}
      </div>
      <p className="mt-1.5 text-ink">{o.description}</p>

      {(o.questItem || o.itemIds.length > 0) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {o.questItem ? (
            <>
              {o.questItem.iconLink && <img src={o.questItem.iconLink} alt="" className="h-5 w-5 object-contain" />}
              <span>{o.questItem.name}</span>
            </>
          ) : (
            <>
              {firstItem?.iconLink && <img src={firstItem.iconLink} alt="" className="h-5 w-5 object-contain" />}
              <span>{firstItem?.name ?? (items.isPending ? 'Loading item…' : 'Item')}</span>
              {o.itemIds.length > 1 && <span className="text-ink-dim">or {o.itemIds.length - 1} other</span>}
            </>
          )}
          {o.count != null && <span className="text-ink-muted">×{formatNumber(o.count)}</span>}
          {o.foundInRaid && (
            <span className="rounded border border-info/60 px-1 text-[10px] font-semibold uppercase text-info">FIR</span>
          )}
        </div>
      )}

      {mo.keyIds.length > 0 && (
        <div className="mt-1.5">
          <KeyBadge keyIds={mo.keyIds} items={items.data?.items} approximate={mo.keySource === 'nearby'} />
        </div>
      )}

      {placement && (
        <div className="mt-1.5 text-ink-dim">
          {placement.total > 1 && (
            <span>
              Spot {placement.index + 1} of {placement.total}
              {hasFloors ? ' · ' : ''}
            </span>
          )}
          {hasFloors && <span>{placement.floor ?? 'Ground level'}</span>}
        </div>
      )}
    </div>
  )
}
