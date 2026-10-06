import { describe, expect, it } from 'vitest'
import type { AmmoStats } from '../api/types'
import {
  armorVerdict,
  bestArmorClass,
  caliberGroup,
  caliberLabel,
  formatModifier,
  groupCalibers,
  guessCaliberLabel,
  shotDamage,
  sortAmmo,
  type AmmoItem,
} from './ammo'

function ammo(name: string, caliber: string, pen: number, damage: number, extra: Partial<AmmoStats> = {}): AmmoItem {
  return {
    id: name,
    name,
    shortName: name,
    normalizedName: name,
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
    types: ['ammo'],
    categories: [],
    sellToTrader: [],
    buyFromTrader: [],
    updated: null,
    ammo: {
      caliber,
      ammoType: 'bullet',
      damage,
      projectileCount: 1,
      penetrationPower: pen,
      armorDamage: 50,
      fragmentationChance: 0,
      ricochetChance: 0,
      initialSpeed: 800,
      tracer: false,
      tracerColor: null,
      accuracyModifier: 0,
      recoilModifier: 0,
      lightBleedModifier: 0,
      heavyBleedModifier: 0,
      ...extra,
    },
  }
}

describe('calibre names', () => {
  it('uses the known table', () => {
    expect(caliberLabel('Caliber556x45NATO')).toBe('5.56x45 mm NATO')
    expect(caliberLabel('Caliber762x35')).toBe('.300 Blackout')
    expect(caliberGroup('Caliber12g')).toBe('Shotgun')
    expect(caliberGroup('Caliber86x70')).toBe('Marksman and sniper')
  })
  it('guesses unknown ids', () => {
    expect(guessCaliberLabel('Caliber556x45')).toBe('5.56x45 mm')
    expect(guessCaliberLabel('Caliber9x18')).toBe('9x18 mm')
    expect(guessCaliberLabel('Caliber127x108')).toBe('12.7x108 mm')
    expect(guessCaliberLabel('Caliber65x39')).toBe('6.5x39 mm')
    expect(guessCaliberLabel('CaliberWeird')).toBe('Weird')
    expect(caliberGroup('CaliberNew')).toBe('Grenade and special')
  })
  it('groups and sorts calibres, skipping empty groups', () => {
    const groups = groupCalibers(['Caliber762x39', 'Caliber545x39', 'Caliber12g', 'Caliber545x39'])
    expect(groups.map((g) => g.group)).toEqual(['Rifle', 'Shotgun'])
    expect(groups[0].calibers.map((c) => c.id)).toEqual(['Caliber545x39', 'Caliber762x39'])
  })
})

describe('armour rule of thumb', () => {
  it('is good at 10 x class or more', () => {
    expect(armorVerdict(40, 4)).toBe('good')
    expect(armorVerdict(54, 5)).toBe('good')
  })
  it('is partial within 10 below', () => {
    expect(armorVerdict(39, 4)).toBe('partial')
    expect(armorVerdict(30, 4)).toBe('partial')
  })
  it('is poor further below', () => {
    expect(armorVerdict(29, 4)).toBe('poor')
    expect(armorVerdict(3, 2)).toBe('poor')
  })
  it('finds the best class', () => {
    expect(bestArmorClass(44)).toBe(4)
    expect(bestArmorClass(79)).toBe(6)
    expect(bestArmorClass(5)).toBe(0)
  })
})

describe('sorting and formatting', () => {
  const rows = [
    { item: ammo('B', 'Caliber545x39', 45, 50), price: 300 },
    { item: ammo('A', 'Caliber545x39', 20, 60), price: null },
    { item: ammo('C', 'Caliber12g', 3, 39, { projectileCount: 8 }), price: 100 },
  ]
  it('sorts by penetration both ways', () => {
    expect(sortAmmo(rows, 'penetration', 'desc').map((r) => r.item.name)).toEqual(['B', 'A', 'C'])
    expect(sortAmmo(rows, 'penetration', 'asc').map((r) => r.item.name)).toEqual(['C', 'A', 'B'])
  })
  it('uses total shot damage for buckshot', () => {
    expect(shotDamage(rows[2].item.ammo)).toBe(312)
    expect(sortAmmo(rows, 'damage', 'desc')[0].item.name).toBe('C')
  })
  it('puts missing prices last in either direction', () => {
    expect(sortAmmo(rows, 'price', 'asc').map((r) => r.item.name)).toEqual(['C', 'B', 'A'])
    expect(sortAmmo(rows, 'price', 'desc').map((r) => r.item.name)).toEqual(['B', 'C', 'A'])
  })
  it('formats modifiers', () => {
    expect(formatModifier(0.05)).toBe('+5 %')
    expect(formatModifier(-0.1)).toBe('−10 %')
    expect(formatModifier(0)).toBe('0')
  })
})
