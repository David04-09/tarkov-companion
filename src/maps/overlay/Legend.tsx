import type { MapTask } from './mapTasks'

/** Bottom-left legend: colour swatch per checked task on this map. Rendered as a Leaflet control. */
export function Legend({ entries }: { entries: { mapTask: MapTask; color: string }[] }) {
  if (entries.length === 0) return null
  return (
    <div className="leaflet-bottom leaflet-left">
      <div className="leaflet-control !m-2 max-h-[40vh] max-w-[260px] overflow-y-auto rounded border border-line bg-surface-2/95 px-2.5 py-2 text-xs shadow-lg">
        <ul className="space-y-1">
          {entries.map(({ mapTask, color }) => (
            <li key={mapTask.task.id} className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full border border-white/70" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-ink">{mapTask.task.name}</span>
              <span className="shrink-0 text-ink-dim">{mapTask.placements.length || '—'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
