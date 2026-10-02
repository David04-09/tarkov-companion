/**
 * Game-coordinate <-> map-pixel projection.
 *
 * Escape from Tarkov positions are {x, y, z} where y is height. Every map
 * image (a "base layer", see mapConfig.ts) carries a 2-D affine transform that
 * maps the ground plane (x, z) onto image pixels:
 *
 *     px = a*x + b*z + c
 *     py = d*x + e*z + f          affine = [a, b, c, d, e, f]
 *
 * A full affine covers rotation, flips, non-uniform scale and shear, so it can
 * describe tarkov.dev's "transform + coordinateRotation" images as well as
 * third-party renders fitted with the /dev/align tool.
 *
 * Pixel units are "zoom-0 pixels": one tile is 256 units at zoom 0 and the
 * image is 2^zoom times larger at each zoom level.
 *
 * Inside Leaflet we do NOT pre-project points. `createMapCRS()` builds a CRS
 * whose projection step is this affine, so every Leaflet layer works directly
 * in game coordinates as `L.latLng(z, x)` (latitude = z, longitude = x). That
 * keeps markers, zones and drawings in one coordinate space whichever image is
 * underneath; switching base layer just swaps the CRS.
 */

import L from 'leaflet'

export interface GamePosition {
  x: number
  y: number
  z: number
}

export type GamePoint = Pick<GamePosition, 'x' | 'z'>

/** [a, b, c, d, e, f]: px = a*x + b*z + c ; py = d*x + e*z + f */
export type Affine = [number, number, number, number, number, number]

export interface MapProjection {
  affine: Affine
}

export interface MapPoint {
  /** Pixels at zoom 0, from the top-left of the tile pyramid / image. */
  px: number
  py: number
}

/**
 * Converts tarkov.dev's map description (src/data/mapConfig.json) into an
 * affine. tarkov.dev rotates (x, z) by `coordinateRotation` degrees, then
 * applies transform = [scaleX, offsetX, scaleY, offsetY] with the y axis
 * flipped (see getCRS/applyRotation in their src/pages/map/index.jsx).
 */
export function affineFromTarkovDev(
  transform: [number, number, number, number],
  coordinateRotation: number,
): Affine {
  const [sx, ox, sy, oy] = transform
  const r = ((coordinateRotation || 0) * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  // rotated: rx = x*cos - z*sin ; rz = x*sin + z*cos
  // px = sx*rx + ox ; py = -sy*rz + oy
  return [sx * cos, -sx * sin, ox, -sy * sin, -sy * cos, oy]
}

/**
 * THE projection function: in-game (x, y, z) -> map pixel (px, py) at zoom 0.
 * `y` (height) does not affect the 2-D position; floors are handled separately.
 *
 * Verified 2026-10-02 against Customs: the "Every Hunter Knows This" objective
 * zone at the three-story dorms (x 171.76, z 160.04) projects to (127.6, 174.6),
 * which at zoom 3 is tile 3/5 offset (253, 117): the east dorm building.
 */
export function gameToMapPoint(pos: GamePoint, projection: MapProjection): MapPoint {
  const [a, b, c, d, e, f] = projection.affine
  return { px: a * pos.x + b * pos.z + c, py: d * pos.x + e * pos.z + f }
}

export function invertAffine(m: Affine): Affine {
  const [a, b, c, d, e, f] = m
  const det = a * e - b * d
  if (!det) throw new Error('Affine transform is singular')
  const ia = e / det
  const ib = -b / det
  const id = -d / det
  const ie = a / det
  return [ia, ib, -(ia * c + ib * f), id, ie, -(id * c + ie * f)]
}

/** Inverse of gameToMapPoint (height is unknown, so only x and z come back). */
export function mapPointToGame(point: MapPoint, projection: MapProjection): GamePoint {
  const [a, b, c, d, e, f] = invertAffine(projection.affine)
  return { x: a * point.px + b * point.py + c, z: d * point.px + e * point.py + f }
}

/** Leaflet LatLng for a game position: latitude = z, longitude = x. */
export function gameToLatLng(pos: GamePoint): L.LatLng {
  return L.latLng(pos.z, pos.x)
}

export function latLngToGame(latlng: L.LatLng): GamePoint {
  return { x: latlng.lng, z: latlng.lat }
}

export type GameBounds = [[number, number], [number, number]]

/** Config bounds [[x, z], [x, z]] -> Leaflet bounds in game-coordinate LatLngs. */
export function gameBoundsToLatLngBounds(bounds: GameBounds): L.LatLngBounds {
  return L.latLngBounds([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]])
}

/** Game-space bounding box of an image of `width` x `height` zoom-0 pixels. */
export function boundsFromImage(affine: Affine, width: number, height: number): GameBounds {
  const projection = { affine } // mapPointToGame inverts internally
  const corners = [
    mapPointToGame({ px: 0, py: 0 }, projection),
    mapPointToGame({ px: width, py: 0 }, projection),
    mapPointToGame({ px: 0, py: height }, projection),
    mapPointToGame({ px: width, py: height }, projection),
  ]
  const xs = corners.map((c) => c.x)
  const zs = corners.map((c) => c.z)
  return [
    [Math.min(...xs), Math.min(...zs)],
    [Math.max(...xs), Math.max(...zs)],
  ]
}

/**
 * A Leaflet CRS whose "project" step is the affine. Leaflet then does the zoom
 * scaling itself (scale = 2^zoom, like CRS.Simple).
 */
export function createMapCRS(projection: MapProjection): L.CRS {
  const fwd = projection.affine
  const inv = invertAffine(fwd)
  const projectionImpl: L.Projection = {
    project(latlng: L.LatLng): L.Point {
      const p = gameToMapPoint({ x: latlng.lng, z: latlng.lat }, { affine: fwd })
      return L.point(p.px, p.py)
    },
    unproject(point: L.Point): L.LatLng {
      const g = gameToMapPoint({ x: point.x, z: point.y }, { affine: inv })
      return L.latLng(g.py, g.px)
    },
    bounds: L.bounds([-1e7, -1e7], [1e7, 1e7]),
  }
  return L.extend({}, L.CRS.Simple, {
    projection: projectionImpl,
    transformation: new L.Transformation(1, 0, 1, 0),
  }) as L.CRS
}

/** One game unit is one metre, so distances are plain Euclidean in (x, z). */
export function gameDistanceMeters(a: GamePoint, b: GamePoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

// ---------------------------------------------------------------------------
// Fitting (used by the /dev/align tool)
// ---------------------------------------------------------------------------

export interface AlignPairInput {
  x: number
  z: number
  px: number
  py: number
}

export interface AffineFit {
  affine: Affine
  /** Per-pair residual in zoom-0 pixels and in metres (same order as input). */
  residuals: { px: number; meters: number; dx: number; dy: number }[]
  rmsPx: number
  rmsMeters: number
}

/** Solves the 3x3 normal equations for one output coordinate. */
function solveNormal(rows: number[][], target: number[]): [number, number, number] {
  const M = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    for (let j = 0; j < 3; j++) {
      M[j][3] += r[j] * target[i]
      for (let k = 0; k < 3; k++) M[j][k] += r[j] * r[k]
    }
  }
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    if (Math.abs(M[c][c]) < 1e-12) throw new Error('Reference points are collinear; add a point off the line.')
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]]
}

/**
 * Least-squares affine from >= 3 (game -> image pixel) pairs. Handles
 * rotation, flips, non-uniform scale and shear.
 */
export function fitAffine(pairs: AlignPairInput[]): AffineFit {
  if (pairs.length < 3) throw new Error('At least 3 reference pairs are needed.')
  const rows = pairs.map((p) => [p.x, p.z, 1])
  const [a, b, c] = solveNormal(rows, pairs.map((p) => p.px))
  const [d, e, f] = solveNormal(rows, pairs.map((p) => p.py))
  const affine: Affine = [a, b, c, d, e, f]
  const pxPerMeter = (Math.hypot(a, d) + Math.hypot(b, e)) / 2
  let sum = 0
  let sumM = 0
  const residuals = pairs.map((p) => {
    const q = gameToMapPoint(p, { affine })
    const dx = q.px - p.px
    const dy = q.py - p.py
    const px = Math.hypot(dx, dy)
    const meters = px / pxPerMeter
    sum += px * px
    sumM += meters * meters
    return { px, meters, dx, dy }
  })
  return {
    affine,
    residuals,
    rmsPx: Math.sqrt(sum / pairs.length),
    rmsMeters: Math.sqrt(sumM / pairs.length),
  }
}

/** Human-readable breakdown of an affine (for the align tool). */
export function describeAffine(m: Affine) {
  const [a, b, , d, e] = m
  const scaleX = Math.hypot(a, d)
  const scaleZ = Math.hypot(b, e)
  const rotationDeg = (Math.atan2(d, a) * 180) / Math.PI
  const shearDeg = (Math.acos((a * b + d * e) / (scaleX * scaleZ || 1)) * 180) / Math.PI - 90
  const flipped = a * e - b * d > 0 // positive determinant = mirrored relative to tarkov.dev's convention
  return { scaleX, scaleZ, rotationDeg, shearDeg, flipped }
}

export function roundAffine(m: Affine, digits = 6): Affine {
  return m.map((v) => Number(v.toFixed(digits))) as Affine
}
