/**
 * Turns a tarkov.dev map drawing into a walking grid for the assistant's routes. The drawings
 * have named layers (Ground, Roads, River, Fence, Rocks, Limit, Mines, Buildings, …); each kind
 * is drawn once into a small off-screen canvas and read back as a mask:
 * - blocked: water, fences, rocks/mountains, minefields, sniper zones, map edge, walls, buildings
 *   (the data has no doors, so routes go around buildings and stop at the nearest outside spot);
 * - cheap: roads, paths, pavement, railways;
 * - normal: other ground.
 * Built only when a route is asked for, once per map per session (a few hundred ms), then kept.
 */
import type { Position } from '../../api/types'
import type { BaseLayerConfig, MapConfig } from '../../maps/mapConfig'
import { gameToMapPoint, mapPointToGame } from '../../maps/projection'
import { svgText } from '../../maps/svgCache'
import type { Cell, WalkGrid } from './astar'

const LINE_BLOCK = /^(fence|fences|fence_ext|fences_int|limit|map_limit|map_border|border|wall(-\w+)?)$/i
const AREA_BLOCK = /^(water|river|lakes|rocks|mountains|mines|minefield|unacessible|sniper|obstacles(-\w+)?|ledge)$/i
const BUILDING = /^(buildings|building|structure|terminal|bunkers|garage|plane)$/i
const ROAD = /^(dirt_roads|dirty_roads|dirt_road|roads?|main_roads|high_roads|normal_roads|highways|roads_unpaved|roads_small|roads_medium|small|pavement|cement|tarmac|path|gravel|concrete|docks|pier|railway|railroad|train_tracks)$/i
const GROUND = /^(ground|base_terrain|terrains|land|islands|green|dirt|forest|trees|outdoors|pavement_over_rocks|floor)$/i

/** Costs per cell (A* uses the smallest as its unit). */
const COST = { road: 10, ground: 13 }
/** Longest grid side in cells (Woods at 2 m per cell is about 700 cells). */
const MAX_SIDE = 800
/** Cells never smaller than this, in metres. */
const MIN_CELL_M = 1.5

export interface TerrainGrid extends WalkGrid {
  metresPerCell: number
  toCell: (p: Position) => Cell
  toGame: (c: Cell) => Position
}

/** The layer whose drawing is the map's ground level. */
function drawingLayer(cfg: MapConfig): BaseLayerConfig | undefined {
  return cfg.baseLayers.find((l) => l.kind === 'svg' && l.svgPath && l.svgLayer) ?? cfg.baseLayers.find((l) => l.svgPath && l.svgLayer)
}

/** One kind of layer drawn solid black on transparent; returns the alpha channel. */
async function mask(doc: Document, groundId: string, keep: (id: string) => boolean, line: boolean, W: number, H: number, strokeUnits: number): Promise<Uint8ClampedArray | null> {
  const svg = doc.documentElement.cloneNode(true) as unknown as SVGSVGElement
  let any = false
  for (const top of Array.from(svg.children)) {
    if (top.nodeName.toLowerCase() !== 'g') continue
    if (top.id !== groundId) {
      top.setAttribute('style', 'display:none')
      continue
    }
    for (const g of Array.from(top.children)) {
      const kept = Boolean(g.id) && keep(g.id)
      if (kept) any = true
      else g.setAttribute('style', 'display:none')
    }
  }
  if (!any) return null
  const style = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = line
    ? `* { fill: none !important; stroke: #000 !important; stroke-width: ${strokeUnits} !important; opacity: 1 !important }`
    : `* { fill: #000 !important; stroke: #000 !important; stroke-width: ${strokeUnits / 3} !important; opacity: 1 !important }`
  svg.appendChild(style)
  svg.setAttribute('width', String(W))
  svg.setAttribute('height', String(H))
  svg.setAttribute('preserveAspectRatio', 'none')
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, W, H)
    const rgba = ctx.getImageData(0, 0, W, H).data
    const alpha = new Uint8ClampedArray(W * H)
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]
    return alpha
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function build(cfg: MapConfig): Promise<TerrainGrid | null> {
  const layer = drawingLayer(cfg)
  if (!layer?.svgPath || !layer.svgLayer) return null
  const doc = new DOMParser().parseFromString(await svgText(layer.svgPath), 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg') return null
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || !(vb[2] > 0 && vb[3] > 0)) return null

  // Where the drawing sits: Leaflet stretches it over the projected north-west/south-east corners of its bounds.
  const [[x0, z0], [x1, z1]] = layer.svgBounds ?? layer.bounds
  const projection = { affine: layer.affine }
  const nw = gameToMapPoint({ x: Math.min(x0, x1), z: Math.max(z0, z1) }, projection)
  const se = gameToMapPoint({ x: Math.max(x0, x1), z: Math.min(z0, z1) }, projection)
  const left = Math.min(nw.px, se.px)
  const top = Math.min(nw.py, se.py)
  const pw = Math.abs(se.px - nw.px)
  const ph = Math.abs(se.py - nw.py)
  const gameAt = (u: number, v: number) => mapPointToGame({ px: left + u * pw, py: top + v * ph }, projection)
  const widthM = Math.hypot(gameAt(1, 0).x - gameAt(0, 0).x, gameAt(1, 0).z - gameAt(0, 0).z)
  const heightM = Math.hypot(gameAt(0, 1).x - gameAt(0, 0).x, gameAt(0, 1).z - gameAt(0, 0).z)
  const cellM = Math.max(MIN_CELL_M, Math.max(widthM, heightM) / MAX_SIDE)
  const W = Math.max(8, Math.round(widthM / cellM))
  const H = Math.max(8, Math.round(heightM / cellM))
  const strokeUnits = vb[2] / W

  const id = layer.svgLayer
  const [lines, areas, buildings, roads, ground] = await Promise.all([
    mask(doc, id, (g) => LINE_BLOCK.test(g), true, W, H, strokeUnits),
    mask(doc, id, (g) => AREA_BLOCK.test(g), false, W, H, strokeUnits),
    mask(doc, id, (g) => BUILDING.test(g), false, W, H, strokeUnits),
    mask(doc, id, (g) => ROAD.test(g), false, W, H, strokeUnits),
    mask(doc, id, (g) => GROUND.test(g), false, W, H, strokeUnits),
  ])

  const cost = new Uint8Array(W * H)
  const on = (m: Uint8ClampedArray | null, i: number) => Boolean(m && m[i] > 96)
  // Fences are about one cell wide: a low cut-off keeps them unbroken (A* never steps diagonally
  // between two fence cells), without closing the gates in them.
  const onLine = (i: number) => Boolean(lines && lines[i] > 40)
  for (let i = 0; i < cost.length; i++) {
    const inside = ground || roads ? on(ground, i) || on(roads, i) : true
    if (!inside || onLine(i) || on(areas, i) || on(buildings, i)) continue
    cost[i] = on(roads, i) ? COST.road : COST.ground
  }

  return {
    width: W,
    height: H,
    cost,
    metresPerCell: cellM,
    toCell: (p) => {
      const m = gameToMapPoint({ x: p.x, z: p.z }, projection)
      return [Math.min(W - 1, Math.max(0, Math.floor(((m.px - left) / pw) * W))), Math.min(H - 1, Math.max(0, Math.floor(((m.py - top) / ph) * H)))]
    },
    toGame: ([cx, cy]) => {
      const g = gameAt((cx + 0.5) / W, (cy + 0.5) / H)
      return { x: g.x, y: 0, z: g.z }
    },
  }
}

const grids = new Map<string, Promise<TerrainGrid | null>>()

/** The walking grid of a map, built on first use and kept for the session; null when the map has no drawing. */
export function terrainGrid(cfg: MapConfig): Promise<TerrainGrid | null> {
  let p = grids.get(cfg.key)
  if (!p) {
    p = build(cfg).catch(() => null)
    grids.set(cfg.key, p)
  }
  return p
}
