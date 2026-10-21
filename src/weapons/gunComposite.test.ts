import { describe, expect, it } from 'vitest'
import type { Item, ItemsById } from '../api/types'
import { partScore } from '../lib/weaponBuild'
import { gunLayers, slotKind } from './gunComposite'

const slot = (id: string, nameId: string) => ({ id, nameId, required: false, allowed: [] })
const part = (id: string, w: number, h: number, ergonomics = 0, recoilModifier = 0, slots: ReturnType<typeof slot>[] = []): Item =>
  ({ id, name: id, shortName: id, width: w, height: h, image512Link: `https://x/${id}.webp`, mod: { ergonomics, recoilModifier, weight: 0, slots } }) as unknown as Item

const gun = {
  id: 'gun',
  name: 'gun',
  shortName: 'gun',
  width: 4,
  height: 1,
  image512Link: 'https://x/gun.webp',
  weapon: { slots: [slot('s-muzzle', 'mod_muzzle'), slot('s-stock', 'mod_stock'), slot('s-mag', 'mod_magazine'), slot('s-scope', 'mod_scope'), slot('s-hammer', 'mod_hammer')] },
} as unknown as Item
const items: ItemsById = {
  gun,
  brake: part('brake', 1, 1),
  stock: part('stock', 2, 1),
  mag: part('mag', 1, 2),
  scope: part('scope', 2, 1),
  hammer: part('hammer', 1, 1),
}
const parts = {
  's-muzzle': { itemId: 'brake', slots: {} },
  's-stock': { itemId: 'stock', slots: {} },
  's-mag': { itemId: 'mag', slots: {} },
  's-scope': { itemId: 'scope', slots: {} },
  's-hammer': { itemId: 'hammer', slots: {} },
}

describe('gunLayers', () => {
  it('puts each part on its side of the gun (the muzzle points left)', () => {
    const layers = gunLayers(gun, parts, items) ?? []
    const at = (id: string) => layers.find((l) => l.src.endsWith(`/${id}.webp`))
    const g = at('gun')!
    expect(at('brake')!.x).toBeLessThan(g.x)
    expect(at('stock')!.x + at('stock')!.w).toBeGreaterThan(g.x + g.w)
    expect(at('mag')!.y).toBeGreaterThan(g.y)
    expect(at('scope')!.y).toBeLessThan(g.y)
    // Small inner parts are left out of the picture.
    expect(at('hammer')).toBeUndefined()
  })

  it('needs a picture of the gun itself', () => {
    expect(gunLayers({ ...gun, image512Link: undefined } as Item, parts, items)).toBeNull()
  })

  it('knows slots by their game names', () => {
    expect(slotKind('mod_muzzle_000')).toBe('muzzle')
    expect(slotKind('mod_reciever')).toBe('cover')
    expect(slotKind('mod_pistol_grip_akms')).toBe('grip')
    expect(slotKind('mod_charge')).toBe('hidden')
  })
})

describe('partScore', () => {
  it('ranks less recoil first, then ergonomics', () => {
    const suppressor = part('sup', 1, 1, -18, -0.07)
    const brake = part('brk', 1, 1, -2, -0.09)
    const lightGrip = part('grip', 1, 1, 8, 0)
    const mount = part('mount', 1, 1)
    const ranked = [mount, lightGrip, suppressor, brake].sort((a, b) => partScore(b) - partScore(a)).map((p) => p.id)
    expect(ranked).toEqual(['brk', 'grip', 'mount', 'sup'])
  })
})
