import type { Craft, HideoutStation, Item, ItemsById } from '../api/types'

/**
 * Flea market listing fee, as the game computes it (community-documented formula):
 *   fee = VO·Ti·4^PO·Q + VR·Tr·4^PR·Q
 * VO = total base value, VR = asking price, Ti = Tr = 5 % (3 % with Intelligence Center 3),
 * PO = log10(VO/VR) (raised to 1.08 when VR < VO), PR = log10(VR/VO) (raised to 1.08 when VR >= VO).
 */
export function fleaFee(basePrice: number, askingPrice: number, count = 1, intelCenter3 = false): number {
  const vo = Math.max(1, basePrice * count)
  const vr = Math.max(1, askingPrice)
  const t = intelCenter3 ? 0.03 : 0.05
  let po = Math.log10(vo / vr)
  if (vr < vo) po = Math.pow(po, 1.08)
  let pr = Math.log10(vr / vo)
  if (vr >= vo) pr = Math.pow(pr, 1.08)
  const q = 1 // the fee is per offer; selling the stack as one offer
  return Math.round(vo * t * Math.pow(4, po) * q + vr * t * Math.pow(4, pr) * q)
}

/** Cheapest way to obtain one unit: flea average or trader price (whichever is known and lower). */
export function acquireCost(item: Item | undefined): number | null {
  if (!item) return null
  const flea = item.types.includes('noFlea') ? null : item.avg24hPrice
  const trader = item.buyFromTrader[0]?.priceRUB ?? null
  if (flea == null && trader == null) return null
  if (flea == null) return trader
  if (trader == null) return flea
  return Math.min(flea, trader)
}

/** Best price you can get for one unit: flea (minus fee) or trader buy-back. */
export function sellValue(item: Item | undefined, count = 1): { total: number; via: 'flea' | 'trader' | null } {
  if (!item) return { total: 0, via: null }
  const trader = (item.sellToTrader[0]?.priceRUB ?? 0) * count
  const fleaUnit = item.types.includes('noFlea') ? null : item.avg24hPrice
  if (fleaUnit == null) return { total: trader, via: trader > 0 ? 'trader' : null }
  const gross = fleaUnit * count
  const net = gross - fleaFee(item.basePrice, gross, count)
  return net >= trader ? { total: Math.round(net), via: 'flea' } : { total: trader, via: 'trader' }
}

export interface CraftEconomics {
  craft: Craft
  station: HideoutStation | undefined
  outputItem: Item | undefined
  inputCost: number | null
  revenue: number
  revenueVia: 'flea' | 'trader' | null
  profit: number | null
  profitPerHour: number | null
  /** True when some input has no known price (cost is a lower bound). */
  partialCost: boolean
}

export function craftEconomics(craft: Craft, items: ItemsById, stationsById: Record<string, HideoutStation>): CraftEconomics {
  const outputItem = items[craft.output.itemId]
  let inputCost = 0
  let partial = false
  for (const inp of craft.inputs) {
    if (inp.tool) continue // tools are returned after the craft
    const c = acquireCost(items[inp.itemId])
    if (c == null) partial = true
    else inputCost += c * inp.count
  }
  const sale = sellValue(outputItem, craft.output.count)
  const profit = sale.total - inputCost
  const hours = craft.duration / 3600
  return {
    craft,
    station: stationsById[craft.stationId],
    outputItem,
    inputCost,
    revenue: sale.total,
    revenueVia: sale.via,
    profit: outputItem ? profit : null,
    profitPerHour: outputItem && hours > 0 ? Math.round(profit / hours) : null,
    partialCost: partial,
  }
}

export function formatDuration(seconds: number): string {
  if (!seconds) return 'instant'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}
