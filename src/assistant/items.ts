/**
 * Item questions: which item is meant ("dorm 303 key" -> Dorm room 303 key), where it can be
 * found, what it is worth and what it is for. Only data the app has: loose-loot spots (containers
 * such as jackets and safes are not in the data), trader offers, flea prices, quests and locks.
 */
import type { GameData, Item, ItemsById } from '../api/types'
import type { TaskStatus } from '../lib/taskStatus'
import type { MapPoint, Reply } from './engine'
import { compact, words } from './text'

/** Words that are about the question, not part of an item's name. */
const NOT_NAME = new Set(
  `where wheres can could i im find get found spawn spawns spawning loot looted is are the a an of how much many what whats which who for used use need needed needs do does did it its this that cost costs price prices worth value sell sells selling sold buy buying bought to me my show tell about please on in at raid good any some there best place places locate location trader traders flea market item items`.split(
    /\s+/,
  ),
)

interface Indexed {
  item: Item
  tokens: string[]
  short: string
}

let cache: { items: ItemsById; list: Indexed[] } | null = null

function indexItems(items: ItemsById): Indexed[] {
  if (cache?.items === items) return cache.list
  const list = Object.values(items).map((item) => ({ item, tokens: [...new Set([...words(item.name), ...words(item.shortName)])], short: compact(item.shortName) }))
  cache = { items, list }
  return list
}

/** A word of the question matches a word of the name: equal, a start of it ("batt"), or a plural ("dorms"). */
function tokenMatches(said: string, name: string): boolean {
  if (said === name) return true
  if (said.length >= 3 && name.startsWith(said)) return true
  return name.length >= 4 && said.startsWith(name) && said.length - name.length <= 1
}

export interface ItemMatch {
  item: Item
  /** Other items that fit the words about as well. */
  others: Item[]
}

/**
 * The item a question is about: every remaining word (after question words and map names) must
 * appear in the item's name; fewer extra words in the name is better ("battery" -> "AA Battery"
 * before "Cyclon rechargeable battery"). `skip` = words already used for something else (map names).
 */
export function findItem(question: string[], items: ItemsById, skip: Set<number> = new Set(), prefer: (it: Item) => number = () => 0): ItemMatch | null {
  const said = question.filter((w, i) => !skip.has(i) && !NOT_NAME.has(w))
  if (!said.length) return null
  const joined = said.join('')
  const scored: { item: Item; score: number }[] = []
  for (const e of indexItems(items)) {
    let score: number
    if (e.short.length >= 2 && e.short === joined) score = 2
    else {
      if (!said.every((s) => e.tokens.some((n) => tokenMatches(s, n)))) continue
      score = said.length / Math.max(said.length, words(e.item.name).length)
    }
    scored.push({ item: e.item, score: score + prefer(e.item) * 0.01 })
  }
  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length)
  const best = scored[0]
  return { item: best.item, others: scored.slice(1, 4).filter((s) => s.score >= best.score - 0.15).map((s) => s.item) }
}

export interface ItemContext {
  data: GameData
  tasks: { id: string; name: string; objectives: { itemIds: string[]; type: string; requiredKeys: string[][] }[] }[]
  statuses: Record<string, TaskStatus>
}

const rub = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₽`

function traderName(ctx: ItemContext, id: string): string {
  return ctx.data.traders.find((t) => t.id === id)?.name ?? 'a trader'
}

function openQuestsNeeding(it: Item, ctx: ItemContext) {
  const hand = ctx.tasks.filter((t) => ctx.statuses[t.id] !== 'completed' && t.objectives.some((o) => o.itemIds.includes(it.id) && /give|hand|find/i.test(o.type)))
  const keyFor = ctx.tasks.filter((t) => ctx.statuses[t.id] !== 'completed' && t.objectives.some((o) => o.requiredKeys.some((alt) => alt.includes(it.id))))
  return { hand, keyFor }
}

function priceLines(it: Item, ctx: ItemContext): string[] {
  const lines: string[] = []
  const noFlea = it.types.includes('noFlea')
  if (noFlea) lines.push('Cannot be sold on the flea market.')
  else if (it.avg24hPrice) lines.push(`Flea: about ${rub(it.avg24hPrice)} (24 h average)${it.lastLowPrice ? `, lowest offer ${rub(it.lastLowPrice)}` : ''}`)
  else lines.push('No flea price in the data.')
  const sell = [...it.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)[0]
  if (sell) lines.push(`Best trader buy-back: ${rub(sell.priceRUB)} from ${traderName(ctx, sell.traderId)}`)
  for (const b of it.buyFromTrader.slice(0, 3)) lines.push(`Sold by ${traderName(ctx, b.traderId)}${b.minTraderLevel ? ` (level ${b.minTraderLevel})` : ''} for ${rub(b.priceRUB)}`)
  return lines
}

/** "What is the GPU worth?" */
export function priceAnswer(m: ItemMatch, ctx: ItemContext): Reply {
  const it = m.item
  const price = it.types.includes('noFlea') ? null : it.avg24hPrice
  const sell = [...it.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)[0]
  const text = price
    ? `${it.name} goes for about ${rub(price)} on the flea.`
    : sell
      ? `${it.name}: ${traderName(ctx, sell.traderId)} pays ${rub(sell.priceRUB)}; it has no flea price.`
      : `${it.name}: there is no price for it in the data.`
  return { text, lines: [...priceLines(it, ctx), ...alsoLine(m)] }
}

/** "Where can I find the Dorm room 303 key?" */
export function whereAnswer(m: ItemMatch, ctx: ItemContext): Reply {
  const it = m.item
  const perMap = ctx.data.maps
    .map((map) => ({ map, spots: (ctx.data.mapDetails[map.id]?.lootLoose ?? []).filter((l) => l.itemIds.includes(it.id)).map((l) => l.position) }))
    .filter((x) => x.spots.length)
    // Night Factory repeats Factory's spots.
    .filter((x, _i, all) => !(x.map.normalizedName === 'night-factory' && all.some((o) => o.map.normalizedName === 'factory')))
    .sort((a, b) => b.spots.length - a.spots.length)
  const total = perMap.reduce((s, x) => s + x.spots.length, 0)
  const locks = ctx.data.maps.filter((map) => (ctx.data.mapDetails[map.id]?.locks ?? []).some((l) => l.keyId === it.id)).map((map) => map.name)
  const sellers = it.buyFromTrader.map((b) => `${traderName(ctx, b.traderId)}${b.minTraderLevel ? ` (level ${b.minTraderLevel})` : ''} for ${rub(b.priceRUB)}`)
  const { hand, keyFor } = openQuestsNeeding(it, ctx)
  const lines: string[] = []
  if (perMap.length) lines.push(`Loose-loot spots: ${perMap.map((x) => `${x.map.name} ${x.spots.length}`).join(', ')}`)
  lines.push('It can also be in containers (jackets, drawers, safes, key cabinets); those are not in the data.')
  if (sellers.length) lines.push(`Traders sell it: ${sellers.join('; ')}`)
  if (!it.types.includes('noFlea') && it.avg24hPrice) lines.push(`Flea: about ${rub(it.avg24hPrice)}`)
  if (locks.length) lines.push(`It opens a lock on: ${[...new Set(locks)].join(', ')}`)
  if (hand.length || keyFor.length) lines.push(`Your open quests that need it: ${[...hand, ...keyFor].map((t) => t.name).join(', ')}`)
  lines.push(...alsoLine(m))
  const top = perMap[0]
  const text = top
    ? `${it.name} can spawn as loose loot at ${total} spot${total === 1 ? '' : 's'}${perMap.length > 1 ? `, most on ${top.map.name}` : ` on ${top.map.name}`}.${perMap.length > 1 ? ` Showing ${top.map.name}.` : ''}`
    : sellers.length
      ? `${it.name} has no loose-loot spots in the data; you can buy it from traders.`
      : `${it.name} has no loose-loot spots in the data. Check containers, the flea market or quest rewards.`
  const points: MapPoint[] | undefined = top?.spots.slice(0, 80).map((p, i) => ({ id: `loot${i}`, position: p, label: it.shortName, kind: 'loot' as const }))
  return { text, lines, map: top && points ? { map: top.map, points, route: null } : undefined, mapId: top?.map.id, links: locks.length ? [{ label: 'Open in Keys', to: '/keys' }] : [] }
}

/** "What is the LEDX for?" */
export function infoAnswer(m: ItemMatch, ctx: ItemContext): Reply {
  const it = m.item
  const { hand, keyFor } = openQuestsNeeding(it, ctx)
  const locks = ctx.data.maps.filter((map) => (ctx.data.mapDetails[map.id]?.locks ?? []).some((l) => l.keyId === it.id)).map((map) => map.name)
  const lines: string[] = []
  if (hand.length) lines.push(`Still needed for: ${hand.map((t) => t.name).join(', ')}`)
  if (keyFor.length) lines.push(`Key for quests: ${keyFor.map((t) => t.name).join(', ')}`)
  if (locks.length) lines.push(`Opens locks on: ${[...new Set(locks)].join(', ')}`)
  lines.push(...priceLines(it, ctx), ...alsoLine(m))
  const uses = hand.length + keyFor.length
  return {
    text: uses ? `${it.name}: you still need it for ${uses} quest${uses === 1 ? '' : 's'}.` : `${it.name}: none of your open quests need it.`,
    lines,
    links: locks.length ? [{ label: 'Open in Keys', to: '/keys' }] : [],
  }
}

function alsoLine(m: ItemMatch): string[] {
  return m.others.length ? [`Did you mean another one? ${m.others.map((o) => o.name).join(', ')}`] : []
}

/** Which kind of item answer a question wants. */
export function itemQuestionKind(said: string): 'where' | 'price' | 'info' {
  if (/\b(where|find|spawn|spawns|loot|located|location|get one|get it|buy)\b/.test(said)) return 'where'
  if (/\b(price|prices|cost|costs|worth|value|sell|sells|selling|how much)\b/.test(said)) return 'price'
  return 'info'
}

