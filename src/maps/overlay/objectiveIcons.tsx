import L from 'leaflet'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  ArrowRightLeft,
  Circle,
  Crosshair,
  Flag,
  Hand,
  Key,
  LogOut,
  MapPin,
  Package,
  PackagePlus,
  Search,
  Skull,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

/** Objective type -> glyph. Unknown types fall back to a plain dot. */
const OBJECTIVE_GLYPH: Record<string, LucideIcon> = {
  visit: MapPin,
  mark: Flag,
  plantItem: PackagePlus,
  plantQuestItem: PackagePlus,
  findItem: Search,
  findQuestItem: Search,
  giveItem: Package,
  giveQuestItem: Package,
  shoot: Crosshair,
  extract: LogOut,
  useItem: Hand,
  buildWeapon: Wrench,
}

export const OBJECTIVE_TYPE_LABEL: Record<string, string> = {
  visit: 'Visit',
  mark: 'Mark',
  plantItem: 'Place item',
  plantQuestItem: 'Place quest item',
  findItem: 'Find item',
  findQuestItem: 'Find quest item',
  giveItem: 'Hand over item',
  giveQuestItem: 'Hand over quest item',
  shoot: 'Kill',
  extract: 'Extract',
  useItem: 'Use item',
  buildWeapon: 'Build weapon',
}

export const LAYER_GLYPH = {
  extract: LogOut,
  transit: ArrowRightLeft,
  lock: Key,
  boss: Skull,
}

const svgCache = new Map<string, string>()
function glyphSvg(Icon: LucideIcon, size: number): string {
  const key = `${Icon.displayName ?? Icon.name}:${size}`
  let svg = svgCache.get(key)
  if (!svg) {
    svg = renderToStaticMarkup(<Icon size={size} color="#fff" strokeWidth={2.5} absoluteStrokeWidth />)
    svgCache.set(key, svg)
  }
  return svg
}

const iconCache = new Map<string, L.DivIcon>()

/**
 * Cached Leaflet DivIcon for an objective marker: coloured disc with a white
 * glyph, optional number badge (for objectives with several possible spots)
 * and a dimmed variant for other floors.
 */
export function objectiveIcon(type: string, color: string, number: number, dim: boolean): L.DivIcon {
  const key = `${type}|${color}|${number}|${dim ? 1 : 0}`
  let icon = iconCache.get(key)
  if (!icon) {
    const Glyph = OBJECTIVE_GLYPH[type] ?? Circle
    const html =
      `<div class="tc-marker${dim ? ' tc-dim' : ''}" style="--c:${color}">` +
      glyphSvg(Glyph, 13) +
      (number > 0 ? `<span class="tc-marker-num">${number}</span>` : '') +
      '</div>'
    icon = L.divIcon({ html, className: 'tc-divicon', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12], tooltipAnchor: [0, -12] })
    iconCache.set(key, icon)
  }
  return icon
}

/** Smaller square marker for non-quest layers (extracts, transits, locks, bosses). */
export function layerIcon(kind: keyof typeof LAYER_GLYPH, color: string, dim = false): L.DivIcon {
  const key = `layer|${kind}|${color}|${dim ? 1 : 0}`
  let icon = iconCache.get(key)
  if (!icon) {
    const html = `<div class="tc-marker tc-marker-sm${dim ? ' tc-dim' : ''}" style="--c:${color}">${glyphSvg(LAYER_GLYPH[kind], 11)}</div>`
    icon = L.divIcon({ html, className: 'tc-divicon', iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10], tooltipAnchor: [0, -10] })
    iconCache.set(key, icon)
  }
  return icon
}
