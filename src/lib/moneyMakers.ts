/**
 * Money makers: pure computations behind the Money page (barter profits,
 * trader -> flea flips, loot value per inventory slot). Information only.
 */
import type { Barter } from '../api/barters'
import type { Item, ItemsById } from '../api/types'
import { acquireCost, fleaFee, sellValue } from './economy'

export interface UnlockContext {
  /** Player's loyalty level per trader id (missing = 1). */
  traderLevels: Record<string, number>
  completedTaskIds: ReadonlySet<string>
}

export interface UnlockState {
  /** Loyalty level is high enough. */
  levelOk: boolean
  /** The unlock task (if any) is completed. */
  taskOk: boolean
  unlocked: boolean
}

export function unlockState(ctx: UnlockContext, traderId: string, minLevel: number, taskId: string | null): UnlockState {
  const levelOk = (ctx.traderLevels[traderId] ?? 1) >= minLevel
  const taskOk = !taskId || ctx.completedTaskIds.has(taskId)
  return { levelOk, taskOk, unlocked: levelOk && taskOk }
}

/** Assembled weapons ("presets") have flea/trader numbers that don't describe a single lootable item. */
const isPreset = (item: Item) => item.types.includes('preset')

/** Best sale of `count` units; `traderOnly` ignores the flea (e.g. items that are not found in raid). */
export function bestSale(
  item: Item | undefined,
  count = 1,
  traderOnly = false,
): { total: number; via: 'flea' | 'trader' | null; traderId: string | null } {
  if (!item) return { total: 0, via: null, traderId: null }
  const traderId = item.sellToTrader[0]?.traderId ?? null
  if (traderOnly) {
    const total = (item.sellToTrader[0]?.priceRUB ?? 0) * count
    return { total, via: total > 0 ? 'trader' : null, traderId: total > 0 ? traderId : null }
  }
  const s = sellValue(item, count)
  return { total: s.total, via: s.via, traderId: s.via === 'trader' ? traderId : null }
}

// ---------------------------------------------------------------------------
// Barters
// ---------------------------------------------------------------------------

export interface BarterRow extends UnlockState {
  barter: Barter
  outputItem: Item
  /** Cheapest way to buy every required item (flea average or trader). */
  cost: number
  value: number
  valueVia: 'flea' | 'trader'
  valueTraderId: string | null
  profit: number
  /** Profit as a percentage of the cost. */
  profitPct: number
}

/**
 * One row per barter whose inputs and reward all have a known price.
 * Barters with an unknown input price or a reward that sells for nothing are left out.
 */
export function barterRows(barters: Barter[], items: ItemsById, ctx: UnlockContext, traderOnly = false): BarterRow[] {
  const out: BarterRow[] = []
  for (const b of barters) {
    const outputItem = items[b.output.itemId]
    if (!outputItem || b.inputs.length === 0) continue
    let cost = 0
    let known = true
    for (const inp of b.inputs) {
      const c = acquireCost(items[inp.itemId])
      if (c == null || c <= 0) {
        known = false
        break
      }
      cost += c * inp.count
    }
    if (!known || cost <= 0) continue
    const sale = bestSale(outputItem, b.output.count, traderOnly)
    if (!sale.via || sale.total <= 0) continue
    const profit = sale.total - cost
    out.push({
      barter: b,
      outputItem,
      cost,
      value: sale.total,
      valueVia: sale.via,
      valueTraderId: sale.traderId,
      profit,
      profitPct: (profit / cost) * 100,
      ...unlockState(ctx, b.traderId, b.minTraderLevel, b.taskUnlock),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Trader -> flea flips
// ---------------------------------------------------------------------------

/**
 * A cautious flea price for selling one unit: the lower of the 24 h average and the
 * last lowest offer (you have to undercut the cheapest listing). Null when the item
 * cannot be sold on the flea or has no price.
 */
export function fleaSellPrice(item: Item): number | null {
  if (item.types.includes('noFlea')) return null
  const prices = [item.avg24hPrice, item.lastLowPrice].filter((p): p is number => typeof p === 'number' && p > 0)
  return prices.length ? Math.min(...prices) : null
}

export interface FlipRow extends UnlockState {
  item: Item
  traderId: string
  minTraderLevel: number
  taskUnlock: string | null
  /** What the trader charges for one unit, in roubles. */
  buyPrice: number
  /** Flea asking price used for one unit. */
  fleaPrice: number
  fee: number
  /** Flea price minus fee. */
  fleaNet: number
  profit: number
  profitPct: number
  /** Units per restock, when the data has a limit. */
  buyLimit: number | null
  /** profit × buyLimit. */
  profitPerRestock: number | null
}

/** Every trader cash offer that can be resold on the flea for more than it costs (after the fee). */
export function flipRows(items: ItemsById, ctx: UnlockContext): FlipRow[] {
  const out: FlipRow[] = []
  for (const item of Object.values(items)) {
    if (isPreset(item) || item.buyFromTrader.length === 0) continue
    const fleaPrice = fleaSellPrice(item)
    if (fleaPrice == null) continue
    const fee = fleaFee(item.basePrice, fleaPrice, 1)
    const fleaNet = fleaPrice - fee
    for (const offer of item.buyFromTrader) {
      if (!(offer.priceRUB > 0)) continue
      const profit = fleaNet - offer.priceRUB
      if (profit <= 0) continue
      const minTraderLevel = offer.minTraderLevel ?? 1
      const taskUnlock = offer.taskUnlock ?? null
      const buyLimit = offer.buyLimit && offer.buyLimit > 0 ? offer.buyLimit : null
      out.push({
        item,
        traderId: offer.traderId,
        minTraderLevel,
        taskUnlock,
        buyPrice: offer.priceRUB,
        fleaPrice,
        fee,
        fleaNet,
        profit,
        profitPct: (profit / offer.priceRUB) * 100,
        buyLimit,
        profitPerRestock: buyLimit != null ? profit * buyLimit : null,
        ...unlockState(ctx, offer.traderId, minTraderLevel, taskUnlock),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Loot value per slot
// ---------------------------------------------------------------------------

export interface LootRow {
  item: Item
  slots: number
  value: number
  via: 'flea' | 'trader'
  traderId: string | null
  perSlot: number
}

/** Items worth selling, with best sale divided by the number of inventory cells they take. */
export function lootRows(items: ItemsById, traderOnly = false): LootRow[] {
  const out: LootRow[] = []
  for (const item of Object.values(items)) {
    if (isPreset(item)) continue
    const sale = bestSale(item, 1, traderOnly)
    if (!sale.via || sale.total <= 0) continue
    const slots = Math.max(1, item.width) * Math.max(1, item.height)
    out.push({ item, slots, value: sale.total, via: sale.via, traderId: sale.traderId, perSlot: Math.round(sale.total / slots) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Helpers for the page
// ---------------------------------------------------------------------------

/** Newest price timestamp among the items (ms since epoch), or null. */
export function latestPriceUpdate(items: Iterable<Item>): number | null {
  let best: number | null = null
  for (const it of items) {
    if (!it.updated) continue
    const t = Date.parse(it.updated)
    if (Number.isFinite(t) && (best == null || t > best)) best = t
  }
  return best
}

/** Categories used by at least `min` of the given items, by name. */
export function categoryOptions(
  items: Iterable<Item>,
  names: Record<string, string>,
  min = 3,
): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const it of items) for (const c of it.categories) counts.set(c, (counts.get(c) ?? 0) + 1)
  return [...counts]
    .filter(([id, n]) => n >= min && names[id])
    .map(([id, count]) => ({ id, name: names[id], count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export type SortDir = 'asc' | 'desc'

/** Stable sort by a numeric or string key; nulls always last. */
export function sortRows<T>(rows: T[], key: (r: T) => number | string | null, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = key(a)
    const y = key(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'string' || typeof y === 'string') return sign * String(x).localeCompare(String(y))
    return sign * (x - y)
  })
}
