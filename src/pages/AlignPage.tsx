import { Fragment, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Polyline, Tooltip, useMapEvents } from 'react-leaflet'
import { Check, Copy, Crosshair, Trash2, X } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { MapViewer } from '../maps/MapViewer'
import { resolveBaseLayer } from '../maps/mapConfig'
import {
  describeAffine,
  fitAffine,
  gameToMapPoint,
  mapPointToGame,
  roundAffine,
  type Affine,
  type AffineFit,
} from '../maps/projection'
import { alignLayerKey, useAlignStore, type AlignPair } from '../store/align'
import { useUiStore } from '../store/ui'
import { SegmentButton } from '../components/SegmentButton'
import { useMapOptions } from '../maps/useMapOptions'

/**
 * Dev-only alignment tool (/dev/align). Pick a reference point whose in-game
 * position is known (extracts, transits, quest objectives), click where it
 * sits on the image, repeat 3+ times, and the tool fits a least-squares affine
 * (rotation, flips, non-uniform scale and shear all allowed). "Copy transform"
 * gives JSON to paste into the layer's `affine` in src/maps/mapConfig.ts.
 */

type RefGroup = 'Extracts' | 'Transits' | 'Objectives'

interface RefPoint {
  id: string
  label: string
  group: RefGroup
  x: number
  z: number
}

const MAX_POINTS_PER_OBJECTIVE = 6

function AlignLayer({
  pairs,
  refs,
  affine,
  selectedRefId,
  showAllRefs,
  onPlace,
  onSelectRef,
}: {
  pairs: AlignPair[]
  refs: RefPoint[]
  affine: Affine
  selectedRefId: string | null
  showAllRefs: boolean
  onPlace: (px: number, py: number) => void
  onSelectRef: (id: string) => void
}) {
  useMapEvents({
    click(e) {
      const p = gameToMapPoint({ x: e.latlng.lng, z: e.latlng.lat }, { affine })
      onPlace(p.px, p.py)
    },
  })
  const placed = new Set(pairs.map((p) => p.refId))
  return (
    <>
      {showAllRefs &&
        refs
          .filter((r) => !placed.has(r.id))
          .map((r) => (
            <CircleMarker
              key={r.id}
              center={L.latLng(r.z, r.x)}
              radius={r.id === selectedRefId ? 7 : 4}
              pathOptions={{
                color: r.id === selectedRefId ? '#ffd166' : '#9a9385',
                fillColor: r.id === selectedRefId ? '#ffd166' : '#9a9385',
                fillOpacity: 0.8,
                weight: 1,
              }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  onSelectRef(r.id)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                {r.label}
              </Tooltip>
            </CircleMarker>
          ))}
      {pairs.map((p) => {
        const img = mapPointToGame({ px: p.px, py: p.py }, { affine })
        const imgLL = L.latLng(img.z, img.x)
        const refLL = L.latLng(p.z, p.x)
        const selected = p.refId === selectedRefId
        return (
          <Fragment key={p.id}>
            <Polyline positions={[imgLL, refLL]} pathOptions={{ color: '#c0634f', weight: 1.5, dashArray: '4 3' }} />
            <CircleMarker
              center={refLL}
              radius={5}
              pathOptions={{ color: '#c0634f', fillColor: '#c0634f', fillOpacity: 0.9, weight: 1 }}
            >
              <Tooltip direction="right" offset={[6, 0]}>
                {p.label} · where the current transform puts it
              </Tooltip>
            </CircleMarker>
            <CircleMarker
              center={imgLL}
              radius={selected ? 8 : 6}
              pathOptions={{ color: '#6b9bc7', fillColor: '#6b9bc7', fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e)
                  onSelectRef(p.refId)
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {p.label} · your click
              </Tooltip>
            </CircleMarker>
          </Fragment>
        )
      })}
    </>
  )
}

export function AlignPage() {
  const options = useMapOptions()
  const gameData = useGameData()
  const lastMapKey = useUiStore((s) => s.lastMapKey)
  const setLastMapKey = useUiStore((s) => s.setLastMapKey)
  const baseLayerByMap = useUiStore((s) => s.baseLayerByMap)
  const setBaseLayer = useUiStore((s) => s.setBaseLayer)
  const pairsByLayer = useAlignStore((s) => s.pairsByLayer)
  const upsertPair = useAlignStore((s) => s.upsertPair)
  const removePair = useAlignStore((s) => s.removePair)
  const clearPairs = useAlignStore((s) => s.clearPairs)

  const [selectedRefId, setSelectedRefId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [useFit, setUseFit] = useState(false)
  const [showAllRefs, setShowAllRefs] = useState(true)
  const [copied, setCopied] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const selected = options.find((o) => o.key === lastMapKey) ?? options[0]
  const cfg = selected?.cfg
  const layer = cfg ? resolveBaseLayer(cfg, baseLayerByMap[selected.key]) : null
  const layerKey = selected && layer ? alignLayerKey(selected.key, layer.id) : ''
  const pairs = useMemo(() => pairsByLayer[layerKey] ?? [], [pairsByLayer, layerKey])
  const selectedMapId = selected?.id ?? null

  const refs = useMemo<RefPoint[]>(() => {
    if (!gameData.data || !selectedMapId) return []
    const out: RefPoint[] = []
    const details = gameData.data.mapDetails[selectedMapId]
    for (const e of details?.extracts ?? []) {
      out.push({ id: `extract:${e.id}`, label: `${e.name} (${e.faction})`, group: 'Extracts', x: e.position.x, z: e.position.z })
    }
    for (const t of details?.transits ?? []) {
      out.push({ id: `transit:${t.id}`, label: t.name, group: 'Transits', x: t.position.x, z: t.position.z })
    }
    for (const task of gameData.data.tasks) {
      for (const o of task.objectives) {
        let n = 0
        for (const loc of o.locations) {
          if (loc.mapId !== selectedMapId) continue
          for (let i = 0; i < loc.positions.length && n < MAX_POINTS_PER_OBJECTIVE; i++, n++) {
            const p = loc.positions[i]
            out.push({
              id: `obj:${o.id}:${loc.zoneId ?? 'p'}:${i}`,
              label: `${task.name}: ${o.description}${loc.positions.length > 1 ? ` #${i + 1}` : ''}`,
              group: 'Objectives',
              x: p.x,
              z: p.z,
            })
          }
        }
      }
    }
    return out
  }, [gameData.data, selectedMapId])

  const fit = useMemo<{ ok: AffineFit } | { error: string } | null>(() => {
    if (pairs.length < 3) return null
    try {
      return { ok: fitAffine(pairs) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Fit failed' }
    }
  }, [pairs])
  const fitted = fit && 'ok' in fit ? fit.ok : null
  const activeAffine: Affine = useFit && fitted && layer ? fitted.affine : (layer?.affine ?? [1, 0, 0, 0, 1, 0])

  if (!selected || !cfg || !layer) return null

  const needle = search.trim().toLowerCase()
  const visibleRefs = needle ? refs.filter((r) => r.label.toLowerCase().includes(needle)) : refs
  const placedIds = new Set(pairs.map((p) => p.refId))
  const selectedRef = refs.find((r) => r.id === selectedRefId) ?? null

  const handlePlace = (px: number, py: number) => {
    if (!selectedRef) return
    upsertPair(layerKey, {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      refId: selectedRef.id,
      label: selectedRef.label,
      x: selectedRef.x,
      z: selectedRef.z,
      px,
      py,
    })
  }

  const transformJson = JSON.stringify({ affine: roundAffine(fitted?.affine ?? layer.affine) })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transformJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const current = describeAffine(activeAffine)
  const groups: RefGroup[] = ['Extracts', 'Transits', 'Objectives']

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 md:px-4">
        <h1 className="mr-2 text-lg font-semibold">
          Alignment tool <span className="text-xs font-normal text-ink-dim">dev only</span>
        </h1>
        <select
          value={selected.key}
          onChange={(e) => {
            setLastMapKey(e.target.value)
            setSelectedRefId(null)
          }}
          aria-label="Select map"
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          value={layer.id}
          onChange={(e) => setBaseLayer(selected.key, e.target.value)}
          aria-label="Map image"
          className="rounded border border-line bg-surface px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
        >
          {cfg.baseLayers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <div className="flex rounded border border-line bg-surface p-0.5" role="group" aria-label="Transform in use">
          <SegmentButton label="Current transform" active={!useFit} onClick={() => setUseFit(false)} />
          <SegmentButton
            label={fitted ? `Fitted (${pairs.length} pts)` : 'Fitted (need 3+)'}
            active={useFit}
            onClick={() => fitted && setUseFit(true)}
          />
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={showAllRefs} onChange={(e) => setShowAllRefs(e.target.checked)} />
          Show all reference points
        </label>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1">
          <MapViewer
            mapKey={selected.key}
            layer={layer}
            floorName={null}
            affineOverride={useFit && fitted ? fitted.affine : undefined}
          >
            <AlignLayer
              pairs={pairs}
              refs={refs}
              affine={activeAffine}
              selectedRefId={selectedRefId}
              showAllRefs={showAllRefs}
              onPlace={handlePlace}
              onSelectRef={setSelectedRefId}
            />
          </MapViewer>
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2 text-sm">
          <section className="border-b border-line p-3">
            <p className="text-xs text-ink-muted">
              1. Pick a reference point below (or click a grey dot). 2. Click where it really is on the image. Blue =
              your click, red = where the transform puts it. Repeat for 3+ well-spread points.
            </p>
            {selectedRef ? (
              <p className="mt-2 flex items-center gap-2 rounded border border-accent/50 bg-accent/10 px-2 py-1 text-xs">
                <Crosshair className="h-3.5 w-3.5 text-accent" />
                <span className="truncate">Placing: {selectedRef.label}</span>
                <button type="button" onClick={() => setSelectedRefId(null)} className="ml-auto text-ink-dim hover:text-ink" aria-label="Cancel">
                  <X className="h-3.5 w-3.5" />
                </button>
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-dim">No reference point selected.</p>
            )}
          </section>

          <section className="border-b border-line p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Transform</h2>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-ink-muted">Scale</dt>
              <dd>
                {current.scaleX.toFixed(4)} px/m (x) · {current.scaleZ.toFixed(4)} px/m (z)
              </dd>
              <dt className="text-ink-muted">Rotation</dt>
              <dd>
                {current.rotationDeg.toFixed(2)}° · shear {current.shearDeg.toFixed(2)}°
              </dd>
              {fitted && (
                <>
                  <dt className="text-ink-muted">Fit RMS</dt>
                  <dd>
                    {fitted.rmsMeters.toFixed(1)} m ({fitted.rmsPx.toFixed(2)} px)
                  </dd>
                </>
              )}
              {fit && 'error' in fit && (
                <>
                  <dt className="text-danger">Fit</dt>
                  <dd className="text-danger">{fit.error}</dd>
                </>
              )}
            </dl>
            <textarea
              readOnly
              value={transformJson}
              rows={2}
              aria-label="Transform JSON"
              className="mt-2 w-full rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void copy()} className="btn">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy transform'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true)
                    return
                  }
                  clearPairs(layerKey)
                  setConfirmClear(false)
                }}
                onBlur={() => setConfirmClear(false)}
                disabled={pairs.length === 0}
                className={`btn ${confirmClear ? 'border-danger text-danger' : ''}`}
              >
                <Trash2 className="h-4 w-4" /> {confirmClear ? 'Click again to clear' : 'Clear pairs'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-dim">
              {fitted ? 'JSON shows the fitted transform.' : 'JSON shows the current transform (fit needs 3+ pairs).'} Paste
              into the layer's affine in src/maps/mapConfig.ts.
            </p>
          </section>

          <section className="border-b border-line p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Pairs ({pairs.length})
            </h2>
            {pairs.length === 0 ? (
              <p className="mt-1 text-xs text-ink-dim">None yet.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {pairs.map((p, i) => {
                  const r = fitted?.residuals[i]
                  const bad = r && r.meters > 2 * fitted!.rmsMeters && r.meters > 10
                  return (
                    <li key={p.id} className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedRefId(p.refId)}
                        className={`min-w-0 flex-1 truncate text-left hover:text-accent ${p.refId === selectedRefId ? 'text-accent' : ''}`}
                        title="Select to re-place"
                      >
                        {p.label}
                      </button>
                      {r && (
                        <span className={`shrink-0 tabular-nums ${bad ? 'text-danger' : 'text-ink-muted'}`} title="Residual">
                          {r.meters.toFixed(1)} m
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePair(layerKey, p.id)}
                        className="shrink-0 text-ink-dim hover:text-danger"
                        aria-label={`Remove ${p.label}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Reference points</h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              aria-label="Search reference points"
              className="mt-1 w-full rounded border border-line bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
            {gameData.isPending && <p className="mt-2 text-xs text-ink-dim">Loading game data…</p>}
            {gameData.isError && <p className="mt-2 text-xs text-danger">Game data unavailable.</p>}
            {groups.map((g) => {
              const items = visibleRefs.filter((r) => r.group === g)
              if (items.length === 0) return null
              return (
                <div key={g} className="mt-2">
                  <h3 className="text-[11px] font-semibold text-ink-dim">
                    {g} ({items.length})
                  </h3>
                  <ul className="mt-0.5 max-h-64 space-y-px overflow-y-auto">
                    {items.map((r) => {
                      const isSel = r.id === selectedRefId
                      const isPlaced = placedIds.has(r.id)
                      return (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedRefId(isSel ? null : r.id)}
                            className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-xs hover:bg-surface-3 ${
                              isSel ? 'bg-accent/15 text-accent' : isPlaced ? 'text-ink-muted' : ''
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate">{r.label}</span>
                            {isPlaced && <Check className="h-3 w-3 shrink-0 text-success" aria-label="Placed" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </section>
        </aside>
      </div>
    </div>
  )
}
