import { describe, expect, it } from 'vitest'
import type { Barter } from '../api/barters'
import type { Item, ItemsById } from '../api/types'
import { fleaFee } from './economy'
import { barterRows, bestSale, categoryOptions, fleaSellPrice, flipRows, latestPriceUpdate, lootRows, sortRows, unlockState } from './moneyMakers'

const item = (id: string, over: Partial<Item> = {}): Item => ({
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
  basePrice: 1000,
  width: 1,
  height: 1,
  types: [],
  categories: [],
  sellToTrader: [],
  buyFromTrader: [],
  updated: null,
  ...over,
})

const PRAPOR = 'prapor'
const items: ItemsById = {
  bolts: item('bolts', { buyFromTrader: [{ traderId: PRAPOR, priceRUB: 5000, minTraderLevel: 1 }] }),
  nuts: item('nuts', { avg24hPrice: 3000 }),
  dogtag: item('dogtag'), // no price at all
  gun: item('gun', {
    width: 4,
    height: 2,
    sellToTrader: [{ traderId: PRAPOR, priceRUB: 20000 }],
    categories: ['weapon'],
    updated: '2026-10-07T10:00:00Z',
  }),
  ledx: item('ledx', { avg24hPrice: 900000, basePrice: 300000, categories: ['meds'], updated: '2026-10-07T11:00:00Z' }),
  junk: item('junk', { types: ['noFlea'], avg24hPrice: 99999, sellToTrader: [{ traderId: 'fence', priceRUB: 10 }] }),
  preset: item('preset', { types: ['preset'], avg24hPrice: 500000 }),
  ammo: item('ammo', {
    basePrice: 100,
    avg24hPrice: 900,
    lastLowPrice: 800,
    buyFromTrader: [
      { traderId: PRAPOR, priceRUB: 200, minTraderLevel: 2, buyLimit: 120, taskUnlock: null },
      { traderId: 'mechanic', priceRUB: 5000, minTraderLevel: 1 },
    ],
  }),
}

const ctx = { traderLevels: { [PRAPOR]: 1 }, completedTaskIds: new Set(['q1']) }

const barter = (id: string, inputs: [string, number][], output: string, over: Partial<Barter> = {}): Barter => ({
  id,
  traderId: PRAPOR,
  minTraderLevel: 1,
  taskUnlock: null,
  buyLimit: 5,
  inputs: inputs.map(([itemId, count]) => ({ itemId, count, minLevel: null })),
  output: { itemId: output, count: 1 },
  ...over,
})

describe('unlockState', () => {
  it('needs loyalty and the unlock task', () => {
    expect(unlockState(ctx, PRAPOR, 1, null).unlocked).toBe(true)
    expect(unlockState(ctx, PRAPOR, 2, null)).toEqual({ levelOk: false, taskOk: true, unlocked: false })
    expect(unlockState(ctx, PRAPOR, 1, 'q2')).toEqual({ levelOk: true, taskOk: false, unlocked: false })
    expect(unlockState(ctx, PRAPOR, 1, 'q1').unlocked).toBe(true)
    expect(unlockState(ctx, 'unknown', 1, null).unlocked).toBe(true) // missing level = 1
  })
})

describe('barterRows', () => {
  it('prices inputs at the cheapest source and the reward at its best sale', () => {
    const rows = barterRows([barter('b1', [['bolts', 1], ['nuts', 2]], 'gun')], items, ctx)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.cost).toBe(5000 + 2 * 3000)
    expect(r.value).toBe(20000)
    expect(r.valueVia).toBe('trader')
    expect(r.valueTraderId).toBe(PRAPOR)
    expect(r.profit).toBe(9000)
    expect(r.profitPct).toBeCloseTo((9000 / 11000) * 100)
    expect(r.unlocked).toBe(true)
  })

  it('leaves out barters with an unknown input price or an unsellable reward', () => {
    const rows = barterRows(
      [barter('b1', [['dogtag', 1]], 'gun'), barter('b2', [['nuts', 1]], 'dogtag'), barter('b3', [['nuts', 1]], 'missing')],
      items,
      ctx,
    )
    expect(rows).toEqual([])
  })

  it('flags locked barters and can value rewards at trader prices only', () => {
    const [locked] = barterRows([barter('b1', [['nuts', 1]], 'ledx', { minTraderLevel: 3 })], items, ctx)
    expect(locked.unlocked).toBe(false)
    expect(locked.valueVia).toBe('flea')
    // ledx has no trader buy-back, so with trader-only valuation the row disappears.
    expect(barterRows([barter('b1', [['nuts', 1]], 'ledx')], items, ctx, true)).toEqual([])
  })
})

describe('flips', () => {
  it('uses the lower of the 24 h average and the last low price', () => {
    expect(fleaSellPrice(items.ammo)).toBe(800)
    expect(fleaSellPrice(items.junk)).toBeNull()
    expect(fleaSellPrice(items.nuts)).toBe(3000)
  })

  it('lists profitable trader offers with fee, limit and lock state', () => {
    const rows = flipRows(items, ctx)
    expect(rows).toHaveLength(1) // the 5000 ₽ Mechanic offer loses money; presets and noFlea skipped
    const r = rows[0]
    const fee = fleaFee(100, 800, 1)
    expect(r.fee).toBe(fee)
    expect(r.profit).toBe(800 - fee - 200)
    expect(r.buyLimit).toBe(120)
    expect(r.profitPerRestock).toBe(r.profit * 120)
    expect(r.unlocked).toBe(false) // needs Prapor LL2
  })
})

describe('lootRows', () => {
  it('divides the best sale by the slots and skips presets and worthless items', () => {
    const rows = lootRows(items)
    const gun = rows.find((r) => r.item.id === 'gun')!
    expect(gun.slots).toBe(8)
    expect(gun.perSlot).toBe(2500)
    expect(rows.some((r) => r.item.id === 'preset')).toBe(false)
    expect(rows.some((r) => r.item.id === 'dogtag')).toBe(false)
    const junk = rows.find((r) => r.item.id === 'junk')!
    expect(junk.via).toBe('trader') // noFlea: trader only
    expect(junk.traderId).toBe('fence')
  })

  it('bestSale with traderOnly ignores the flea', () => {
    expect(bestSale(items.ledx, 1, true).via).toBeNull()
    expect(bestSale(items.ledx).via).toBe('flea')
  })
})

describe('helpers', () => {
  it('finds the newest price update', () => {
    expect(latestPriceUpdate(Object.values(items))).toBe(Date.parse('2026-10-07T11:00:00Z'))
    expect(latestPriceUpdate([])).toBeNull()
  })

  it('lists named categories with enough items', () => {
    expect(categoryOptions(Object.values(items), { weapon: 'Weapon', meds: 'Meds' }, 1)).toEqual([
      { id: 'meds', name: 'Meds', count: 1 },
      { id: 'weapon', name: 'Weapon', count: 1 },
    ])
  })

  it('sorts numbers and strings with nulls last', () => {
    const rows = [{ v: 2 }, { v: null }, { v: 5 }]
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.v)).toEqual([5, 2, null])
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.v)).toEqual([2, 5, null])
    expect(sortRows([{ s: 'b' }, { s: 'a' }], (r) => r.s, 'asc').map((r) => r.s)).toEqual(['a', 'b'])
  })
})
