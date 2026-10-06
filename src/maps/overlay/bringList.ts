/**
 * What to take into a raid for the quests shown on the map: items to plant, markers,
 * quest items to place, gear to wear, weapons to use and keys. Same items across quests
 * are added up. Pure: the map's "Bring" box renders the result.
 */
import type { MapTask } from './mapTasks'

export type BringKind = 'plant' | 'marker' | 'questItem' | 'wear' | 'weapon' | 'key'

export interface BringEntry {
  kind: BringKind
  /** Item ids that satisfy this entry (any one of them); for 'wear': the first outfit, all worn together. */
  itemIds: string[]
  /** wear: how many other outfits would also do. */
  otherOutfits?: number
  /** Quest item name (quest items are not in the items list). */
  questItemName?: string
  count: number
  /** Quests that need it. */
  quests: string[]
  optional: boolean
}

const ORDER: BringKind[] = ['key', 'plant', 'marker', 'questItem', 'wear', 'weapon']

export function buildBringList(mapTasks: MapTask[]): BringEntry[] {
  const byKey = new Map<string, BringEntry>()
  const add = (kind: BringKind, itemIds: string[], count: number, quest: string, optional: boolean, questItemName?: string) => {
    if (!itemIds.length && !questItemName) return
    const key = `${kind}:${[...itemIds].sort().join('|') || questItemName}`
    const e = byKey.get(key)
    if (e) {
      // Keys, gear and weapons are needed once however many quests use them; consumables add up.
      if (kind === 'plant' || kind === 'marker') e.count += count
      if (!e.quests.includes(quest)) e.quests.push(quest)
      e.optional = e.optional && optional
    } else {
      byKey.set(key, { kind, itemIds, questItemName, count: kind === 'plant' || kind === 'marker' ? count : 1, quests: [quest], optional })
    }
  }
  for (const mt of mapTasks) {
    const quest = mt.task.name
    for (const k of mt.keyIds) add('key', [k], 1, quest, false)
    for (const mo of mt.objectives) {
      const o = mo.objective
      const opt = o.optional
      for (const k of mo.keyIds) add('key', [k], 1, quest, opt)
      if (o.type === 'plantItem') add('plant', o.itemIds, o.count ?? 1, quest, opt)
      if (o.type === 'mark' && o.markerItemId) add('marker', [o.markerItemId], 1, quest, opt)
      if (o.type === 'plantQuestItem' && o.questItem) add('questItem', [], 1, quest, opt, o.questItem.name)
      if (o.type === 'shoot') {
        if (o.usingWeaponIds.length) add('weapon', o.usingWeaponIds, 1, quest, opt)
        if (o.wearingIds.length) {
          add('wear', o.wearingIds[0], 1, quest, opt)
          const e = [...byKey.values()].find((x) => x.kind === 'wear' && x.itemIds === o.wearingIds[0])
          if (e) e.otherOutfits = o.wearingIds.length - 1
        }
      }
    }
  }
  return [...byKey.values()].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || Number(a.optional) - Number(b.optional))
}
