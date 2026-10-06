import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Backpack, ChevronDown, ChevronUp, KeyRound } from 'lucide-react'
import type { ItemsById } from '../../api/types'
import { buildBringList, type BringKind } from './bringList'
import type { MapTask } from './mapTasks'

const KIND_LABEL: Record<BringKind, string> = {
  key: 'Keys',
  plant: 'To plant',
  marker: 'Markers',
  questItem: 'Quest items to place',
  wear: 'Wear',
  weapon: 'Use a weapon',
}

/**
 * Bottom-right box on the map: everything the shown (ticked, not completed) quests on this
 * map need you to bring. Rendered as a Leaflet control so it sits inside the map.
 */
export function BringBox({ mapTasks, items }: { mapTasks: MapTask[]; items: ItemsById | undefined }) {
  const [open, setOpen] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const list = useMemo(() => buildBringList(mapTasks), [mapTasks])
  useEffect(() => {
    // Clicks and scrolling inside the box must not drag or zoom the map.
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  if (mapTasks.length === 0) return null
  const name = (id: string) => items?.[id]?.shortName ?? items?.[id]?.name ?? '…'
  return (
    <div className="leaflet-bottom leaflet-right">
      <div ref={ref} className="leaflet-control !m-2 w-[270px] rounded border border-line bg-surface-2/95 text-xs shadow-lg">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
          <Backpack className="h-4 w-4 shrink-0 text-accent" />
          <span className="flex-1 font-semibold text-ink">Bring for this raid</span>
          <span className="rounded bg-surface-3 px-1.5 tabular-nums text-ink-muted">{list.length}</span>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-ink-dim" /> : <ChevronUp className="h-3.5 w-3.5 text-ink-dim" />}
        </button>
        {open && (
          <div className="max-h-[38vh] overflow-y-auto border-t border-line px-2.5 py-1.5">
            {list.length === 0 ? (
              <p className="py-1 text-ink-muted">Nothing special to bring for the {mapTasks.length} shown quest{mapTasks.length === 1 ? '' : 's'} here.</p>
            ) : (
              <ul className="space-y-1">
                {list.map((e, i) => {
                  const header = i === 0 || e.kind !== list[i - 1].kind ? KIND_LABEL[e.kind] : null
                  const icon = e.itemIds.length ? items?.[e.itemIds[0]]?.iconLink : null
                  const label = e.questItemName ?? (e.kind === 'wear' ? `${e.itemIds.map(name).join(' + ')}${e.otherOutfits ? ` (or ${e.otherOutfits} other outfit${e.otherOutfits > 1 ? 's' : ''})` : ''}` : e.itemIds.length > 1 ? `${name(e.itemIds[0])} or ${e.itemIds.length - 1} other${e.itemIds.length > 2 ? 's' : ''}` : name(e.itemIds[0]))
                  return (
                    <li key={i}>
                      {header && <div className="mb-0.5 mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-dim first:mt-0">{header}</div>}
                      <div className="flex items-center gap-2" title={`${e.itemIds.map(name).join(' / ') || e.questItemName}\nFor: ${e.quests.join(', ')}${e.optional ? '\n(optional objective)' : ''}`}>
                        {icon ? <img src={icon} alt="" className="h-6 w-6 shrink-0 object-contain" /> : e.kind === 'key' ? <KeyRound className="h-4 w-4 shrink-0 text-ink-dim" /> : <span className="h-6 w-6 shrink-0" />}
                        <span className={`min-w-0 flex-1 truncate ${e.optional ? 'text-ink-muted' : 'text-ink'}`}>{label}{e.optional ? ' (optional)' : ''}</span>
                        {e.count > 1 && <span className="tabular-nums text-ink-muted">×{e.count}</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-1.5 text-[10px] text-ink-dim">For the {mapTasks.length} ticked quest{mapTasks.length === 1 ? '' : 's'} on this map. Hover a line to see which quests need it.</p>
          </div>
        )}
      </div>
    </div>
  )
}
