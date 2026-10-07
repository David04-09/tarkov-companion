import { describe, expect, it } from 'vitest'
import type { Item, ItemsById, ModSlot } from '../api/types'
import {
  buildAsText,
  buildConflicts,
  buildTotals,
  findConflict,
  flattenBuild,
  installedIds,
  arrangeSlots,
  matchingPreset,
  missingRequired,
  partOptions,
  slotSide,
  presetToBuild,
  setPart,
  slotLabel,
  slotLabels,
  type BuildParts,
} from './weaponBuild'

function base(id: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    name: id,
    shortName: id,
    normalizedName: id,
    iconLink: null,
    wikiLink: null,
    avg24hPrice: null,
    lastLowPrice: null,
    low24hPrice: null,
    high24hPrice: null,
    changeLast48hPercent: null,
    basePrice: 0,
    width: 1,
    height: 1,
    types: [],
    categories: [],
    sellToTrader: [],
    buyFromTrader: [],
    updated: null,
    ...extra,
  }
}

const slot = (id: string, nameId: string, allowed: string[], required = false): ModSlot => ({ id, nameId, required, allowed })

function mod(id: string, ergonomics: number, recoilModifier: number, weight: number, slots: ModSlot[] = [], conflicts: string[] = [], price: number | null = 1000): Item {
  return base(id, {
    avg24hPrice: price,
    mod: { ergonomics, recoilModifier, accuracyModifier: 0, weight, slots, conflicts },
  })
}

// Rifle: grip (required), handguard (has a foregrip slot), magazine.
const rifle = base('rifle', {
  avg24hPrice: 20000,
  weapon: {
    caliber: 'Caliber556x45NATO',
    ergonomics: 48,
    recoilVertical: 119,
    recoilHorizontal: 342,
    fireRate: 800,
    effectiveDistance: 500,
    fireModes: ['single'],
    weight: 1.5,
    slots: [
      slot('s-grip', 'mod_pistol_grip', ['grip', 'grip2'], true),
      slot('s-hg', 'mod_handguard', ['hg', 'hg2']),
      slot('s-mag', 'mod_magazine', ['mag']),
    ],
    defaultPreset: 'preset',
    presets: ['preset'],
    conflicts: [],
  },
})

const items: ItemsById = {
  rifle,
  grip: mod('grip', 8, -0.05, 0.1),
  grip2: mod('grip2', 10, 0, 0.12, [], ['fg']),
  hg: mod('hg', 5, -0.02, 0.3, [slot('s-fg', 'mod_foregrip', ['fg']), slot('s-m0', 'mod_mount_000', ['fg']), slot('s-m1', 'mod_mount_001', ['fg'])]),
  hg2: mod('hg2', 3, 0, 0.4, [slot('s-fg', 'mod_foregrip', ['fg'])]),
  fg: mod('fg', 2.5, -0.03, 0.05, [], [], null),
  mag: mod('mag', -1, 0, 0.1),
  round: base('round'),
  preset: base('preset', {
    preset: { baseItem: 'rifle', parts: ['grip', 'mag', 'round', 'hg', 'fg'], ergonomics: 62.5, recoilVertical: 107, recoilHorizontal: 308, isDefault: true },
  }),
}

const price = (it: Item) => it.avg24hPrice

describe('slot names', () => {
  it('reads the game ids', () => {
    expect(slotLabel('mod_pistol_grip')).toBe('Pistol grip')
    expect(slotLabel('mod_mount_001')).toBe('Mount')
    expect(slotLabel('mod_tactical_2')).toBe('Tactical device')
    expect(slotLabel('mod_reciever')).toBe('Receiver')
    expect(slotLabel('mod_something_new')).toBe('Something new')
  })
  it('numbers repeated names', () => {
    const labels = slotLabels(items.hg.mod!.slots)
    expect(labels).toEqual({ 's-fg': 'Foregrip', 's-m0': 'Mount 1', 's-m1': 'Mount 2' })
  })
})

describe('presets and totals', () => {
  it('fits a flat preset into the slot tree and skips rounds', () => {
    const { parts, unplaced } = presetToBuild(items.preset, items)
    expect(unplaced).toEqual([])
    expect(parts['s-grip'].itemId).toBe('grip')
    expect(parts['s-hg'].slots['s-fg'].itemId).toBe('fg')
    expect(installedIds(parts).sort()).toEqual(['fg', 'grip', 'hg', 'mag'])
  })

  it('matches the preset stats (sum ergonomics, multiply recoil)', () => {
    const { parts } = presetToBuild(items.preset, items)
    const t = buildTotals(rifle, parts, items, price)
    // 48 + 8 + 5 + 2.5 - 1
    expect(t.ergonomics).toBe(62.5)
    // 119 × (1 - 0.10) = 107.1, 342 × 0.9 = 307.8
    expect(t.recoilVertical).toBe(107)
    expect(t.recoilHorizontal).toBe(308)
    expect(t.weight).toBeCloseTo(2.05)
    expect(t.cost).toBe(23000)
    expect(t.unpriced.map((i) => i.id)).toEqual(['fg'])
    expect(t.partCount).toBe(4)
  })
})

describe('editing', () => {
  it('keeps compatible child parts when a part is swapped', () => {
    let parts: BuildParts = presetToBuild(items.preset, items).parts
    parts = setPart(parts, ['s-hg'], 'hg2', items)
    expect(parts['s-hg'].itemId).toBe('hg2')
    expect(parts['s-hg'].slots['s-fg'].itemId).toBe('fg')
    parts = setPart(parts, ['s-hg', 's-fg'], null, items)
    expect(parts['s-hg'].slots).toEqual({})
  })

  it('lists the tree and empty required slots', () => {
    const parts = setPart({}, ['s-hg'], 'hg', items)
    const flat = flattenBuild(rifle, parts, items)
    expect(flat.map((f) => `${f.depth}:${f.label}`)).toEqual(['0:Pistol grip', '0:Handguard', '1:Foregrip', '1:Mount 1', '1:Mount 2', '0:Magazine'])
    expect(missingRequired(rifle, parts, items).map((f) => f.label)).toEqual(['Pistol grip'])
  })

  it('flags conflicting parts both ways', () => {
    const parts = setPart(setPart({}, ['s-hg'], 'hg', items), ['s-hg', 's-fg'], 'fg', items)
    expect(findConflict('grip2', installedIds(parts), items)?.id).toBe('fg')
    // Replacing the handguard (and the foregrip on it) removes the conflict.
    expect(findConflict('grip2', installedIds(parts), items, new Set(['hg', 'fg']))).toBeNull()
    const bad = setPart(parts, ['s-grip'], 'grip2', items)
    expect(buildConflicts(rifle, bad, items).map(([a, b]) => `${a.id}/${b.id}`)).toEqual(['fg/grip2'])
  })

  it('writes a text summary', () => {
    const { parts } = presetToBuild(items.preset, items)
    const t = buildTotals(rifle, parts, items, price)
    const text = buildAsText('Test', rifle, parts, items, t, (n) => `${n} RUB`)
    expect(text).toContain('  Pistol grip: grip')
    expect(text).toContain('    Foregrip: fg')
    expect(text).toContain('Ergonomics: 62.5')
    expect(text).toContain('(-10%)')
  })
})

describe('preset placement search', () => {
  it('does not let a mount steal the slot the preset gives to a scope', () => {
    // Top rail takes a mount or a scope; the mount (with its own sight slot) belongs on the side rail.
    const gun = base('gun', {
      weapon: { ...rifle.weapon!, slots: [slot('top', 'mod_scope', ['mount', 'scope']), slot('side', 'mod_mount', ['mount'])], presets: [], defaultPreset: null },
    })
    const set: ItemsById = {
      gun,
      mount: mod('mount', 0, 0, 0.1, [slot('m-sight', 'mod_scope', ['dot'])]),
      dot: mod('dot', 0, 0, 0.1),
      scope: mod('scope', -10, 0, 0.5),
      p: base('p', { preset: { baseItem: 'gun', parts: ['mount', 'dot', 'scope'], ergonomics: 38, recoilVertical: 119, recoilHorizontal: 342, isDefault: false } }),
    }
    const { parts, unplaced } = presetToBuild(set.p, set)
    expect(unplaced).toEqual([])
    expect(parts.top.itemId).toBe('scope')
    expect(parts.side.slots['m-sight'].itemId).toBe('dot')
  })
})

describe('modding view helpers', () => {
  it('finds the preset that has exactly the installed parts', () => {
    const { parts } = presetToBuild(items.preset, items)
    expect(matchingPreset(rifle, parts, items)?.id).toBe('preset')
    expect(matchingPreset(rifle, setPart(parts, ['s-mag'], null, items), items)).toBeNull()
  })

  it('lists parts for a slot with conflicts last and the replaced part ignored', () => {
    const parts = setPart(setPart({}, ['s-hg'], 'hg', items), ['s-hg', 's-fg'], 'fg', items)
    const installed = ['rifle', ...installedIds(parts)]
    const grips = partOptions(rifle.weapon!.slots[0], undefined, installed, items, price, '', 'ergonomics')
    expect(grips.map((o) => `${o.item.id}:${o.conflict?.id ?? ''}`)).toEqual(['grip:', 'grip2:fg'])
    const hgs = partOptions(rifle.weapon!.slots[1], parts['s-hg'], installed, items, price, 'hg2', 'name')
    expect(hgs.map((o) => o.item.id)).toEqual(['hg2'])
  })

  it('puts slots around the picture like the game', () => {
    expect(slotSide('mod_muzzle')).toBe('left')
    expect(slotSide('mod_stock_001')).toBe('right')
    expect(slotSide('mod_magazine')).toBe('bottom')
    expect(slotSide('mod_scope_000')).toBe('top')
    const many = ['mod_muzzle', 'mod_barrel', 'mod_gas_block', 'mod_handguard', 'mod_launcher', 'mod_pistol_grip'].map((n, i) => slot(`x${i}`, n, []))
    const sides = arrangeSlots(many)
    expect(sides.left.map((s) => s.nameId)).toEqual(['mod_muzzle', 'mod_barrel', 'mod_gas_block'])
    expect(sides.right.map((s) => s.nameId)).toEqual(['mod_pistol_grip'])
    expect(sides.bottom.map((s) => s.nameId)).toEqual(['mod_handguard', 'mod_launcher'])
    expect(Object.values(sides).flat()).toHaveLength(many.length)
  })
})
