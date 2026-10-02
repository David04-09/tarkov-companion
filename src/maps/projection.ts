/**
 * Game-coordinate <-> map-pixel projection.
 *
 * Escape from Tarkov positions are {x, y, z} where y is height. The tarkov.dev
 * map images (see src/data/mapConfig.json, vendored from
 * github.com/the-hideout/tarkov-dev src/data/maps.json) are described by:
 *   - coordinateRotation: degrees to rotate the (x, z) plane first
 *   - transform: [scaleX, offsetX, scaleY, offsetY] applied after rotation
 *   - bounds: [[x, z], [x, z]] two opposite corners of the image, in game units
 *
 * Map pixel coordinates below are "zoom 0 pixels" (one tile = 256 px). At zoom
 * level n multiply by 2^n. This is exactly the math tarkov.dev's map page uses
 * (getCRS + applyRotation in src/pages/map/index.jsx), so markers land where
 * they do on tarkov.dev.
 *
 * Inside Leaflet we do NOT pre-project points. Instead `createMapCRS()` builds a
 * CRS that applies the same projection, so every Leaflet layer works directly in
 * game coordinates as `L.latLng(z, x)` (latitude = z, longitude = x). That keeps
 * zones, markers and drawings all in one coordinate space.
 */

import L from 'leaflet'

export interface GamePosition {
  x: number
  y: number
  z: number
}

export interface MapProjection {
  /** [scaleX, offsetX, scaleY, offsetY] */
  transform: [number, number, number, number]
  /** Degrees. */
  coordinateRotation: number
}

export interface MapPoint {
  /** Pixels at zoom 0, from the top-left of the tile pyramid / image. */
  px: number
  py: number
}

/** Rotate a point in the (x, z) plane around the origin. */
function rotateXZ(x: number, z: number, degrees: number): { x: number; z: number } {
  if (!degrees || (x === 0 && z === 0)) return { x, z }
  const r = (degrees * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { x: x * cos - z * sin, z: x * sin + z * cos }
}

/**
 * THE projection function: in-game (x, y, z) -> map pixel (px, py) at zoom 0.
 * `y` (height) does not affect the 2-D position; floors are handled separately.
 *
 * Verified 2026-10-02 against Customs: the "Every Hunter Knows This" objective
 * zone at the three-story dorms (x 171.76, z 160.04) projects to (127.6, 174.6),
 * which at zoom 3 is tile 3/5 offset (253, 117): the east dorm building.
 */
export function gameToMapPoint(pos: Pick<GamePosition, 'x' | 'z'>, projection: MapProjection): MapPoint {
  const [scaleX, offsetX, scaleY, offsetY] = projection.transform
  const r = rotateXZ(pos.x, pos.z, projection.coordinateRotation)
  return {
    px: scaleX * r.x + offsetX,
    py: -scaleY * r.z + offsetY,
  }
}

/** Inverse of gameToMapPoint (height is unknown, so only x and z come back). */
export function mapPointToGame(point: MapPoint, projection: MapProjection): { x: number; z: number } {
  const [scaleX, offsetX, scaleY, offsetY] = projection.transform
  const rx = (point.px - offsetX) / scaleX
  const rz = (point.py - offsetY) / -scaleY
  return rotateXZ(rx, rz, -projection.coordinateRotation)
}

/** Leaflet LatLng for a game position: latitude = z, longitude = x. */
export function gameToLatLng(pos: Pick<GamePosition, 'x' | 'z'>): L.LatLng {
  return L.latLng(pos.z, pos.x)
}

/** Config bounds [[x, z], [x, z]] -> Leaflet bounds in game-coordinate LatLngs. */
export function gameBoundsToLatLngBounds(bounds: [[number, number], [number, number]]): L.LatLngBounds {
  return L.latLngBounds([bounds[0][1], bounds[0][0]], [bounds[1][1], bounds[1][0]])
}

/**
 * A Leaflet CRS whose "project" step is gameToMapPoint. With this CRS, Leaflet
 * layers are positioned with game coordinates and Leaflet does the pixel math
 * (and zoom scaling) itself.
 */
export function createMapCRS(projection: MapProjection): L.CRS {
  const [scaleX, offsetX, scaleY, offsetY] = projection.transform
  const rotation = projection.coordinateRotation
  const projectionImpl: L.Projection = {
    project(latlng: L.LatLng): L.Point {
      const r = rotateXZ(latlng.lng, latlng.lat, rotation)
      return L.point(r.x, r.z)
    },
    unproject(point: L.Point): L.LatLng {
      const r = rotateXZ(point.x, point.y, -rotation)
      return L.latLng(r.z, r.x)
    },
    bounds: L.bounds([-1e6, -1e6], [1e6, 1e6]),
  }
  return L.extend({}, L.CRS.Simple, {
    projection: projectionImpl,
    transformation: new L.Transformation(scaleX, offsetX, -scaleY, offsetY),
  }) as L.CRS
}

/**
 * Approximate metres per zoom-0 pixel. The transform's scale is pixels per game
 * unit and one game unit is one metre, so distance in metres between two game
 * positions is simply the Euclidean distance in (x, z).
 */
export function gameDistanceMeters(a: Pick<GamePosition, 'x' | 'z'>, b: Pick<GamePosition, 'x' | 'z'>): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}
