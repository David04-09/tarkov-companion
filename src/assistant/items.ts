/**
 * Item questions: which item is meant ("dorm 303 key" -> Dorm room 303 key), where it can be
 * found, what it is worth and what it is for. Only data the app has: loose-loot spots (containers
 * such as jackets and safes are not in the data), trader offers, flea prices, quests and locks.
 */
import type { GameData, Item, ItemsById } from '../api/types'
import type { ItemNeed } from '../lib/needs'
import type { TaskStatus } from '../lib/taskStatus'
import type { MapPoint, Reply } from './engine'
import { similarity } from '../maps/overlay/questListMatch'
import { compact, words } from './text'

/** Words that are about the question, not part of an item's name. */
const NOT_NAME = new Set(
  `where wheres can could i im find get found spawn spawns spawning loot looted is are the a an of how much many what whats which who for used use need needed needs do does did it its this that cost costs price prices worth value sell sells selling sold buy buying bought to me my show tell about please on in at raid good any some there best place places locate location trader traders flea market item items
  collected collect picked pick up got grabbed grab add added have has just one more another x pcs piece pieces stash collection inventory into from remove removed take took away minus lost gave give handed hand still left total`.split(
    /\s+/,
  ),
)

/** What players call some items, pointing at words of the real name. */
const NICKNAMES: Record<string, string> = {
  moonshine: 'fierce hatchling moonshine',
  bitcoin: 'physical bitcoin',
  btc: 'physical bitcoin',
  lion: 'bronze lion',
  cat: 'cat figurine',
  horse: 'horse figurine',
  rolex: 'roler submariner',
  tushonka: 'beef stew',
  gpu: 'graphics card',
  wires: 'bundle of wires',
  hose: 'corrugated hose',
  tetriz: 'tetriz portable game',
  intel: 'intelligence folder',
  vase: 'antique vase',
  teapot: 'antique teapot',
  sas: 'sas drive',
  flash: 'secure flash drive',
}

/** British spellings and other small differences folded together ("analyser" = "analyzer"). */
const fold = (w: string) => w.replace(/ise$|ize$/, 'iz').replace(/yse(r|rs)?$/, 'yze$1').replace(/our$/, 'or')

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
  if (name.length >= 4 && said.startsWith(name) && said.length - name.length <= 1) return true
  // Spelling variants and plurals of longer words ("analysers" / "analyzer").
  const a = fold(said.replace(/s$/, ''))
  const b = fold(name.replace(/s$/, ''))
  return a === b || (a.length >= 6 && similarity(a, b) >= 0.8)
}

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, couple: 2 }

/** The amount in "collected 5 wires" / "found two GPUs" (1 when none is said), and its word index. */
export function parseCount(question: string[]): { count: number; at: number } {
  for (let i = 0; i < question.length; i++) {
    const w = question[i]
    if (/^\d{1,4}$/.test(w)) return { count: Number(w), at: i }
    if (w in NUMBER_WORDS && w !== 'a' && w !== 'an') return { count: NUMBER_WORDS[w], at: i }
  }
  return { count: 1, at: -1 }
}

/** The question with nicknames spelled out ("gpu" -> "graphics card"). */
/** The item a one-word nickname stands for ("bitcoin" → Physical Bitcoin), if it is one. */
export function nicknameItem(word: string, items: ItemsById): Item | null {
  const full = NICKNAMES[word]
  return full ? (findItem(full.split(' '), items)?.item ?? null) : null
}

export function expandNicknames(question: string[]): string[] {
  return question.flatMap((w) => (NICKNAMES[w] ? NICKNAMES[w].split(' ') : [w]))
}

export interface ItemMatch {
  item: Item
  /** Other items that fit the words about as well. */
  others: Item[]
}

const compactName = (it: Item) => words(it.name).join('')
const fullNameCache = new WeakMap<ItemsById, Map<string, Item>>()
/** Items by their whole name with spaces and punctuation removed ("handdrill"), names of 2+ words. */
function fullNames(items: ItemsById): Map<string, Item> {
  let m = fullNameCache.get(items)
  if (!m) {
    m = new Map()
    for (const it of Object.values(items)) if (words(it.name).length >= 2 && !m.has(compactName(it))) m.set(compactName(it), it)
    fullNameCache.set(items, m)
  }
  return m
}

/**
 * The item a question is about: every remaining word (after question words and map names) must
 * appear in the item's name; fewer extra words in the name is better ("battery" -> "AA Battery"
 * before "Cyclon rechargeable battery"). `skip` = words already used for something else (map names).
 */
export function findItem(question: string[], items: ItemsById, skip: Set<number> = new Set(), prefer: (it: Item) => number = () => 0): ItemMatch | null {
  // An item's whole name said as it is wins outright, even with question words in it ("Hand drill":
  // "hand" alone is dropped below as in "hand in", which left "drill" = Electric drill).
  const byName = fullNames(items)
  let whole: Item | undefined
  for (let start = 0; start < question.length; start++) {
    let text = ''
    for (let end = start; end < Math.min(question.length, start + 8); end++) {
      if (skip.has(end)) break
      text += question[end]
      const it = end > start ? byName.get(text) : undefined
      if (it && (!whole || compactName(it).length > compactName(whole).length)) whole = it
    }
  }
  if (whole) return { item: whole, others: [] }
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
  /** Item Collection counts (this game mode), by item id. */
  collected?: Record<string, number>
  /** What open quests, unbuilt hideout levels and favourite crafts still need of an item (same as the Item Collection page). */
  needFor?: (itemId: string) => ItemNeed | undefined
}

/** The Item Collection entry an item counts towards: a quest's accepted alternative counts for its main item. */
function collectionTarget(it: Item, ctx: ItemContext): { id: string; need: ItemNeed | undefined } {
  const need = ctx.needFor?.(it.id)
  return { id: need?.itemId ?? it.id, need }
}

function haveLine(name: string, have: number, need: ItemNeed | undefined): string {
  if (!need || need.total === 0) return `You have ${have}; none of your open quests, hideout levels or favourite crafts need ${name}.`
  const left = Math.max(0, need.total - have)
  return left ? `You have ${have} of ${need.total} needed, ${left} to go.` : `You have ${have} of ${need.total} needed: done.`
}

/** "Collected 5 wires" / "used 2 wires": the change to make in the Item Collection and what to say. */
export function collectAnswer(m: ItemMatch, delta: number, ctx: ItemContext): Reply {
  const { id, need } = collectionTarget(m.item, ctx)
  const before = ctx.collected?.[id] ?? 0
  const after = Math.max(0, before + delta)
  const name = m.item.name
  if (before === after) return { text: `You have no ${name} in your Item Collection to take off.` }
  const amount = delta > 0 ? delta : before - after
  // Asked first; the change happens on "yes" / "approve" (or the Yes button), see the page.
  return {
    text: delta > 0 ? `Add ${amount} ${name} to your Item Collection?` : `Take ${amount} ${name} off your Item Collection?`,
    lines: [`Say "yes" or "approve" to do it, "no" to cancel.`, ...(id !== m.item.id ? ['Counted towards the item your quest asks for (it accepts this one too).'] : []), ...alsoLine(m)],
    confirm: {
      itemId: id,
      from: before,
      to: after,
      doneText: `${delta > 0 ? `Added ${amount} ${name} to` : `Took ${amount} ${name} off`} your Item Collection. ${haveLine(name, after, need)}`,
    },
    actions: [{ kind: 'setCollected', itemId: id, count: after, label: delta > 0 ? `Yes, add ${amount}` : `Yes, take ${amount} off` }],
  }
}

/** "Yes" / "approve" / "accept" … to a question the assistant asked; "no" / "cancel" to drop it. */
export function confirmWord(question: string): 'yes' | 'no' | null {
  const w = words(question).join(' ')
  if (/^(yes|yeah|yep|yup|approve|approved|accept|accepted|confirm|confirmed|sure|ok|okay|do it|go ahead|add it|please do)\b/.test(w)) return 'yes'
  if (/^(no|nope|cancel|dont|do not|stop|never mind|nevermind|forget it)\b/.test(w)) return 'no'
  return null
}

/** "How many wires do I still need?" */
export function needAnswer(m: ItemMatch, ctx: ItemContext): Reply {
  const { id, need } = collectionTarget(m.item, ctx)
  const have = ctx.collected?.[id] ?? 0
  const lines = need?.sources.slice(0, 6).map((s) => `${s.name}: ${s.count}${'fir' in s && s.fir ? ' (found in raid)' : ''}`) ?? []
  return { text: `${m.item.name}: ${haveLine(m.item.name, have, need)}`, lines: [...lines, ...alsoLine(m)] }
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
  // How many are still needed is shown, not said: the question was about the price.
  const { id, need } = collectionTarget(it, ctx)
  const have = ctx.collected?.[id] ?? 0
  const still = need ? Math.max(0, need.total - have) : 0
  const needLine = still > 0 ? [`Still needed: ${still} more (${need!.sources.slice(0, 3).map((s) => s.name).join(', ')}${need!.sources.length > 3 ? ', …' : ''})`] : []
  return { text, lines: [...priceLines(it, ctx), ...needLine, ...alsoLine(m)] }
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
  // Asking what it is worth gets the price, even with "buy" or "find" in it ("price to buy a GPU").
  if (/\b(price|prices|cost|costs|worth|value|sell|sells|selling|how much)\b/.test(said) && !/\b(where|spawn|spawns|located|location)\b/.test(said)) return 'price'
  if (/\b(where|find|spawn|spawns|loot|located|location|get one|get it|buy)\b/.test(said)) return 'where'
  return 'info'
}

