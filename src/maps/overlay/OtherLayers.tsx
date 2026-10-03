import { Fragment, memo, useMemo } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polygon, Tooltip } from 'react-leaflet'
import type { GameData, ItemsById, MapDetails, Position } from '../../api/types'
import type { BaseLayerConfig } from '../mapConfig'
import type { OverlayLayerId } from '../../store/mapOverlay'
import { floorForPosition, layerHasFloorHeights } from './floors'
import { layerIcon } from './objectiveIcons'
import { LAYER_COLORS } from './palette'

const toLatLngs = (outline: Position[]) => outline.map((p) => L.latLng(p.z, p.x))
const ll = (p: Position) => L.latLng(p.z, p.x)

interface CommonProps {
  details: MapDetails
  layer: BaseLayerConfig
  activeFloor: string | null
}

const Extracts = memo(function Extracts({ details, layer, activeFloor, pmc, scav }: CommonProps & { pmc: boolean; scav: boolean }) {
  const hasFloors = layerHasFloorHeights(layer)
  return (
    <>
      {details.extracts
        .filter((e) => (e.faction === 'scav' ? scav : pmc))
        .map((e) => {
          const color =
            e.faction === 'pmc' ? LAYER_COLORS.extractPmc : e.faction === 'scav' ? LAYER_COLORS.extractScav : LAYER_COLORS.extractShared
          const dim = hasFloors && floorForPosition(layer, e.position) !== activeFloor
          const label = `${e.name} · ${e.faction === 'pmc' ? 'PMC' : e.faction === 'scav' ? 'Scav' : 'PMC & Scav'} extract`
          return (
            <Fragment key={e.id}>
              {e.outline.length > 2 && (
                <Polygon
                  positions={toLatLngs(e.outline)}
                  pathOptions={{ color, weight: 1, opacity: dim ? 0.2 : 0.7, fillColor: color, fillOpacity: dim ? 0.04 : 0.15 }}
                >
                  <Tooltip sticky>{label}</Tooltip>
                </Polygon>
              )}
              <Marker position={ll(e.position)} icon={layerIcon('extract', color, dim)} zIndexOffset={-200}>
                <Tooltip direction="top" offset={[0, -10]}>
                  {label}
                </Tooltip>
              </Marker>
            </Fragment>
          )
        })}
    </>
  )
})

const Transits = memo(function Transits({ details, layer, activeFloor, maps }: CommonProps & { maps: GameData['maps'] }) {
  const hasFloors = layerHasFloorHeights(layer)
  return (
    <>
      {details.transits.map((t) => {
        const target = maps.find((m) => m.id === t.targetMapId)?.name
        const dim = hasFloors && floorForPosition(layer, t.position) !== activeFloor
        const label = `${t.name}${target ? ` → ${target}` : ''}`
        return (
          <Fragment key={t.id}>
            {t.outline.length > 2 && (
              <Polygon
                positions={toLatLngs(t.outline)}
                pathOptions={{ color: LAYER_COLORS.transit, weight: 1, opacity: dim ? 0.2 : 0.7, fillColor: LAYER_COLORS.transit, fillOpacity: dim ? 0.04 : 0.15 }}
              >
                <Tooltip sticky>{label}</Tooltip>
              </Polygon>
            )}
            <Marker position={ll(t.position)} icon={layerIcon('transit', LAYER_COLORS.transit, dim)} zIndexOffset={-200}>
              <Tooltip direction="top" offset={[0, -10]}>
                {label}
              </Tooltip>
            </Marker>
          </Fragment>
        )
      })}
    </>
  )
})

const Locks = memo(function Locks({
  details,
  layer,
  activeFloor,
  items,
  ownedKeyIds,
}: CommonProps & { items: ItemsById | undefined; ownedKeyIds: ReadonlySet<string> }) {
  const hasFloors = layerHasFloorHeights(layer)
  return (
    <>
      {details.locks.map((l) => {
        const key = items?.[l.keyId]
        const owned = ownedKeyIds.has(l.keyId)
        const dim = hasFloors && floorForPosition(layer, l.position) !== activeFloor
        return (
          <Marker key={l.id} position={ll(l.position)} icon={layerIcon('lock', owned ? LAYER_COLORS.lockOwned : LAYER_COLORS.lockMissing, dim)} zIndexOffset={-300}>
            <Tooltip direction="top" offset={[0, -10]}>
              <span className="flex items-center gap-1.5">
                {key?.iconLink && <img src={key.iconLink} alt="" className="h-5 w-5 object-contain" />}
                <span>
                  {key?.name ?? (items ? 'Unknown key' : 'Key…')} · {owned ? 'owned' : 'missing'} · locked {l.lockType}
                  {l.needsPower ? ' (needs power)' : ''}
                  {hasFloors ? ` · ${floorForPosition(layer, l.position) ?? 'Ground'}` : ''}
                </span>
              </span>
            </Tooltip>
          </Marker>
        )
      })}
    </>
  )
})

const Spawns = memo(function Spawns({ details }: { details: MapDetails }) {
  const player = useMemo(() => details.spawns.filter((s) => s.categories.includes('player')), [details])
  return (
    <>
      {player.map((s, i) => {
        const scav = s.sides.includes('scav') && !s.sides.includes('pmc')
        const color = scav ? LAYER_COLORS.spawnScav : LAYER_COLORS.spawnPmc
        return (
          <CircleMarker
            key={i}
            center={ll(s.position)}
            radius={3.5}
            pathOptions={{ color: '#111', weight: 1, fillColor: color, fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              {scav ? 'Scav' : 'PMC'} spawn{s.zoneName ? ` · ${s.zoneName}` : ''}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
})

const Bosses = memo(function Bosses({ details, mobNames }: { details: MapDetails; mobNames: Record<string, string> }) {
  return (
    <>
      {details.bosses.map((b, bi) =>
        b.locations.map((loc, li) =>
          loc.positions.map((p, pi) => (
            <Marker key={`${bi}:${li}:${pi}`} position={ll(p)} icon={layerIcon('boss', LAYER_COLORS.boss)} zIndexOffset={-100}>
              <Tooltip direction="top" offset={[0, -10]}>
                {(b.mobId && mobNames[b.mobId]) || 'Boss'} · {loc.name} · {Math.round(loc.chance * 100)}% (spawns{' '}
                {Math.round(b.spawnChance * 100)}%)
              </Tooltip>
            </Marker>
          )),
        ),
      )}
    </>
  )
})

export interface OtherLayersProps {
  data: GameData
  mapId: string
  layer: BaseLayerConfig
  activeFloor: string | null
  toggles: Record<OverlayLayerId, boolean>
  items: ItemsById | undefined
  /** Keys the player owns (locked doors turn green). */
  ownedKeyIds: ReadonlySet<string>
}

/** Non-quest layers, each memoised separately so a toggle only mounts/unmounts its own layer. */
export function OtherLayers({ data, mapId, layer, activeFloor, toggles, items, ownedKeyIds }: OtherLayersProps) {
  const details = data.mapDetails[mapId]
  if (!details) return null
  return (
    <>
      {(toggles.extractsPmc || toggles.extractsScav) && (
        <Extracts details={details} layer={layer} activeFloor={activeFloor} pmc={toggles.extractsPmc} scav={toggles.extractsScav} />
      )}
      {toggles.transits && <Transits details={details} layer={layer} activeFloor={activeFloor} maps={data.maps} />}
      {toggles.locks && <Locks details={details} layer={layer} activeFloor={activeFloor} items={items} ownedKeyIds={ownedKeyIds} />}
      {toggles.spawns && <Spawns details={details} />}
      {toggles.bosses && <Bosses details={details} mobNames={data.mobNames} />}
    </>
  )
}
