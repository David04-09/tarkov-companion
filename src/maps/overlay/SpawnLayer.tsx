import { Fragment, memo, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { Position } from '../../api/types'
import { type BossEntry, type SpawnModel, spawnKey, toggleKeyFor } from './spawns'
import { wikiPageUrl } from './bossAreas'
import { BOSS_INFO } from './bossInfo'
import { spotSource, type BossSpot } from './bossSpots'

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

function openLink(url: string) {
  if (window.desktop?.openExternal) void window.desktop.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

function BossPopup({ e, spot }: { e: BossEntry; spot: BossSpot }) {
  const info = BOSS_INFO[e.key]
  const page = info?.page ?? spot.area?.page
  return (
    <div className="min-w-[220px] max-w-[300px] text-xs">
      <div className="flex items-center gap-2">
        {e.portrait && <img src={e.portrait} alt="" className="h-8 w-8 rounded-full object-cover" />}
        <div>
          <div className="font-semibold text-ink">{e.name}</div>
          <div className="text-ink-muted">Spawn chance {Math.round(e.spawnChance * 100)}% per raid</div>
        </div>
      </div>
      <div className="mt-1.5 font-medium text-ink">
        {spot.name}
        {spot.share > 0 && <span className="font-normal text-ink-muted"> · {Math.round(spot.share * 100)}% of its spawns on this map</span>}
      </div>
      <p className="mt-0.5 text-ink-muted">{spotSource(spot, e.name)}</p>
      {e.escorts.length > 0 && <div className="mt-1 text-ink-muted">Escorts: {e.escorts.map((x) => `${x.name} ×${x.counts.join('/') || '?'}`).join(', ')}</div>}
      {e.conditions.map((c) => (
        <div key={c} className="mt-1 text-ink-dim">{c}</div>
      ))}
      {e.note && <div className="mt-1 text-amber-300">{e.note}</div>}
      {info && (
        <div className="mt-1.5 border-t border-line pt-1">
          <div className="text-[10px] uppercase tracking-wide text-ink-dim">How {info.members ? 'they behave' : 'it behaves'}{info.members ? ` (${info.members})` : ''}</div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-ink-muted">
            {info.behaviour.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
      {page && (
        <button type="button" onClick={() => openLink(wikiPageUrl(page))} className="mt-1 text-[11px] text-accent underline">
          {page} on the EFT Wiki (CC BY-SA)
        </button>
      )}
    </div>
  )
}

const BossMarkers = memo(function BossMarkers({ entry, guards }: { entry: BossEntry; guards: boolean }) {
  const color = colorFor(entry)
  const guardCount = entry.escorts.reduce((n, g) => n + (g.counts[g.counts.length - 1] ?? 1), 0)
  const areaStyle = useMemo(() => ({ color, weight: 1.5, opacity: 0.9, dashArray: '6 5', fillColor: color, fillOpacity: 0.08 }), [color])
  const pointStyle = useMemo(() => ({ color, weight: 1, opacity: 0.85, fillColor: color, fillOpacity: 0.3 }), [color])
  const dataStyle = useMemo(() => ({ color, weight: 1, opacity: 0.45, dashArray: '2 3', fillColor: color, fillOpacity: 0.1 }), [color])
  return (
    <>
      {entry.areas.map((a) => (
        <Polygon key={a.name} positions={a.polygon.map(([x, z]) => L.latLng(z, x))} pathOptions={areaStyle} interactive={false} />
      ))}
      {entry.spots.map((spot) =>
        spot.kind === 'data' ? (
          spot.points.map((p, pi) => (
            <CircleMarker key={`${spot.key}:${pi}`} center={ll(p)} radius={4.5} pathOptions={dataStyle}>
              <Tooltip sticky>{`${entry.name} · ${spot.name} · only the game data lists this spot; players report ${entry.name} elsewhere here`}</Tooltip>
            </CircleMarker>
          ))
        ) : (
          <Fragment key={spot.key}>
            {spot.points.map((p, pi) => (
              <CircleMarker key={pi} center={ll(p)} radius={7} pathOptions={pointStyle}>
                <Tooltip sticky>{`${entry.name} · ${spot.name} · game-data spawn point ${pi + 1}/${spot.points.length}`}</Tooltip>
              </CircleMarker>
            ))}
            <Marker position={ll(spot.centre)} icon={bossIcon(entry)} zIndexOffset={200}>
              <Tooltip direction="top" offset={[0, -17]}>{`${entry.name} · ${spot.name}${spot.share > 0 ? ` · ${Math.round(spot.share * 100)}% of spawns` : ''}`}</Tooltip>
              <Popup maxWidth={320}>
                <BossPopup e={entry} spot={spot} />
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
                    center={ll({ x: spot.centre.x + Math.cos(ang) * r, y: 0, z: spot.centre.z + Math.sin(ang) * r })}
                    radius={4}
                    pathOptions={{ color: '#111', weight: 1, fillColor: GUARD_COLOR, fillOpacity: 0.95 }}
                  >
                    <Tooltip direction="top" offset={[0, -4]}>{`${entry.name} guard (${entry.escorts.map((x) => `${x.name} ×${x.counts.join('/')}`).join(', ')})`}</Tooltip>
                  </CircleMarker>
                )
              })}
          </Fragment>
        ),
      )}
    </>
  )
})

/** Small dots clustered into grid cells while zoomed out (same approach as the loot layer). */
const Dots = memo(function Dots({ points, color, label, clusterBelowZoom }: { points: Position[]; color: string; label: string; clusterBelowZoom: number }) {
  const map = useMap()
  // Whole zoom levels only (see LootLayer): no re-clustering on every quarter zoom step.
  const [zoom, setZoom] = useState(() => Math.floor(map.getZoom()))
  useMapEvents({ zoomend: () => setZoom(Math.floor(map.getZoom())) })
  const clusterStyle = useMemo(() => ({ color, weight: 2, fillColor: color, fillOpacity: 0.35 }), [color])
  const dotStyle = useMemo(() => ({ color: '#111', weight: 0.75, fillColor: color, fillOpacity: 0.95 }), [color])
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
        <CircleMarker key={c.key} center={[c.lat, c.lng]} radius={9} pathOptions={clusterStyle} eventHandlers={{ click: () => map.setView([c.lat, c.lng], Math.min(map.getMaxZoom(), map.getZoom() + 2)) }}>
          <Tooltip direction="top" offset={[0, -8]}>{`${c.n} ${label} spawns`}</Tooltip>
        </CircleMarker>
      ))}
      {singles.map((p, i) => (
        <CircleMarker key={`${p.x}:${p.z}:${i}`} center={ll(p)} radius={3.5} pathOptions={dotStyle}>
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
