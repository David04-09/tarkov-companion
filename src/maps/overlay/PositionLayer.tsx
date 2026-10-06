import { useEffect } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import type { PlayerPosition } from '../../shared/desktop-api'

/**
 * Your position from the last in-game screenshot: an arrow pointing the way you faced.
 * The map is centred on it when a new screenshot arrives.
 */
export function PositionLayer({ pos }: { pos: PlayerPosition }) {
  const map = useMap()
  useEffect(() => {
    const here = L.latLng(pos.z, pos.x)
    // Facing: project a point one metre ahead to get the on-screen angle (maps can be rotated).
    const rad = (pos.yaw * Math.PI) / 180
    const ahead = L.latLng(pos.z + Math.cos(rad), pos.x + Math.sin(rad))
    const a = map.latLngToLayerPoint(here)
    const b = map.latLngToLayerPoint(ahead)
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    const icon = L.divIcon({
      className: 'tc-position',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: `<div style="width:44px;height:44px;transform:rotate(${deg}deg)"><svg viewBox="0 0 44 44" width="44" height="44"><circle cx="22" cy="22" r="20" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-width="2"/><path d="M38 22 L14 33 L19 22 L14 11 Z" fill="#38bdf8" stroke="#0c0c0b" stroke-width="1.5"/></svg></div>`,
    })
    const ago = Math.max(0, Math.round((Date.now() - pos.at) / 60_000))
    const marker = L.marker(here, { icon, zIndexOffset: 2000, interactive: true, pmIgnore: true } as L.MarkerOptions)
      .bindTooltip(`You were here ${ago === 0 ? 'just now' : `${ago} min ago`} (screenshot)`, { direction: 'top', offset: [0, -20] })
      .addTo(map)
    map.panTo(here, { animate: true })
    return () => {
      marker.remove()
    }
  }, [map, pos])
  return null
}
