import type { Position } from '../api/types'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { compassFromScreen } from './text'

/** Compass direction between two spots as the map picture is drawn (north up). */
export function headingOnMap(normalizedName: string, from: Position, to: Position): string | null {
  const cfg = findMapConfig(normalizedName)
  if (!cfg) return null
  const [a, b, , d, e] = resolveBaseLayer(cfg, undefined).affine
  const dx = to.x - from.x
  const dz = to.z - from.z
  const sx = a * dx + b * dz
  const sy = d * dx + e * dz
  return Math.hypot(sx, sy) < 1e-9 ? null : compassFromScreen(sx, sy)
}
