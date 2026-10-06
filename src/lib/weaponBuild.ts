/**
 * Weapon builder logic (pure, no React): the slot tree of a build, stat totals,
 * part conflicts and loading tarkov.dev presets into a tree.
 *
 * Stat rules (checked against every weapon preset in the PvE items doc on
 * 2026-10-07: 398 of 399 presets match tarkov.dev's own preset stats exactly):
 *   ergonomics = weapon ergonomics + Σ part ergonomics   (not rounded, e.g. 66.5)
 *   recoil     = round(weapon recoil × (1 + Σ part recoilModifier))
 *                recoilModifier is a fraction: -0.2 = 20 % less recoil.
 *   weight     = weapon weight + Σ part weights (rounds in the magazine not counted)
 */
import type { Item, ItemsById, ModSlot } from '../api/types'

/** One installed part and the parts installed in its own slots (keyed by slot id). */
export interface BuildNode {
  itemId: string
  slots: BuildParts
}

/** Installed parts keyed by slot id (the weapon's slots at the top level). */
export type BuildParts = Record<string, BuildNode>

/** A path from the weapon down to a slot: slot ids, outermost first. */
export type SlotPath = string[]

// ---------------------------------------------------------------------------
// Slot names
// ---------------------------------------------------------------------------

const SLOT_NAMES: Record<string, string> = {
  pistol_grip: 'Pistol grip',
  pistolgrip: 'Pistol grip',
  pistol_grip_akms: 'Pistol grip',
  stock: 'Stock',
  stock_akms: 'Stock',
  stock_axis: 'Stock',
  magazine: 'Magazine',
  reciever: 'Receiver',
  receiver: 'Receiver',
  charge: 'Charging handle',
  barrel: 'Barrel',
  handguard: 'Handguard',
  mount: 'Mount',
  muzzle: 'Muzzle device',
  scope: 'Sight',
  sight_rear: 'Rear sight',
  sight_front: 'Front sight',
  tactical: 'Tactical device',
  gas_block: 'Gas block',
  launcher: 'Under-barrel launcher',
  foregrip: 'Foregrip',
  equipment: 'Equipment',
  flashlight: 'Flashlight',
  bipod: 'Bipod',
  nvg: 'Night vision mount',
  trigger: 'Trigger',
  hammer: 'Hammer',
  catch: 'Bolt catch',
}

/** "mod_pistol_grip" -> "Pistol grip", "mod_mount_001" -> "Mount", "mod_tactical_2" -> "Tactical device". */
export function slotLabel(nameId: string): string {
  let key = nameId.toLowerCase().replace(/^mod_/, '')
  if (SLOT_NAMES[key]) return SLOT_NAMES[key]
  key = key.replace(/_?\d+$/, '')
  if (SLOT_NAMES[key]) return SLOT_NAMES[key]
  const words = key.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : nameId
}

/** Labels for the slots of one item; repeated names get numbers ("Mount 1", "Mount 2"). */
export function slotLabels(slots: ModSlot[]): Record<string, string> {
  const counts: Record<string, number> = {}
  for (const s of slots) {
    const l = slotLabel(s.nameId)
    counts[l] = (counts[l] ?? 0) + 1
  }
  const seen: Record<string, number> = {}
  const out: Record<string, string> = {}
  for (const s of slots) {
    const l = slotLabel(s.nameId)
    if (counts[l] > 1) {
      seen[l] = (seen[l] ?? 0) + 1
      out[s.id] = `${l} ${seen[l]}`
    } else out[s.id] = l
  }
  return out
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

/** Slots of a weapon or part (empty for anything else). */
export function slotsOf(item: Item | undefined): ModSlot[] {
  return item?.weapon?.slots ?? item?.mod?.slots ?? []
}

/** Parts allowed in a slot that the app knows as weapon parts. */
export function slotCandidates(slot: ModSlot, items: ItemsById): Item[] {
  const out: Item[] = []
  for (const id of slot.allowed) {
    const it = items[id]
    if (it?.mod) out.push(it)
  }
  return out
}

export function getNode(parts: BuildParts, path: SlotPath): BuildNode | undefined {
  let level = parts
  let node: BuildNode | undefined
  for (const slotId of path) {
    node = level[slotId]
    if (!node) return undefined
    level = node.slots
  }
  return node
}

/** Every item id installed in the tree (or below one node), outer parts first. */
export function installedIds(parts: BuildParts): string[] {
  const out: string[] = []
  const walk = (level: BuildParts) => {
    for (const node of Object.values(level)) {
      out.push(node.itemId)
      walk(node.slots)
    }
  }
  walk(parts)
  return out
}

export function countParts(parts: BuildParts): number {
  return installedIds(parts).length
}

export interface FlatSlot {
  path: SlotPath
  slot: ModSlot
  label: string
  depth: number
  /** The item this slot belongs to (weapon or part). */
  owner: Item
  node: BuildNode | undefined
  item: Item | undefined
}

/** The slot tree in display order: each slot, then the slots of the part in it. */
export function flattenBuild(weapon: Item, parts: BuildParts, items: ItemsById): FlatSlot[] {
  const out: FlatSlot[] = []
  const walk = (owner: Item, level: BuildParts, prefix: SlotPath, depth: number) => {
    const slots = slotsOf(owner)
    const labels = slotLabels(slots)
    for (const slot of slots) {
      const node = level[slot.id]
      const item = node ? items[node.itemId] : undefined
      const path = [...prefix, slot.id]
      out.push({ path, slot, label: labels[slot.id], depth, owner, node, item })
      if (node && item) walk(item, node.slots, path, depth + 1)
    }
  }
  walk(weapon, parts, [], 0)
  return out
}

/**
 * Puts `itemId` into the slot at `path` (null empties it). Parts that were on
 * the old part stay when the new one has the same slot and accepts them.
 */
export function setPart(parts: BuildParts, path: SlotPath, itemId: string | null, items: ItemsById): BuildParts {
  if (!path.length) return parts
  const [head, ...rest] = path
  const next: BuildParts = { ...parts }
  if (rest.length) {
    const node = parts[head]
    if (!node) return parts
    next[head] = { ...node, slots: setPart(node.slots, rest, itemId, items) }
    return next
  }
  if (itemId == null) {
    delete next[head]
    return next
  }
  const old = parts[head]
  const kept: BuildParts = {}
  if (old && old.itemId !== itemId) {
    for (const slot of slotsOf(items[itemId])) {
      const child = old.slots[slot.id]
      if (child && slot.allowed.includes(child.itemId)) kept[slot.id] = child
    }
  } else if (old) {
    Object.assign(kept, old.slots)
  }
  next[head] = { itemId, slots: kept }
  return next
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

function conflictsOf(item: Item | undefined): string[] {
  return item?.mod?.conflicts ?? item?.weapon?.conflicts ?? []
}

/** True when either item lists the other as incompatible. */
export function itemsConflict(a: Item | undefined, b: Item | undefined): boolean {
  if (!a || !b) return false
  return conflictsOf(a).includes(b.id) || conflictsOf(b).includes(a.id)
}

/**
 * The installed item that `candidateId` cannot be fitted with, or null.
 * `ignore` = ids being replaced (the slot's current part and everything on it).
 */
export function findConflict(candidateId: string, installed: string[], items: ItemsById, ignore: ReadonlySet<string> = new Set()): Item | null {
  const cand = items[candidateId]
  if (!cand) return null
  for (const id of installed) {
    if (ignore.has(id)) continue
    const other = items[id]
    if (itemsConflict(cand, other)) return other ?? null
  }
  return null
}

/** Pairs of installed parts that cannot be used together. */
export function buildConflicts(weapon: Item, parts: BuildParts, items: ItemsById): [Item, Item][] {
  const ids = [weapon.id, ...installedIds(parts)]
  const out: [Item, Item][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = items[ids[i]]
      const b = items[ids[j]]
      if (a && b && itemsConflict(a, b)) out.push([a, b])
    }
  }
  return out
}

/** Required slots that are empty (only on parts that are installed). */
export function missingRequired(weapon: Item, parts: BuildParts, items: ItemsById): FlatSlot[] {
  return flattenBuild(weapon, parts, items).filter((f) => f.slot.required && !f.node)
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface BuildTotals {
  ergonomics: number
  recoilVertical: number
  recoilHorizontal: number
  /** Σ recoilModifier as a fraction (-0.35 = 35 % less recoil). */
  recoilModifier: number
  accuracyModifier: number
  /** kg. */
  weight: number
  /** Cheapest price of the weapon plus every part that has one. */
  cost: number
  /** Weapon/parts without a trader or flea price (cost leaves them out). */
  unpriced: Item[]
  partCount: number
}

export function buildTotals(
  weapon: Item,
  parts: BuildParts,
  items: ItemsById,
  priceOf: (item: Item) => number | null,
): BuildTotals {
  const w = weapon.weapon
  let ergonomics = w?.ergonomics ?? 0
  let recoilModifier = 0
  let accuracyModifier = 0
  let weight = w?.weight ?? 0
  let cost = 0
  const unpriced: Item[] = []
  const addPrice = (it: Item) => {
    const p = priceOf(it)
    if (p == null) unpriced.push(it)
    else cost += p
  }
  addPrice(weapon)
  const ids = installedIds(parts)
  for (const id of ids) {
    const it = items[id]
    if (!it) continue
    const m = it.mod
    if (m) {
      ergonomics += m.ergonomics
      recoilModifier += m.recoilModifier
      accuracyModifier += m.accuracyModifier
      weight += m.weight
    }
    addPrice(it)
  }
  return {
    ergonomics: Math.round(ergonomics * 100) / 100,
    recoilVertical: Math.round((w?.recoilVertical ?? 0) * (1 + recoilModifier)),
    recoilHorizontal: Math.round((w?.recoilHorizontal ?? 0) * (1 + recoilModifier)),
    recoilModifier,
    accuracyModifier,
    weight: Math.round(weight * 1000) / 1000,
    cost,
    unpriced,
    partCount: ids.length,
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

interface OpenSlot {
  slot: ModSlot
  path: SlotPath
}

interface Placement {
  assign: [SlotPath, string][]
  left: string[]
}

/** Search budget for presetToBuild; past it, the first fitting part is taken. */
const PLACEMENT_BUDGET = 20000

/**
 * tarkov.dev lists a preset's parts as a flat list; this fits them into the
 * weapon's slot tree. A small search tries the parts that fit each slot (and
 * leaving it empty) and keeps the arrangement that places the most parts: a
 * plain "first slot wins" puts e.g. a sight mount on the receiver when the
 * preset has a scope there and the mount on the handguard.
 * `unplaced` = parts that found no free slot (loaded rounds are skipped).
 */
export function presetToBuild(preset: Item, items: ItemsById): { parts: BuildParts; unplaced: Item[] } {
  const info = preset.preset
  const weapon = info ? items[info.baseItem] : undefined
  if (!info || !weapon) return { parts: {}, unplaced: [] }
  let budget = PLACEMENT_BUDGET
  const open = (owner: Item, prefix: SlotPath): OpenSlot[] => slotsOf(owner).map((slot) => ({ slot, path: [...prefix, slot.id] }))

  const solve = (queue: OpenSlot[], remaining: string[]): Placement => {
    if (!queue.length || !remaining.length) return { assign: [], left: remaining }
    budget--
    const [first, ...rest] = queue
    const fits = [...new Set(remaining.filter((id) => first.slot.allowed.includes(id)))]
    let best: Placement | null = null
    for (const id of fits) {
      const left = [...remaining]
      left.splice(left.indexOf(id), 1)
      const it = items[id]
      const sub = solve(it ? [...open(it, first.path), ...rest] : rest, left)
      if (!best || sub.left.length < best.left.length) {
        best = { assign: [[first.path, id], ...sub.assign], left: sub.left }
      }
      if (best.left.length === 0 || budget <= 0) return best
    }
    const skip = solve(rest, remaining)
    if (!best || skip.left.length < best.left.length) best = skip
    return best
  }

  const { assign, left } = solve(open(weapon, []), info.parts.filter((id) => items[id]?.mod))
  let parts: BuildParts = {}
  for (const [path, id] of [...assign].sort((a, b) => a[0].length - b[0].length)) parts = setPart(parts, path, id, items)
  return { parts, unplaced: left.map((id) => items[id]).filter((it): it is Item => it != null) }
}

/** Presets of a weapon, the default one first. */
export function weaponPresets(weapon: Item, items: ItemsById): Item[] {
  const ids = weapon.weapon?.presets ?? []
  const def = weapon.weapon?.defaultPreset
  const list = ids.map((id) => items[id]).filter((it): it is Item => it?.preset?.baseItem === weapon.id)
  return list.sort((a, b) => Number(b.id === def) - Number(a.id === def) || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Text export
// ---------------------------------------------------------------------------

export function formatErgo(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/** "-0.2" -> "-20%". */
export function formatPercent(fraction: number): string {
  const pct = Math.round(fraction * 1000) / 10
  if (pct === 0) return '0%'
  return `${pct > 0 ? '+' : ''}${pct}%`
}

/** Plain-text summary of a build for the clipboard. */
export function buildAsText(
  title: string,
  weapon: Item,
  parts: BuildParts,
  items: ItemsById,
  totals: BuildTotals,
  formatPrice: (n: number) => string,
): string {
  const lines = [title, `Weapon: ${weapon.name}`]
  for (const f of flattenBuild(weapon, parts, items)) {
    if (!f.item) continue
    lines.push(`${'  '.repeat(f.depth + 1)}${f.label}: ${f.item.name}`)
  }
  lines.push(
    '',
    `Ergonomics: ${formatErgo(totals.ergonomics)}`,
    `Recoil: ${totals.recoilVertical} vertical / ${totals.recoilHorizontal} horizontal (${formatPercent(totals.recoilModifier)})`,
    `Weight: ${totals.weight.toFixed(2)} kg`,
    `Cost: ${formatPrice(totals.cost)}${totals.unpriced.length ? ` (+ ${totals.unpriced.length} part(s) with no price)` : ''}`,
  )
  return lines.join('\n')
}
