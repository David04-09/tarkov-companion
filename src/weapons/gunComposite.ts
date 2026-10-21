/**
 * A picture of a modded gun made from the pictures of its parts, for builds that match no
 * ready-made preset (the game data only has pictures of the bare gun and of presets).
 *
 * tarkov.dev's 512 px pictures have transparent backgrounds and the same shape as the item's
 * inventory footprint (AK-74N receiver 4x1 cells is 512x130, a 2x1 stock 512x258), so inventory
 * cells work as a common scale. Guns point left in these pictures. Each fitted part gets a box
 * next to the part it sits on, chosen from its slot ("muzzle" at the front, "stock" at the back,
 * "magazine" underneath, "scope" on top…), and the boxes are drawn back to front. It is an
 * approximation: it only has to look decent, not match the game.
 */
import type { Item, ItemsById } from '../api/types'
import { slotsOf, type BuildParts } from '../lib/weaponBuild'

export interface Layer {
  id: string
  src: string
  /** Box in cells (x to the right, y down). */
  x: number
  y: number
  w: number
  h: number
  /** Draw order: lower first. */
  z: number
}

type Kind = 'muzzle' | 'barrel' | 'handguard' | 'gasblock' | 'stock' | 'grip' | 'magazine' | 'cover' | 'top' | 'sightRear' | 'sightFront' | 'side' | 'foregrip' | 'under' | 'hidden'

/** What a slot is, from its game name (mod_muzzle, mod_scope_001, mod_pistol_grip…). */
export function slotKind(nameId: string): Kind {
  const k = nameId.toLowerCase().replace(/^mod_/, '')
  if (/^muzzle/.test(k)) return 'muzzle'
  if (/^barrel/.test(k)) return 'barrel'
  if (/^handguard/.test(k)) return 'handguard'
  if (/^gas_block/.test(k)) return 'gasblock'
  if (/^stock/.test(k)) return 'stock'
  if (/^pistol_?grip/.test(k)) return 'grip'
  if (/^magazine/.test(k)) return 'magazine'
  if (/^rec(ie|ei)ver/.test(k)) return 'cover'
  if (/^sight_rear/.test(k)) return 'sightRear'
  if (/^sight_front/.test(k)) return 'sightFront'
  if (/^(scope|mount|sight|reflex|nvg)/.test(k)) return 'top'
  if (/^(tactical|flashlight|equipment)/.test(k)) return 'side'
  if (/^foregrip/.test(k)) return 'foregrip'
  if (/^(launcher|bipod)/.test(k)) return 'under'
  // Charging handles, hammers, triggers, catches: small and mostly inside the receiver.
  return 'hidden'
}

const Z: Record<Kind, number> = { stock: 1, barrel: 2, gasblock: 3, handguard: 4, cover: 5, magazine: 2, grip: 2, foregrip: 5, under: 5, muzzle: 3, top: 6, sightRear: 6, sightFront: 6, side: 7, hidden: 0 }

interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Where a part of size w x h goes on its parent box. `axis` is the bore line as a fraction of the
 * parent's height; `parent` is what the parent itself is (a handguard on a gas block runs back
 * towards the receiver, one on an upper receiver sticks out in front of it).
 */
function place(kind: Kind, parent: Kind | 'gun', p: Box, w: number, h: number, axis: number): Box | null {
  const boreY = p.y + p.h * axis
  switch (kind) {
    case 'muzzle':
      // On a gun picture that has its barrel (AK) or on a separate barrel (AR).
      return { x: p.x - w * (parent === 'gun' ? 0.6 : 0.15), y: boreY - h / 2, w, h }
    case 'barrel':
      return { x: p.x - w * 0.85, y: boreY - h / 2, w, h }
    case 'handguard':
      // A lower handguard half sits on its upper half (AR M4 Carbine Length); on a gas block (AK):
      // from the gas block back to the receiver; elsewhere (AR upper receiver): in front of it.
      if (parent === 'handguard') return { x: p.x + (p.w - w) / 2, y: p.y + (p.h - h) / 2, w, h }
      return parent === 'gasblock' ? { x: p.x + p.w * 0.45, y: boreY - h / 2, w, h } : { x: p.x - w * 0.75, y: boreY - h / 2, w, h }
    case 'gasblock':
      // A gun picture with the barrel in it (AK): partway along; on a separate barrel: near its front.
      return parent === 'gun' ? { x: p.x + p.w * 0.33 - w / 2, y: boreY - h / 2, w, h } : { x: p.x + p.w * 0.2 - w / 2, y: boreY - h / 2, w, h }
    case 'stock':
      return { x: p.x + p.w - w * 0.42, y: p.y + p.h * 0.02, w, h }
    case 'grip':
      return { x: p.x + p.w * 0.72 - w / 2, y: p.y + p.h * 0.5, w, h }
    case 'magazine':
      return { x: p.x + p.w * 0.55 - w / 2, y: p.y + p.h * 0.55, w, h }
    case 'cover':
      return { x: p.x + p.w * 0.72 - w / 2, y: p.y - h * 0.2, w, h }
    case 'top':
      return { x: p.x + p.w * 0.55 - w / 2, y: p.y - h * 0.7, w, h }
    case 'sightRear':
      // AK: on the receiver cover's front; AR: at the back of the upper receiver.
      return { x: p.x + p.w * (parent === 'gun' ? 0.45 : 0.85) - w / 2, y: p.y - h * 0.45, w, h }
    case 'sightFront':
      return { x: p.x + p.w * 0.08 - w / 2, y: p.y - h * 0.6, w, h }
    case 'side':
      return { x: p.x + p.w * 0.3 - w / 2, y: boreY - h / 2, w, h }
    case 'foregrip':
    case 'under':
      return { x: p.x + p.w * 0.4 - w / 2, y: p.y + p.h * 0.7, w, h }
    case 'hidden':
      return null
  }
}

/**
 * Inventory footprints overstate small parts (the AK-74N preset is 5 cells wide, yet its 4-cell
 * receiver plus 2-cell stock make 6): each kind is drawn at this share of its footprint,
 * measured against preset pictures.
 */
const SHRINK: Partial<Record<Kind, number>> = { muzzle: 0.5, gasblock: 0.45, handguard: 0.9, stock: 0.75, grip: 0.6, magazine: 0.6, cover: 0.8, sightRear: 0.45, sightFront: 0.45, top: 0.75, side: 0.55, foregrip: 0.6, under: 0.8 }

const picture = (it: Item | undefined) => it?.image512Link ?? null

/** The layers for a weapon and its fitted parts, or null when the weapon itself has no picture. */
export function gunLayers(weapon: Item, parts: BuildParts, items: ItemsById): Layer[] | null {
  const src = picture(weapon)
  if (!src) return null
  const root: Box = { x: 0, y: 0, w: Math.max(1, weapon.width), h: Math.max(1, weapon.height) }
  const layers: Layer[] = [{ id: weapon.id, src, ...root, z: 2 }]

  const walk = (owner: Item, ownerKind: Kind | 'gun', box: Box, level: BuildParts, depth: number) => {
    if (depth > 6) return
    for (const slot of slotsOf(owner)) {
      const node = level[slot.id]
      const item = node ? items[node.itemId] : undefined
      if (!node || !item) continue
      const kind = slotKind(slot.nameId)
      const s = SHRINK[kind] ?? 1
      // The bore runs along the upper part of a gun picture, through the middle of a part's.
      const at = place(kind, ownerKind, box, Math.max(0.5, item.width) * s, Math.max(0.5, item.height) * s, ownerKind === 'gun' ? 0.3 : 0.5)
      if (!at) continue
      const pic = picture(item)
      if (pic) layers.push({ id: `${node.itemId}:${slot.id}:${depth}`, src: pic, ...at, z: Z[kind] + depth * 0.1 })
      // Children sit on this part even when it has no picture of its own.
      walk(item, kind, at, node.slots, depth + 1)
    }
  }
  walk(weapon, 'gun', root, parts, 0)
  return layers.sort((a, b) => a.z - b.z)
}

/** The area all layers cover, for fitting the picture into its frame. */
export function layersBounds(layers: Layer[]): Box {
  const x = Math.min(...layers.map((l) => l.x))
  const y = Math.min(...layers.map((l) => l.y))
  return { x, y, w: Math.max(...layers.map((l) => l.x + l.w)) - x, h: Math.max(...layers.map((l) => l.y + l.h)) - y }
}
