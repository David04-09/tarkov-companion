import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, useMap } from 'react-leaflet'
import { AlertTriangle, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { type MapConfig, type MapLayerConfig, layerIsDrawable } from './mapConfig'
import { createMapCRS, gameBoundsToLatLngBounds } from './projection'
import type { MapStyle } from '../store/ui'

/** Extra zoom beyond the native tiles, like tarkov.dev (max(7, maxZoom)). */
const OVERZOOM = 7

type ImageryState = 'loading' | 'ready' | 'error'

/**
 * Loads a tarkov.dev map SVG once and returns a detached <svg> element whose
 * top-level <g id> groups are classified as base (ground) or overlay (floors).
 */
async function loadSvg(cfg: MapConfig, signal: AbortSignal): Promise<SVGSVGElement> {
  const res = await fetch(cfg.svgPath as string, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const inner = doc.documentElement
  if (inner.nodeName.toLowerCase() !== 'svg') throw new Error('Not an SVG document')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const viewBox = inner.getAttribute('viewBox')
  if (viewBox) svg.setAttribute('viewBox', viewBox)
  // Move children across; top-level groups with ids are floors.
  while (inner.firstChild) svg.appendChild(inner.firstChild)
  for (const child of Array.from(svg.children)) {
    if (child.nodeName.toLowerCase() !== 'g' || !child.id) continue
    const g = child as SVGGElement
    const keepWith = g.dataset['keepWithGroup']
    if (g.id === cfg.svgLayer || keepWith === cfg.svgLayer) g.classList.add('tc-base-group')
    else g.classList.add('tc-overlay-group')
  }
  return svg
}

interface ImageryProps {
  cfg: MapConfig
  style: MapStyle
  floor: MapLayerConfig | null
  onState: (state: ImageryState, message?: string) => void
}

/**
 * Imperative Leaflet layer management (tiles, SVG, floors). Lives inside
 * MapContainer so it can use the map instance. Everything is keyed on the map
 * config, so switching maps remounts the whole MapContainer (CRS can't change).
 */
function Imagery({ cfg, style, floor, onState }: ImageryProps) {
  const map = useMap()
  const tileRef = useRef<L.TileLayer | null>(null)
  const svgOverlayRef = useRef<L.SVGOverlay | null>(null)
  const svgElRef = useRef<SVGSVGElement | null>(null)
  const floorTileRef = useRef<L.TileLayer | null>(null)
  const [svgReady, setSvgReady] = useState(false)

  const bounds = useMemo(() => gameBoundsToLatLngBounds(cfg.bounds), [cfg])
  const svgBounds = useMemo(
    () => (cfg.svgBounds ? gameBoundsToLatLngBounds(cfg.svgBounds) : bounds),
    [cfg, bounds],
  )
  const useTiles = Boolean(cfg.tilePath) && (style === 'tile' || !cfg.svgPath)

  // Base imagery + SVG document (SVG is loaded whenever it exists, because
  // floors for tile maps are drawn from it).
  useEffect(() => {
    const controller = new AbortController()
    let tileErrors = 0
    let tileLoads = 0
    let settled = false
    const settle = (state: ImageryState, message?: string) => {
      if (settled) return
      settled = true
      onState(state, message)
    }
    onState('loading')

    if (cfg.tilePath) {
      const tile = L.tileLayer(cfg.tilePath, {
        tileSize: cfg.tileSize ?? 256,
        bounds,
        minZoom: cfg.minZoom,
        maxZoom: Math.max(OVERZOOM, cfg.maxZoom),
        maxNativeZoom: cfg.maxZoom,
        noWrap: true,
        className: 'tc-base-tiles',
      })
      tile.on('tileload', () => {
        tileLoads += 1
        settle('ready')
      })
      tile.on('tileerror', () => {
        tileErrors += 1
        // All of the first wave failed: the imagery host is unreachable.
        if (tileLoads === 0 && tileErrors >= 4) settle('error', 'The map tiles could not be downloaded from assets.tarkov.dev.')
      })
      tileRef.current = tile
    }

    if (cfg.svgPath) {
      loadSvg(cfg, controller.signal)
        .then((svg) => {
          svgElRef.current = svg
          const overlay = L.svgOverlay(svg, svgBounds, { className: 'tc-svg-overlay', interactive: false })
          svgOverlayRef.current = overlay
          overlay.addTo(map)
          setSvgReady(true)
          if (!cfg.tilePath) settle('ready')
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return
          if (!cfg.tilePath) settle('error', `The map image could not be downloaded (${err instanceof Error ? err.message : 'error'}).`)
        })
    }

    map.fitBounds(bounds, { animate: false })

    return () => {
      controller.abort()
      tileRef.current?.remove()
      tileRef.current = null
      svgOverlayRef.current?.remove()
      svgOverlayRef.current = null
      svgElRef.current = null
      setSvgReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, map])

  // Choose which base is visible (tiles vs abstract SVG).
  useEffect(() => {
    const tile = tileRef.current
    if (tile) {
      if (useTiles && !map.hasLayer(tile)) tile.addTo(map)
      if (!useTiles && map.hasLayer(tile)) tile.remove()
    }
    const svg = svgElRef.current
    if (svg) {
      svg.classList.toggle('tc-hide-base', useTiles)
    }
    if (useTiles) tile?.bringToBack()
  }, [useTiles, map, svgReady])

  // Floor switching.
  useEffect(() => {
    floorTileRef.current?.remove()
    floorTileRef.current = null
    const svg = svgElRef.current
    const tile = tileRef.current

    if (svg) {
      for (const g of Array.from(svg.querySelectorAll<SVGGElement>(':scope > g.tc-overlay-group'))) {
        g.classList.toggle('tc-visible', Boolean(floor?.svgLayer) && g.id === floor?.svgLayer)
      }
      svg.classList.toggle('tc-off-level', Boolean(floor))
    }
    if (tile) tile.setOpacity(floor ? 0.25 : 1)

    if (floor?.tilePath) {
      const layer = L.tileLayer(floor.tilePath, {
        tileSize: cfg.tileSize ?? 256,
        bounds,
        minZoom: cfg.minZoom,
        maxZoom: Math.max(OVERZOOM, cfg.maxZoom),
        maxNativeZoom: cfg.maxZoom,
        noWrap: true,
        className: 'tc-floor-tiles',
      })
      layer.addTo(map)
      floorTileRef.current = layer
    }
  }, [floor, cfg, bounds, map, svgReady])

  return null
}

function FullscreenButton({ target }: { target: React.RefObject<HTMLDivElement | null> }) {
  const map = useMap()
  const [active, setActive] = useState(false)
  useEffect(() => {
    const onChange = () => {
      setActive(document.fullscreenElement === target.current)
      // Let the container settle, then tell Leaflet the size changed.
      setTimeout(() => map.invalidateSize(), 50)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [map, target])

  const toggle = () => {
    const el = target.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else void el.requestFullscreen().catch(() => undefined)
  }

  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control leaflet-bar">
        <a
          href="#fullscreen"
          role="button"
          title={active ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={active ? 'Exit fullscreen' : 'Fullscreen'}
          onClick={(e) => {
            e.preventDefault()
            toggle()
          }}
          className="!flex !h-[30px] !w-[30px] items-center justify-center"
        >
          {active ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </a>
      </div>
    </div>
  )
}

export interface MapViewerProps {
  cfg: MapConfig
  style: MapStyle
  /** Layer name of the active floor; null = ground. */
  floorName: string | null
  children?: ReactNode
}

export function MapViewer({ cfg, style, floorName, children }: MapViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<ImageryState>('loading')
  const [message, setMessage] = useState<string | undefined>()
  const crs = useMemo(() => createMapCRS(cfg), [cfg])
  const bounds = useMemo(() => gameBoundsToLatLngBounds(cfg.bounds), [cfg])
  const floor = useMemo(
    () => cfg.layers.find((l) => l.name === floorName && layerIsDrawable(l, cfg)) ?? null,
    [cfg, floorName],
  )

  return (
    <div ref={containerRef} className="relative h-full w-full bg-[#0a0a09]">
      <MapContainer
        key={cfg.key}
        crs={crs}
        bounds={bounds}
        minZoom={cfg.minZoom}
        maxZoom={Math.max(OVERZOOM, cfg.maxZoom)}
        zoomSnap={0.25}
        zoomDelta={0.5}
        wheelPxPerZoomLevel={80}
        attributionControl={false}
        className="h-full w-full !bg-[#0a0a09]"
      >
        <Imagery
          cfg={cfg}
          style={style}
          floor={floor}
          onState={(s, m) => {
            setState(s)
            setMessage(m)
          }}
        />
        <FullscreenButton target={containerRef} />
        {children}
      </MapContainer>

      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-[1000] flex justify-center">
          <span className="inline-flex items-center gap-2 rounded border border-line bg-surface-2/90 px-3 py-1.5 text-xs text-ink-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> Loading map imagery…
          </span>
        </div>
      )}
      {state === 'error' && (
        <div className="absolute inset-x-0 top-3 z-[1000] flex justify-center px-4">
          <div role="alert" className="flex items-start gap-2 rounded border border-danger/50 bg-surface-2/95 px-3 py-2 text-xs text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              {message ?? 'The map image is unavailable.'} Markers and drawings still work; try again later.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
