import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Route, Save, X } from 'lucide-react'
import type { GameData, ItemsById } from '../../api/types'
import type { ItemNeed } from '../../lib/needs'
import type { TaskStatus } from '../../lib/taskStatus'
import { drawingsKey, useDrawingsStore } from '../../store/drawings'
import { taskColor, useMapOverlayStore } from '../../store/mapOverlay'
import { useRoutePlanStore, type RoutePoint } from '../../store/routePlan'
import { gameDistanceMeters } from '../projection'
import type { MapTask } from './mapTasks'
import { OBJECTIVE_TYPE_LABEL } from './objectiveIcons'

export interface BriefingProps {
  data: GameData
  mapId: string
  mapKey: string
  gameMode: string
  mapTasks: MapTask[]
  statuses: Record<string, TaskStatus>
  needs: Map<string, ItemNeed>
  items: ItemsById | undefined
  ownedKeyIds: ReadonlySet<string>
  collected: Record<string, number>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-3 py-2">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  )
}

function nearestNeighbourRoute(start: { x: number; z: number }, tasks: MapTask[]): RoutePoint[] {
  // One stop per objective; among an objective's possible spots pick the one nearest to where we are.
  const pending = tasks.flatMap((mt) =>
    mt.objectives
      .filter((mo) => mo.placements.length > 0)
      .map((mo) => ({ label: `${mt.task.name}: ${mo.objective.description}`, spots: mo.placements.map((p) => p.position) })),
  )
  const out: RoutePoint[] = []
  let cur = start
  while (pending.length) {
    let bestI = 0
    let bestSpot = pending[0].spots[0]
    let bestD = Infinity
    pending.forEach((o, i) => {
      for (const s of o.spots) {
        const d = gameDistanceMeters(cur, s)
        if (d < bestD) {
          bestD = d
          bestI = i
          bestSpot = s
        }
      }
    })
    const [o] = pending.splice(bestI, 1)
    out.push({ id: `${Date.now().toString(36)}-${out.length}`, label: o.label, x: bestSpot.x, z: bestSpot.z })
    cur = bestSpot
  }
  return out
}

/** One scrollable raid briefing for the selected map. */
export function Briefing({ data, mapId, mapKey, gameMode, mapTasks, statuses, needs, items, ownedKeyIds, collected }: BriefingProps) {
  const checked = useMapOverlayStore((s) => s.checkedTaskIds)
  const colorIndexByTask = useMapOverlayStore((s) => s.colorIndexByTask)
  const setTaskChecked = useMapOverlayStore((s) => s.setTaskChecked)
  const plan = useRoutePlanStore()
  const setDrawings = useDrawingsStore((s) => s.setDrawings)
  const [spawn, setSpawn] = useState('')
  const [saved, setSaved] = useState(false)

  const details = data.mapDetails[mapId]
  const available = useMemo(() => mapTasks.filter((m) => statuses[m.task.id] === 'available'), [mapTasks, statuses])
  const checkedSet = useMemo(() => new Set(checked), [checked])

  const itemsHere = useMemo(() => {
    if (!details) return []
    const spawnable = new Set<string>()
    for (const l of details.lootLoose) for (const id of l.itemIds) spawnable.add(id)
    return [...needs.values()]
      .filter((n) => spawnable.has(n.itemId) && n.total - (collected[n.itemId] ?? 0) > 0)
      .sort((a, b) => b.total - a.total)
  }, [details, needs, collected])

  const keysHere = useMemo(() => {
    if (!details) return []
    const counts = new Map<string, number>()
    for (const l of details.locks) if (ownedKeyIds.has(l.keyId)) counts.set(l.keyId, (counts.get(l.keyId) ?? 0) + 1)
    return [...counts.entries()].map(([id, n]) => ({ id, n, name: items?.[id]?.name ?? 'Key' })).sort((a, b) => a.name.localeCompare(b.name))
  }, [details, ownedKeyIds, items])

  const spawnZones = useMemo(() => {
    const pmc = (details?.spawns ?? []).filter((s) => s.categories.includes('player') && s.sides.includes('pmc'))
    if (pmc.length === 0) return []
    // Some maps name spawn zones ("ZoneFactorySide"), others only have GUIDs. For the
    // latter, group by compass direction from the spawn centroid (+x is west, +z is south).
    const named = pmc.every((s) => /^[0-9a-f-]{36}$/i.test(s.zoneName) || !s.zoneName) === false
    const cx = pmc.reduce((a, s) => a + s.position.x, 0) / pmc.length
    const cz = pmc.reduce((a, s) => a + s.position.z, 0) / pmc.length
    const sector = (x: number, z: number) => {
      const east = cx - x
      const north = cz - z
      const deg = (Math.atan2(east, north) * 180) / Math.PI
      const names = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west']
      return `${names[Math.round(((deg + 360) % 360) / 45) % 8]} side`
    }
    const zones = new Map<string, { x: number; z: number; n: number }>()
    for (const s of pmc) {
      const key = named ? s.zoneName.replace(/^Zone/, '') || 'Unnamed' : sector(s.position.x, s.position.z)
      const z = zones.get(key) ?? { x: 0, z: 0, n: 0 }
      z.x += s.position.x
      z.z += s.position.z
      z.n += 1
      zones.set(key, z)
    }
    return [...zones.entries()].map(([name, v]) => ({ name, x: v.x / v.n, z: v.z / v.n, n: v.n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  }, [details])

  const planHere = useMemo(() => (plan.mapKey === mapKey ? plan.points : []), [plan.mapKey, plan.points, mapKey])
  const routeLength = useMemo(() => {
    let m = 0
    for (let i = 1; i < planHere.length; i++) m += gameDistanceMeters(planHere[i - 1], planHere[i])
    return m
  }, [planHere])

  const planRoute = () => {
    const tasks = mapTasks.filter((m) => checkedSet.has(m.task.id))
    const zone = spawnZones.find((z) => z.name === spawn) ?? spawnZones[0]
    const start = zone ? { x: zone.x, z: zone.z } : { x: 0, z: 0 }
    plan.setPlan(mapKey, nearestNeighbourRoute(start, tasks))
    setSaved(false)
  }

  const saveRoute = () => {
    if (planHere.length < 2) return
    const key = drawingsKey(gameMode, mapKey)
    const existing = useDrawingsStore.getState().byKey[key] ?? []
    setDrawings(key, [
      ...existing,
      { id: `route-${Date.now().toString(36)}`, shape: { type: 'polyline', latlngs: planHere.map((p) => [p.z, p.x] as [number, number]) }, color: '#ffd166', weight: 4 },
    ])
    setSaved(true)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto text-xs">
      <Section title={`Available quests here (${available.length})`}>
        {available.length === 0 && <p className="text-ink-dim">Nothing available on this map right now.</p>}
        <ul className="space-y-1">
          {available.map((mt) => {
            const on = checkedSet.has(mt.task.id)
            return (
              <li key={mt.task.id}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={on} onChange={(e) => setTaskChecked(mt.task.id, e.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {on && <span className="h-2 w-2 rounded-full" style={{ background: taskColor(colorIndexByTask[mt.task.id]) }} />}
                      <span className="font-medium">{mt.task.name}</span>
                      <span className="text-ink-dim">· {mt.task.trader.name}</span>
                    </span>
                    <ul className="ml-1 text-ink-muted">
                      {mt.objectives.map((mo) => (
                        <li key={mo.objective.id}>· {OBJECTIVE_TYPE_LABEL[mo.objective.type] ?? mo.objective.type}: {mo.objective.description}</li>
                      ))}
                    </ul>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={`Items I need that spawn here (${itemsHere.length})`}>
        {itemsHere.length === 0 ? (
          <p className="text-ink-dim">None of your needed items has a known loose-loot spawn on this map.</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {itemsHere.slice(0, 40).map((n) => (
              <li key={n.itemId} className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5">
                {items?.[n.itemId]?.iconLink && <img src={items[n.itemId].iconLink ?? ''} alt="" className="h-4 w-4 object-contain" />}
                <span>{items?.[n.itemId]?.shortName ?? n.itemId}</span>
                <span className="text-ink-dim">×{n.total - (collected[n.itemId] ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Keys I own that work here (${keysHere.length})`}>
        {keysHere.length === 0 ? <p className="text-ink-dim">None (mark keys as owned in the Keys tab).</p> : <p>{keysHere.map((k) => `${k.name} (${k.n})`).join(' · ')}</p>}
      </Section>

      <Section title="Extracts for PMCs">
        <p>{(details?.extracts ?? []).filter((e) => e.faction !== 'scav').map((e) => e.name).join(' · ') || 'No extract data.'}</p>
      </Section>

      <Section title="Bosses">
        {(details?.bosses ?? []).length === 0 ? (
          <p className="text-ink-dim">No boss data for this map.</p>
        ) : (
          <ul>
            {(details?.bosses ?? []).map((b, i) => (
              <li key={i}>
                {(b.mobId && data.mobNames[b.mobId]) || 'Boss'}: {Math.round(b.spawnChance * 100)}% ({b.locations.map((l) => `${l.name} ${Math.round(l.chance * 100)}%`).join(', ')})
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Plan route">
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={spawn} onChange={(e) => setSpawn(e.target.value)} aria-label="Spawn side" className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink">
            {spawnZones.length === 0 && <option value="">Map centre</option>}
            {spawnZones.map((z) => (
              <option key={z.name} value={z.name}>{z.name} ({z.n})</option>
            ))}
          </select>
          <button type="button" onClick={planRoute} disabled={!mapTasks.some((m) => checkedSet.has(m.task.id) && m.placements.length > 0)} className="btn !px-2 !py-0.5 !text-[11px]">
            <Route className="h-3.5 w-3.5" /> Plan route
          </button>
          {planHere.length > 0 && (
            <>
              <button type="button" onClick={saveRoute} className="btn !px-2 !py-0.5 !text-[11px]"><Save className="h-3.5 w-3.5" /> {saved ? 'Saved' : 'Save as drawing'}</button>
              <button type="button" onClick={() => plan.clear()} className="btn !px-2 !py-0.5 !text-[11px]"><X className="h-3.5 w-3.5" /> Clear</button>
            </>
          )}
        </div>
        <p className="mt-1 text-ink-dim">Orders the checked quests' objectives nearest-first from the chosen spawn. Drag the numbered pins on the map; reorder below.</p>
        {planHere.length > 0 && (
          <ol className="mt-1 space-y-0.5">
            {planHere.map((p, i) => (
              <li key={p.id} className="flex items-center gap-1">
                <span className="w-5 text-right text-ink-dim">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate">{p.label}</span>
                <button type="button" onClick={() => plan.reorder(i, i - 1)} disabled={i === 0} aria-label="Move up" className="text-ink-dim hover:text-ink disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => plan.reorder(i, i + 1)} disabled={i === planHere.length - 1} aria-label="Move down" className="text-ink-dim hover:text-ink disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => plan.removePoint(p.id)} aria-label="Remove" className="text-ink-dim hover:text-danger"><X className="h-3.5 w-3.5" /></button>
              </li>
            ))}
            <li className="pt-1 text-ink-muted">Route length ≈ {routeLength >= 1000 ? `${(routeLength / 1000).toFixed(2)} km` : `${Math.round(routeLength)} m`} (straight lines)</li>
          </ol>
        )}
      </Section>
    </div>
  )
}
