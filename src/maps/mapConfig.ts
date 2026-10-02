/**
 * Typed access to src/data/mapConfig.json.
 *
 * Source of the image URLs, bounds, transforms and floor layers:
 *   https://github.com/the-hideout/tarkov-dev  (src/data/maps.json, MIT)
 * The JSON file records the exact commit it was copied from. Imagery is served
 * from assets.tarkov.dev; per-map authors are credited in `author`/`authorLink`.
 *
 * The tarkov.dev JSON API's /maps document has no image or transform data at
 * all (only `coordinateToCardinalRotation`), so the repo config is the only
 * source for a working image + coordinate system.
 */

import raw from '../data/mapConfig.json'
import type { MapProjection } from './projection'

export type GameBounds = [[number, number], [number, number]]

export interface MapLayerConfig {
  /** Display name, e.g. "2nd Floor". */
  name: string
  /** Id of the <g> group inside the map SVG that draws this floor. */
  svgLayer?: string
  /** Tile pyramid for this floor, when it exists as raster imagery. */
  tilePath?: string
  /** Shown by default (e.g. Interchange opens on the 2nd floor). */
  show: boolean
  /** Height ranges (game y) that belong to this floor; used to auto-pick floors for markers. */
  extents?: { height: [number, number] }[]
}

export interface MapConfig extends MapProjection {
  /** tarkov.dev key, e.g. "customs". */
  key: string
  /** tarkov.dev page slug; matches the API map's normalizedName for primary maps. */
  normalizedName: string
  minZoom: number
  maxZoom: number
  bounds: GameBounds
  author?: string
  authorLink?: string
  /** Abstract vector map (one SVG with floors as top-level <g id> groups). */
  svgPath?: string
  /** Id of the ground-floor group inside the SVG. */
  svgLayer?: string
  /** Bounds for the SVG when they differ from the tile bounds (Reserve). */
  svgBounds?: GameBounds
  /** Satellite-style raster tiles: ".../{z}/{x}/{y}.png". */
  tilePath?: string
  tileSize?: number
  /** Game-y range considered "ground level". */
  heightRange?: [number, number]
  /** API normalizedNames that reuse this config (night-factory, ground-zero-21, the-lab-dark). */
  altMaps?: string[]
  layers: MapLayerConfig[]
  /**
   * Tarkov Companion addition: which imagery to show by default when both
   * exist. Set to "svg" where the satellite tiles are known to be outdated.
   */
  preferredStyle?: 'tile' | 'svg'
  /** Tarkov Companion addition: shown to the user to explain imagery age/limits. */
  imageryNote?: string
}

interface MapConfigFile {
  _source: Record<string, string>
  maps: MapConfig[]
}

const file = raw as unknown as MapConfigFile

export const MAP_CONFIG_SOURCE = file._source
export const MAP_CONFIGS: MapConfig[] = file.maps

/** Display order for the selector; anything else follows alphabetically. */
export const PREFERRED_MAP_ORDER = [
  'customs',
  'woods',
  'shoreline',
  'interchange',
  'reserve',
  'factory',
  'lighthouse',
  'streets-of-tarkov',
  'ground-zero',
  'the-lab',
  'terminal',
  'the-labyrinth',
  'icebreaker',
]

/** Finds the config for an API map by normalizedName, including alt variants. */
export function findMapConfig(normalizedName: string): MapConfig | undefined {
  return (
    MAP_CONFIGS.find((m) => m.normalizedName === normalizedName) ??
    MAP_CONFIGS.find((m) => m.altMaps?.includes(normalizedName))
  )
}

export function mapOrderIndex(normalizedName: string): number {
  // Variants sort right after their primary map.
  const cfg = findMapConfig(normalizedName)
  const primary = cfg?.normalizedName ?? normalizedName
  const i = PREFERRED_MAP_ORDER.indexOf(primary)
  const base = i === -1 ? 1000 : i * 10
  return primary === normalizedName ? base : base + 1
}

/** True when a layer's tile/SVG imagery is available to draw. */
export function layerIsDrawable(layer: MapLayerConfig, cfg: MapConfig): boolean {
  return Boolean(layer.tilePath || (layer.svgLayer && cfg.svgPath))
}
