import type { BaseLayerConfig, FloorExtent } from '../mapConfig'

/** True when the imagery has floors with height ranges we can test against. */
export function layerHasFloorHeights(layer: BaseLayerConfig): boolean {
  return layer.floors.some((f) => f.extents && f.extents.length > 0)
}

function insideAnyRect(ext: FloorExtent, x: number, z: number): boolean {
  // No rectangles = the height range applies to the whole map (Streets, Factory, Labs).
  if (!ext.bounds || ext.bounds.length === 0) return true
  for (const rect of ext.bounds) {
    const [a, b] = rect
    if (!Array.isArray(a) || !Array.isArray(b)) continue
    const minX = Math.min(a[0], b[0])
    const maxX = Math.max(a[0], b[0])
    const minZ = Math.min(a[1], b[1])
    const maxZ = Math.max(a[1], b[1])
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true
  }
  return false
}

/**
 * Which floor (layer name) a game position belongs to, or null for the ground
 * level. tarkov.dev's extents are per building: a height range plus the
 * rectangles (game x/z) it applies to, so a position is only "upstairs" when
 * it is both at that height and inside one of those buildings.
 */
export function floorForPosition(layer: BaseLayerConfig, pos: { x: number; y: number; z: number }): string | null {
  for (const f of layer.floors) {
    for (const ext of f.extents ?? []) {
      if (pos.y >= ext.height[0] && pos.y <= ext.height[1] && insideAnyRect(ext, pos.x, pos.z)) return f.name
    }
  }
  return null
}
