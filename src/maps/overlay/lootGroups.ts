import type { MapDetails, Position } from '../../api/types'

/** Distinct colours for container groups (cycled). */
const LOOT_PALETTE = ['#4cc9f0', '#f8961e', '#90be6d', '#f9c74f', '#b5179e', '#43aa8b', '#f94144', '#9d4edd', '#ff9e80', '#a7c957', '#577590', '#f72585']

export interface LootGroup {
  name: string
  color: string
  positions: Position[]
}

/** Container spawns grouped by container name (ids with the same name are merged). */
export function buildLootGroups(details: MapDetails | undefined, names: Record<string, string>): LootGroup[] {
  if (!details) return []
  const byName = new Map<string, Position[]>()
  for (const c of details.lootContainers) {
    const name = names[c.containerId] ?? 'Container'
    let list = byName.get(name)
    if (!list) byName.set(name, (list = []))
    list.push(c.position)
  }
  return [...byName.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, positions], i) => ({ name, color: LOOT_PALETTE[i % LOOT_PALETTE.length], positions }))
}
