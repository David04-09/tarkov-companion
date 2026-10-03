import { Fragment, memo, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Position } from '../../api/types'
import { type BossEntry, type SpawnModel, spawnKey, toggleKeyFor } from './spawns'

/** Red/orange family, deliberately away from the quest palette's blues/greens. */
const BOSS_COLOR = '#e63946'
const GUARD_COLOR = '#f4a261'
const ROGUE_COLOR = '#ff7b00'
const RAIDER_COLOR = '#d00000'
const CULTIST_COLOR = '#9b2226'
const GOON_COLOR = '#ff4d6d'
const PMC_COLOR = '#4cc9f0'
const SCAV_COLOR = '#f8961e'
const SNIPER_COLOR = '#ffd166'

const colorFor = (e: BossEntry) =>
  e.group === 'goons' ? GOON_COLOR : e.group === 'cultists' ? CULTIST_COLOR : e.group === 'raiders' ? RAIDER_COLOR : e.group === 'rogues' ? ROGUE_COLOR : BOSS_COLOR

const ll = (p: Position) => L.latLng(p.z, p.x)
const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

const iconCache = new Map<string, L.DivIcon>()
function bossIcon(e: BossEntry): L.DivIcon {
  const key = `${e.key}|${e.portrait ?? ''}`
  let icon = iconCache.get(key)
  if (!icon) {
    const color = colorFor(e)
    const inner = e.portrait
      ? `<img src="${e.portrait}" alt="" />`
      : `<span class="tc-boss-initials">${initials(e.name)}</span>`
    icon = L.divIcon({
      html: `<div class="tc-boss" style="--c:${color}">${inner}</div>`,
      className: 'tc-divicon',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -17],
      tooltipAnchor: [0, -17],
    })
    iconCache.set(key, icon)
  }
  return icon
}

/** The listed point closest to the group's centre: where the portrait goes. */
function medoid(points: Position[]): Position {
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length
  const cz = points.reduce((a, p) => a + p.z, 0) / points.length
  let best = points[0]
  let bestD = Infinity
  for (const p of points) {
    const d = (p.x - cx) ** 2 + (p.z - cz) ** 2
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

function BossPopup({ e, locationName, locationChance }: { e: BossEntry; locationName: string; locationChance: number }) {
  return (
    <div className="min-w-[200px] text-xs">
      <div className="flex items-center gap-2">
        {e.portrait && <img src={e.portrait} alt="" className="h-8 w-8 rounded-full object-cover" />}
        <div>
          <div className="font-semibold text-ink">{e.name}</div>
          <div className="text-ink-muted">Spawn chance {Math.round(e.spawnChance * 100)}%</div>
        </div>
      </div>
      <div className="mt-1.5 text-ink">
        {locationName}: {Math.round(locationChance * 100)}% of spawns here
      </div>
      {e.escorts.length > 0 && (
        <div className="mt-1 text-ink-muted">Escorts: {e.escorts.map((x) => `${x.name} ×${x.counts.join('/') || '?'}`).join(', ')}</div>
      )}
      {e.conditions.map((c) => (
        <div key={c} className="mt-1 text-ink-dim">{c}</div>
      ))}
    </div>
  )
}

const BossMarkers = memo(function BossMarkers({ entry, guards }: { entry: BossEntry; guards: boolean }) {
  const color = colorFor(entry)
  const guardCount = entry.escorts.reduce((n, g) => n + (g.counts[g.counts.length - 1] ?? 1), 0)
  return (
    <>
      {entry.spawns.map((spawn, si) =>
        spawn.locations.map((loc, li) => {
          if (loc.positions.length === 0) return null
          const centre = medoid(loc.positions)
          const title = `${entry.name} · ${loc.name} · ${Math.round(loc.chance * 100)}% of spawns`
          return (
            <Fragment key={`${si}:${li}`}>
              {loc.positions.map((p, pi) => (
                <CircleMarker key={pi} center={ll(p)} radius={p === centre ? 26 : 9} pathOptions={{ color, weight: p === centre ? 1.5 : 1, opacity: 0.85, fillColor: color, fillOpacity: p === centre ? 0.12 : 0.3 }}>
                  <Tooltip sticky>{`${title} · spawn point ${pi + 1}/${loc.positions.length}`}</Tooltip>
                </CircleMarker>
              ))}
              <Marker position={ll(centre)} icon={bossIcon(entry)} zIndexOffset={200}>
                <Tooltip direction="top" offset={[0, -17]}>{`${entry.name} · ${Math.round(entry.spawnChance * 100)}%`}</Tooltip>
                <Popup maxWidth={320}>
                  <BossPopup e={entry} locationName={loc.name} locationChance={loc.chance} />
                </Popup>
              </Marker>
              {guards &&
                guardCount > 0 &&
                Array.from({ length: Math.min(guardCount, 8) }, (_, gi) => {
                  const ang = (gi / Math.min(guardCount, 8)) * Math.PI * 2
                  const r = 6
                  return (
                    <CircleMarker
                      key={gi}
                      center={ll({ x: centre.x + Math.cos(ang) * r, y: 0, z: centre.z + Math.sin(ang) * r })}
                      radius={4}
                      pathOptions={{ color: '#111', weight: 1, fillColor: GUARD_COLOR, fillOpacity: 0.95 }}
                    >
                      <Tooltip direction="top" offset={[0, -4]}>{`${entry.name} guard (${entry.escorts.map((x) => `${x.name} ×${x.counts.join('/')}`).join(', ')})`}</Tooltip>
                    </CircleMarker>
                  )
                })}
            </Fragment>
          )
        }),
      )}
    </>
  )
})

/** Small dots clustered into grid cells while zoomed out (same approach as the loot layer). */
const Dots = memo(function Dots({ points, color, label, clusterBelowZoom }: { points: Position[]; color: string; label: string; clusterBelowZoom: number }) {
  const map = useMap()
  const [zoom, setZoom] = useState(() => map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const { clusters, singles } = useMemo(() => {
    if (zoom >= clusterBelowZoom) return { clusters: [] as { lat: number; lng: number; n: number; key: string }[], singles: points }
    const cells = new Map<string, { sx: number; sz: number; n: number }>()
    const singles: Position[] = []
    for (const p of points) {
      const px = map.project(ll(p), zoom)
      const key = `${Math.floor(px.x / 48)}:${Math.floor(px.y / 48)}`
      const c = cells.get(key) ?? { sx: 0, sz: 0, n: 0 }
      c.sx += p.x
      c.sz += p.z
      c.n += 1
      cells.set(key, c)
    }
    const clusters: { lat: number; lng: number; n: number; key: string }[] = []
    for (const [key, c] of cells) {
      if (c.n === 1) singles.push({ x: c.sx, y: 0, z: c.sz })
      else clusters.push({ key, lat: c.sz / c.n, lng: c.sx / c.n, n: c.n })
    }
    return { clusters, singles }
  }, [points, zoom, clusterBelowZoom, map])
  return (
    <>
      {clusters.map((c) => (
        <CircleMarker key={c.key} center={[c.lat, c.lng]} radius={9} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.35 }} eventHandlers={{ click: () => map.setView([c.lat, c.lng], Math.min(map.getMaxZoom(), map.getZoom() + 2)) }}>
          <Tooltip direction="top" offset={[0, -8]}>{`${c.n} ${label} spawns`}</Tooltip>
        </CircleMarker>
      ))}
      {singles.map((p, i) => (
        <CircleMarker key={i} center={ll(p)} radius={3.5} pathOptions={{ color: '#111', weight: 0.75, fillColor: color, fillOpacity: 0.95 }}>
          <Tooltip direction="top" offset={[0, -4]}>{`${label} spawn`}</Tooltip>
        </CircleMarker>
      ))}
    </>
  )
})

export function SpawnLayer({ model, toggles, clusterBelowZoom }: { model: SpawnModel; toggles: Record<string, boolean>; clusterBelowZoom: number }) {
  return (
    <>
      {model.bosses.map((e) => (toggles[toggleKeyFor(e)] ? <BossMarkers key={e.key} entry={e} guards={Boolean(toggles[spawnKey.guards(e.key)])} /> : null))}
      {toggles.pmc && model.pmc.length > 0 && <Dots points={model.pmc} color={PMC_COLOR} label="PMC" clusterBelowZoom={clusterBelowZoom} />}
      {toggles.scav && model.scav.length > 0 && <Dots points={model.scav} color={SCAV_COLOR} label="Scav" clusterBelowZoom={clusterBelowZoom} />}
      {toggles.sniper && model.sniper.length > 0 && <Dots points={model.sniper} color={SNIPER_COLOR} label="Sniper scav" clusterBelowZoom={clusterBelowZoom} />}
    </>
  )
}
