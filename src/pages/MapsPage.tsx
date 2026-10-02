import { useEffect } from 'react'
import { Image as ImageIcon, Info, Layers } from 'lucide-react'
import { SegmentButton } from '../components/SegmentButton'
import { MapCredits } from '../maps/MapCredits'
import { MapViewer } from '../maps/MapViewer'
import { floorIsDrawable, resolveBaseLayer } from '../maps/mapConfig'
import { useMapOptions } from '../maps/useMapOptions'
import { useUiStore } from '../store/ui'

export function MapsPage() {
  const options = useMapOptions()
  const lastMapKey = useUiStore((s) => s.lastMapKey)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const baseLayerByMap = useUiStore((s) => s.baseLayerByMap)
  const setBaseLayer = useUiStore((s) => s.setBaseLayer)
  const floorByMap = useUiStore((s) => s.floorByMap)
  const setFloor = useUiStore((s) => s.setFloor)

  const selected = options.find((o) => o.key === lastMapKey) ?? options[0]

  useEffect(() => {
    if (selected && selected.key !== lastMapKey) setLastMapKey(selected.key)
  }, [selected, lastMapKey, setLastMapKey])

  if (!selected) return null
  const cfg = selected.cfg
  const layer = resolveBaseLayer(cfg, baseLayerByMap[selected.key])
  const floors = layer.floors.filter((f) => floorIsDrawable(f, layer))
  const storedFloor = floorByMap[selected.key]
  const activeFloor =
    storedFloor === undefined ? (floors.find((f) => f.show)?.name ?? null) : storedFloor

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 md:px-4">
        <h1 className="mr-2 text-lg font-semibold">Maps</h1>

        <select
          value={selected.key}
          onChange={(e) => setLastMapKey(e.target.value)}
          aria-label="Select map"
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>

        {floors.length > 0 && (
          <div className="flex items-center gap-1 rounded border border-line bg-surface p-0.5" role="group" aria-label="Floor">
            <Layers className="ml-1 h-4 w-4 text-ink-dim" aria-hidden />
            <SegmentButton label="Ground" active={activeFloor === null} onClick={() => setFloor(selected.key, null)} />
            {floors.map((f) => (
              <SegmentButton
                key={f.name}
                label={f.name}
                active={activeFloor === f.name}
                onClick={() => setFloor(selected.key, f.name)}
              />
            ))}
          </div>
        )}

        {cfg.baseLayers.length > 1 && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
            <ImageIcon className="h-4 w-4 text-ink-dim" aria-hidden />
            <select
              value={layer.id}
              onChange={(e) => setBaseLayer(selected.key, e.target.value)}
              aria-label="Map image"
              className="rounded border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              {cfg.baseLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {layer.note && (
        <p
          role="note"
          className="flex items-center gap-2 border-b border-line bg-surface-3 px-3 py-1 text-[11px] text-ink-muted md:px-4"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          {layer.note}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <MapViewer mapKey={selected.key} layer={layer} floorName={activeFloor} />
      </div>

      <MapCredits cfg={cfg} mapName={selected.name} activeLayer={layer} />
    </div>
  )
}
