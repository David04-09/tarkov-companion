import { useEffect, useMemo } from 'react'
import { Info, Layers } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { MapViewer } from '../maps/MapViewer'
import {
  MAP_CONFIGS,
  findMapConfig,
  layerIsDrawable,
  mapOrderIndex,
  type MapConfig,
} from '../maps/mapConfig'
import { useUiStore } from '../store/ui'

interface MapOption {
  /** API normalizedName (also used as the "remember last map" key). */
  key: string
  name: string
  cfg: MapConfig
}

const titleCase = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export function MapsPage() {
  const gameData = useGameData()
  const lastMapKey = useUiStore((s) => s.lastMapKey)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const styleByMap = useUiStore((s) => s.styleByMap)
  const setMapStyle = useUiStore((s) => s.setMapStyle)
  const floorByMap = useUiStore((s) => s.floorByMap)
  const setFloor = useUiStore((s) => s.setFloor)

  // Every map the API knows that we have imagery for. Falls back to the
  // vendored config alone while the API is loading or unavailable.
  const options = useMemo<MapOption[]>(() => {
    const list: MapOption[] = gameData.data
      ? gameData.data.maps
          .map((m) => ({ key: m.normalizedName, name: m.name, cfg: findMapConfig(m.normalizedName) }))
          .filter((o): o is MapOption => Boolean(o.cfg))
      : MAP_CONFIGS.map((cfg) => ({ key: cfg.normalizedName, name: titleCase(cfg.normalizedName), cfg }))
    return list.sort((a, b) => mapOrderIndex(a.key) - mapOrderIndex(b.key) || a.name.localeCompare(b.name))
  }, [gameData.data])

  const selected = options.find((o) => o.key === lastMapKey) ?? options[0]

  useEffect(() => {
    if (selected && selected.key !== lastMapKey) setLastMapKey(selected.key)
  }, [selected, lastMapKey, setLastMapKey])

  if (!selected) return null
  const cfg = selected.cfg
  const floors = cfg.layers.filter((l) => layerIsDrawable(l, cfg))
  const storedFloor = floorByMap[selected.key]
  // Default to the layer the config marks as shown (Interchange opens on floor 2).
  const activeFloor =
    storedFloor === undefined ? (floors.find((l) => l.show)?.name ?? null) : storedFloor
  const hasBothStyles = Boolean(cfg.tilePath && cfg.svgPath)
  // Explicit user choice for this map, else the config's preference (set where
  // the satellite tiles are known to be outdated), else satellite.
  const mapStyle = styleByMap[selected.key] ?? cfg.preferredStyle ?? 'tile'

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
            <FloorButton label="Ground" active={activeFloor === null} onClick={() => setFloor(selected.key, null)} />
            {floors.map((l) => (
              <FloorButton
                key={l.name}
                label={l.name}
                active={activeFloor === l.name}
                onClick={() => setFloor(selected.key, l.name)}
              />
            ))}
          </div>
        )}

        {hasBothStyles && (
          <div className="ml-auto flex rounded border border-line bg-surface p-0.5" role="group" aria-label="Map style">
            <FloorButton label="Satellite" active={mapStyle === 'tile'} onClick={() => setMapStyle(selected.key, 'tile')} />
            <FloorButton label="Abstract" active={mapStyle === 'svg'} onClick={() => setMapStyle(selected.key, 'svg')} />
          </div>
        )}
      </div>

      {cfg.imageryNote && (
        <p
          role="note"
          className="flex items-center gap-2 border-b border-line bg-surface-3 px-3 py-1 text-[11px] text-ink-muted md:px-4"
        >
          <Info className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          {cfg.imageryNote}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <MapViewer cfg={cfg} style={mapStyle} floorName={activeFloor} />
      </div>

      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-ink-dim md:px-4">
        <span>
          Map imagery and coordinates from{' '}
          <a href="https://tarkov.dev/maps" target="_blank" rel="noreferrer" className="text-ink-muted underline hover:text-accent">
            tarkov.dev
          </a>{' '}
          (open source, MIT).
        </span>
        {cfg.author && (
          <span>
            {selected.name} map by{' '}
            {cfg.authorLink ? (
              <a href={cfg.authorLink} target="_blank" rel="noreferrer" className="text-ink-muted underline hover:text-accent">
                {cfg.author}
              </a>
            ) : (
              cfg.author
            )}
            .
          </span>
        )}
        <span className="ml-auto">Scroll to zoom · drag to pan</span>
      </footer>
    </div>
  )
}

function FloorButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
