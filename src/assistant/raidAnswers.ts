/**
 * Questions people ask during and after a raid, each answered from real data only:
 * time left, Tarkov time, where am I, bosses and the Goons, loot containers, hazards, locked
 * doors, quest keys, ammo, keep or sell, what to loot, what a quest unlocks, trader restocks,
 * scav cooldown, quests handed in today and my raid stats. Pure: live facts come in `LiveInfo`.
 */
import type { GameMap, Item, ItemsById, Position, Task } from '../api/types'
import { armorVerdict, bestArmorClass, caliberLabel } from '../lib/ammo'
import type { ItemNeed } from '../lib/needs'
import { buildSpawnModel } from '../maps/overlay/spawns'
import { buildUnlocks } from '../quests/questGraph'
import type { AssistantContext, MapPoint, Reply } from './engine'
import { findItem, expandNicknames } from './items'
import { survivalText, topMaps, type Habits } from './memory'
import { labelKey, nearestPlace, type Place } from './places'
import { compact, sayDistance, words } from './text'

/** What the app knows right now, outside the game data (desktop: from the game log and screenshots). */
export interface LiveInfo {
  now: number
  /** The raid running now (from the game log), if any. */
  raid: { startedAt: number; durationS: number | null; mapNameId: string | null } | null
  /** Position from the latest in-game screenshot. */
  position: { x: number; z: number; mapKey: string | null; at: number } | null
  scavCooldownEndsAt: number | null
  /** Quests handed in, read from the game log (this game mode). */
  handIns: { taskId: string; at: number }[]
  habits: Habits | null
  /** The map of the raid you are in (game log), else of a screenshot from the last 30 minutes; null when not known. */
  currentMapId: string | null
  /** Everything quests, hideout and favourite crafts still need (Item Collection numbers). */
  needs: () => ItemNeed[]
  isDesktop: boolean
}

const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z)
const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000))
const ago = (ms: number) => (ms < 90_000 ? 'just now' : ms < 90 * 60_000 ? `${minutes(ms)} minutes ago` : `${Math.round(ms / 3_600_000)} hours ago`)
const rub = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₽`
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** "2 safes", "3 weapon boxes", "1 minefield". */
const countOf = (n: number, name: string) => {
  const w = name.toLowerCase()
  return n === 1 || /s$/.test(w) ? `${n} ${w}` : `${n} ${/(x|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`}`
}

export interface RaidHelpers {
  said: string
  q: string[]
  map: GameMap | null
  /** Places named in the question (already settled to one map where possible). */
  place: Place | null
  quest: Task | null
  mapOf: (key: string) => GameMap | undefined
}

// ---- Tarkov time --------------------------------------------------------------------------

/** In-game clock: real time × 7, Moscow offset; the other raid time is 12 hours on (as tarkov.dev shows it). */
export function tarkovTime(nowMs: number, left: boolean): { h: number; m: number } {
  const day = 24 * 3_600_000
  const t = (3 * 3_600_000 + (left ? 0 : 12 * 3_600_000) + nowMs * 7) % day
  return { h: Math.floor(t / 3_600_000), m: Math.floor((t % 3_600_000) / 60_000) }
}
const clock = (t: { h: number; m: number }) => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`
const isNight = (t: { h: number }) => t.h >= 22 || t.h < 5

// ---- The answers --------------------------------------------------------------------------

export const RAID_INTENTS = {
  timeLeft: /\b(time left|how long (is )?left|how much time|raid time|time remaining|minutes left|how long until (the )?raid ends)\b/,
  tarkovTime: /\b(tarkov time|in game time|ingame time|game time|what time is it|time in tarkov|is it night|is it day|night raid|day raid)\b/,
  whereAmI: /\b(where am i|my location|my position|where are we)\b/,
  boss: /\b(boss|bosses|reshala|killa|tagilla|glukhar|sanitar|shturman|kaban|kollontay|goons|goon|knight|birdeye|big pipe|zryachiy|partisan|cultist|cultists|raiders|rogues)\b/,
  hazard: /\b(minefield|minefields|mines|mine|sniper|snipers|danger|dangers|dangerous|hazard|hazards)\b/,
  ammo: /\b(ammo|round|rounds|bullet|bullets)\b/,
  armour: /\b(class|armor|armour)\s?\d\b|\b(penetrate|pen|go through)\b/,
  keepSell: /\b(keep or sell|should i keep|should i sell|keep it|sell it|worth keeping|stash or sell|vendor it|is it junk)\b/,
  lootList: /\b(what should i (loot|look for|pick up|grab|take)|what (items )?do i (still )?need|what to loot|shopping list|what am i looking for|what do i need to find)\b/,
  unlocks: /\b(unlock|unlocks|what comes after|next quest after|leads to|what is after|whats after)\b/,
  keys: /\b(key|keys|keycard)\b.*\b(need|for|open|opens)\b|\b(locked|locks|lock)\b/,
  restock: /\b(restock|restocks|reset|resets|refresh)\b/,
  scav: /\b(scav (timer|cooldown)|when can i scav|can i scav|scav ready)\b/,
  handIns: /\b(what (quests )?(did i|have i) (finish|finished|complete|completed|hand in|handed in|done)|quests? (i )?(finished|completed|handed in) today|what did i (do|complete) today)\b/,
  stats: /\b(my stats|how am i doing|my raids|survival rate|how many raids|raids (have i|did i)|k d|kd|kill death|my record)\b/,
  loot: /\b(loot|containers?|safes?|weapon box(es)?|weapon crates?|jackets?|duffle bags?|duffles?|toolbox(es)?|medcases?|medbags?|filing cabinets?|pcs?|computers?|caches|cache|key cabinets?|drawers?|registers?|grenade box(es)?|supply crates?|sport bags?|dead scavs?)\b/,
}

/** Answers a raid / after-raid question, or null when the question is something else. */
export function raidAnswer(ctx: AssistantContext, live: LiveInfo | undefined, h: RaidHelpers): Reply | null {
  const s = h.said
  const I = RAID_INTENTS
  if (I.timeLeft.test(s)) return timeLeft(ctx, live, h)
  if (I.tarkovTime.test(s)) return tarkovTimeAnswer(live?.now ?? Date.now())
  if (I.whereAmI.test(s)) return whereAmI(ctx, live, h)
  if (I.scav.test(s)) return scavAnswer(live)
  if (I.handIns.test(s)) return handInsAnswer(ctx, live)
  if (I.stats.test(s)) return statsAnswer(live, h)
  if (I.restock.test(s)) return restockAnswer(ctx, live, h)
  if (I.unlocks.test(s) && h.quest) return unlocksAnswer(ctx, h.quest)
  if (I.lootList.test(s)) return lootListAnswer(ctx, live, h)
  if (I.keepSell.test(s)) return keepSellAnswer(ctx, h)
  if ((I.ammo.test(s) || I.armour.test(s)) && !I.loot.test(s.replace(/\bround\b/, ''))) {
    const a = ammoAnswer(ctx, h)
    if (a) return a
  }
  if (I.boss.test(s)) return bossAnswer(ctx, h)
  if (I.hazard.test(s) && h.map) return hazardAnswer(ctx, h.map)
  if (I.keys.test(s) && (h.quest || h.place)) {
    const a = keysAnswer(ctx, h)
    if (a) return a
  }
  if (I.loot.test(s) && (h.map || h.place)) {
    const a = lootAnswer(ctx, h)
    if (a) return a
  }
  return null
}

function timeLeft(ctx: AssistantContext, live: LiveInfo | undefined, h: RaidHelpers): Reply {
  const raid = live?.raid
  if (raid) {
    const map = raid.mapNameId ? ctx.data.maps.find((m) => m.nameId.toLowerCase() === raid.mapNameId!.toLowerCase()) : undefined
    const durationS = raid.durationS ?? (map?.raidDuration ? map.raidDuration * 60 : null)
    const gone = live.now - raid.startedAt
    if (durationS) {
      const left = durationS * 1000 - gone
      return { text: left > 0 ? `About ${plural(minutes(left), 'minute')} left${map ? ` on ${map.name}` : ''}, sir.` : `The raid clock${map ? ` on ${map.name}` : ''} has run out.`, lines: [`Raid started ${ago(gone)}; ${map?.name ?? 'this map'} raids last ${Math.round(durationS / 60)} minutes. Counted from when the game log says the raid started.`] }
    }
    return { text: `The raid started ${ago(gone)}; the data has no raid length for this map.` }
  }
  const map = h.map
  return {
    text: live?.isDesktop ? 'No raid is running in the game log right now.' : 'I know the raid clock only in the desktop app, from the game log.',
    lines: map?.raidDuration ? [`${map.name} raids last ${map.raidDuration} minutes.`] : undefined,
  }
}

export function tarkovTimeAnswer(now: number): Reply {
  const left = tarkovTime(now, true)
  const right = tarkovTime(now, false)
  const word = (t: { h: number }) => (isNight(t) ? 'night' : 'day')
  return {
    text: `In Tarkov it is ${clock(left)} (${word(left)}) or ${clock(right)} (${word(right)}), the two raid times you can pick.`,
    lines: ['Tarkov time runs 7 times faster than real time. Factory and The Lab ignore it: Factory has its own day and night versions.'],
  }
}

function whereAmI(ctx: AssistantContext, live: LiveInfo | undefined, h: RaidHelpers): Reply {
  const p = live?.position
  if (!p) {
    return {
      text: live?.isDesktop ? 'Take an in-game screenshot and ask again: I read your position from its file name.' : 'I can tell where you are only in the desktop app, from your in-game screenshots.',
      lines: ['Desktop: Settings → Desktop app → "Where am I" must be on. The game puts your position in each screenshot\'s file name.'],
    }
  }
  const map = (p.mapKey && h.mapOf(p.mapKey)) || h.map
  if (!map) return { text: `Your last screenshot (${ago(live.now - p.at)}) has a position, but I do not know which map you are on. Say the map.` }
  const pos = { x: p.x, y: 0, z: p.z }
  const hit = nearestPlace(labelKey(map.normalizedName), pos, 400)
  const near = hit?.place ?? null
  const d = hit?.m ?? null
  return {
    text: near && d !== null ? `${d < 25 ? 'At' : `${sayDistance(d).replace(/^about /, 'About ')} from`} ${near.name} on ${map.name}${d >= 25 ? `, ${ctx.heading(map, near.position, pos) ?? ''}`.replace(/, $/, '') : ''}.` : `On ${map.name}.`,
    lines: [`From your screenshot ${ago(live.now - p.at)}.`],
    map: { map, points: [{ id: 'you', position: pos, label: 'You (last screenshot)', kind: 'you' }], route: null },
    youAt: near ? { ...near, position: pos, name: `near ${near.name}` } : undefined,
    mapId: map.id,
  }
}

function scavAnswer(live: LiveInfo | undefined): Reply {
  const end = live?.scavCooldownEndsAt
  if (!end) return { text: 'No scav timer is running. Start one under the raid timers (desktop) after a scav run.' }
  const left = end - (live?.now ?? Date.now())
  return { text: left > 0 ? `Your scav is ready in about ${plural(minutes(left), 'minute')}.` : 'Your scav is ready, sir.' }
}

function handInsAnswer(ctx: AssistantContext, live: LiveInfo | undefined): Reply {
  if (!live?.isDesktop) return { text: 'Hand-ins are read from the game log in the desktop app.' }
  const start = new Date(live.now)
  start.setHours(0, 0, 0, 0)
  const today = live.handIns.filter((e) => e.at >= start.getTime())
  if (!today.length) return { text: 'The game log shows no quests handed in today.' }
  const names = today.map((e) => ctx.data.tasksById[e.taskId]?.name).filter(Boolean) as string[]
  return { text: `You handed in ${plural(names.length, 'quest')} today, sir.`, lines: names }
}

function statsAnswer(live: LiveInfo | undefined, h: RaidHelpers): Reply {
  const habits = live?.habits
  const maps = habits ? topMaps(habits, 6) : []
  const kd = 'Kills, deaths and K/D are not in the game log: the My stats tab links to your tarkov.dev player page for those.'
  if (!maps.length) return { text: "I have no raids of yours yet: I learn them from the game log in the desktop app.", lines: [kd], links: [{ label: 'My stats', to: '/stats' }] }
  const total = maps.reduce((n, [, m]) => n + m.raids, 0)
  const marked = maps.reduce((n, [, m]) => n + m.survived + m.died, 0)
  const survived = maps.reduce((n, [, m]) => n + m.survived, 0)
  const name = (key: string) => h.mapOf(key)?.name ?? key
  return {
    text: `${plural(total, 'raid')} that I know of, most on ${name(maps[0][0])}${marked >= 3 ? `; you survived ${Math.round((survived / marked) * 100)}% of the ${marked} you marked` : ''}.`,
    lines: [...maps.map(([key, m]) => `${name(key)}: ${plural(m.raids, 'raid')}${survivalText(m) ? `, ${survivalText(m)}` : ''}`), 'Survival counts raids you marked on the after-raid card.', kd],
    links: [{ label: 'My stats', to: '/stats' }],
  }
}

function restockAnswer(ctx: AssistantContext, live: LiveInfo | undefined, h: RaidHelpers): Reply {
  const now = live?.now ?? Date.now()
  const named = ctx.data.traders.filter((t) => h.q.includes(t.normalizedName) || h.q.includes(t.name.toLowerCase()))
  const list = (named.length ? named : ctx.data.traders).filter((t) => t.resetTime)
  if (!list.length) return { text: 'The data has no restock times right now.' }
  const line = (t: (typeof list)[number]) => {
    const left = (t.resetTime ?? 0) - now
    return left > 0 ? `${t.name}: in ${minutes(left) >= 60 ? `${Math.floor(minutes(left) / 60)} h ${minutes(left) % 60} min` : plural(minutes(left), 'minute')}` : `${t.name}: restocked`
  }
  if (named.length === 1) return { text: `${line(list[0]).replace(': in', ' restocks in').replace(': restocked', ' has just restocked')}.` }
  const sorted = [...list].sort((a, b) => (a.resetTime ?? 0) - (b.resetTime ?? 0))
  return { text: `Next restock: ${line(sorted[0]).replace(': ', ' ')}.`, lines: sorted.map(line) }
}

function unlocksAnswer(ctx: AssistantContext, t: Task): Reply {
  const unlocks = buildUnlocks(ctx.data.tasks).get(t.id) ?? []
  const names = unlocks.map((id) => ctx.data.tasksById[id]).filter(Boolean) as Task[]
  if (!names.length) return { text: `In the data, no quest needs ${t.name} first.` }
  return { text: `${t.name} opens the way to ${plural(names.length, 'quest')}.`, lines: names.map((n) => `${n.name} (${n.trader.name}${n.minPlayerLevel ? `, level ${n.minPlayerLevel}` : ''})`) }
}

/** What to look out for: what is still needed, most first; on a map, only what spawns there loose. */
function lootListAnswer(ctx: AssistantContext, live: LiveInfo | undefined, h: RaidHelpers): Reply {
  if (!ctx.items) return { text: 'Loading the item list…', needsItems: true }
  const collected = ctx.collected ?? {}
  let rows = (live?.needs() ?? [])
    .map((n) => ({ n, left: n.total - (collected[n.itemId] ?? 0), item: ctx.items![n.itemId] }))
    .filter((r) => r.left > 0 && r.item)
  let where = ''
  if (h.map) {
    const here = new Set((ctx.data.mapDetails[h.map.id]?.lootLoose ?? []).flatMap((l) => l.itemIds))
    rows = rows.filter((r) => here.has(r.n.itemId) || r.n.alternatives.some((a) => here.has(a)))
    where = ` that spawn loose on ${h.map.name}`
  }
  if (!rows.length) return { text: h.map ? `Nothing you still need spawns loose on ${h.map.name} in the data.` : 'You need nothing for your quests or hideout right now, sir.' }
  rows.sort((a, b) => b.left - a.left)
  return {
    text: `${plural(rows.length, 'item')} you still need${where}. Most wanted: ${rows.slice(0, 3).map((r) => `${r.left} ${r.item!.shortName}`).join(', ')}.`,
    lines: rows.slice(0, 15).map((r) => `${r.item!.name}: ${r.left}${r.n.fir ? ` (${r.n.fir} found in raid)` : ''}`),
    links: [{ label: 'Item Collection', to: '/items' }],
  }
}

const KEEP_WORDS = new Set(['should', 'i', 'keep', 'keeping', 'sell', 'selling', 'it', 'or', 'stash', 'vendor', 'junk', 'is', 'worth', 'a', 'an', 'the', 'my', 'this', 'these', 'those'])

function itemIn(ctx: AssistantContext, h: RaidHelpers): Item | null {
  if (!ctx.items) return null
  // The question words are not part of the item's name ("should I keep the LEDX").
  const asked = h.q.filter((w) => !KEEP_WORDS.has(w))
  return findItem(expandNicknames(asked), ctx.items)?.item ?? null
}

function keepSellAnswer(ctx: AssistantContext, h: RaidHelpers): Reply {
  if (!ctx.items) return { text: 'Loading the item list…', needsItems: true }
  const it = itemIn(ctx, h)
  if (!it) return { text: 'Which item? Say its name, like "should I keep the LEDX".', quiet: true }
  const need = ctx.needFor?.(it.id)
  const have = need ? (ctx.collected?.[need.alternatives[0] ?? it.id] ?? ctx.collected?.[it.id] ?? 0) : 0
  const left = need ? Math.max(0, need.total - have) : 0
  const flea = it.types.includes('noFlea') ? null : it.avg24hPrice
  const trader = [...it.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)[0]
  const traderName = trader ? ctx.data.traders.find((t) => t.id === trader.traderId)?.name ?? 'a trader' : null
  const sell = flea && (!trader || flea > trader.priceRUB) ? `the flea, about ${rub(flea)}` : trader ? `${traderName}, ${rub(trader.priceRUB)}` : null
  const slots = it.width * it.height
  const perSlot = flea ?? trader?.priceRUB ?? null
  const lines = [...(need ? need.sources.slice(0, 4).map((src) => `${src.name}: ${src.count}`) : []), ...(perSlot ? [`About ${rub(perSlot / slots)} per slot (${it.width}×${it.height}).`] : [])]
  if (left > 0) return { text: `Keep it, sir: you still need ${left} ${it.shortName}${need?.fir ? ' (found in raid for some)' : ''}.${sell ? ` Spares sell best on ${sell}.` : ''}`, lines }
  return { text: `${it.name} is not needed for your quests or hideout${sell ? `: sell it on ${sell}` : ''}.`, lines }
}

function ammoAnswer(ctx: AssistantContext, h: RaidHelpers): Reply | null {
  if (!ctx.items) return { text: 'Loading the item list…', needsItems: true }
  const all = Object.values(ctx.items).filter((it) => it.ammo && it.ammo.ammoType === 'bullet' || it.ammo?.ammoType === 'buckshot')
  // "Will M995 go through class 5?"
  const cls = /\b(?:class|armor|armour)\s?(\d)\b/.exec(h.said) ?? /\b(\d)\s?(?:class|armor|armour)\b/.exec(h.said)
  const named = findItem(expandNicknames(h.q.filter((w) => !['class', 'armor', 'armour', 'go', 'through', 'penetrate', 'pen', 'will', 'does', 'can', 'it'].includes(w))), Object.fromEntries(all.map((a) => [a.id, a])) as ItemsById)?.item
  if (cls && named?.ammo) {
    const c = Number(cls[1])
    const v = armorVerdict(named.ammo.penetrationPower, c)
    const say = v === 'good' ? 'goes through it well' : v === 'partial' ? 'has a real but unreliable chance' : 'mostly will not go through'
    return { text: `${named.shortName} (penetration ${named.ammo.penetrationPower}) ${say} against class ${c}.`, lines: ['Rule of thumb: penetration of 10 × the class goes through reliably; the real result also depends on the armour\'s durability and material.'] }
  }
  // "Best ammo for 5.45" / "best ammo for my AK-74N"
  const weapon = Object.values(ctx.items).find((it) => it.weapon && words(it.shortName).length && compact(h.said).includes(compact(it.shortName)) && compact(it.shortName).length >= 3)
  const calibers = [...new Set(all.map((a) => a.ammo!.caliber))]
  const said = compact(h.said)
  // "7.62x39" must not pick 7.62x54R: the full size first ("762x39"), the bare first number ("545") only when it is unique.
  const label = (c: string) => compact(caliberLabel(c)).replace(/mm/g, '')
  const size = (c: string) => /^\d+x\d+/.exec(label(c))?.[0] ?? label(c)
  const full = calibers.filter((c) => size(c).length >= 3 && said.includes(size(c)))
  const short = calibers.filter((c) => {
    const first = /^\d+/.exec(label(c))?.[0] ?? ''
    return first.length >= 2 && new RegExp(`(^|[a-z])${first}($|[a-z])`).test(said)
  })
  const caliber = weapon?.weapon?.caliber ?? full.sort((a, b) => size(b).length - size(a).length)[0] ?? (short.length === 1 ? short[0] : undefined)
  if (!caliber) return null
  const rows = all.filter((a) => a.ammo!.caliber === caliber).sort((a, b) => b.ammo!.penetrationPower - a.ammo!.penetrationPower)
  if (!rows.length) return { text: `The data has no rounds for ${caliberLabel(caliber)}.` }
  const buyable = rows.filter((a) => a.buyFromTrader.length)
  const line = (a: Item) => `${a.shortName}: penetration ${a.ammo!.penetrationPower}, damage ${a.ammo!.damage * (a.ammo!.projectileCount || 1)}, good up to class ${bestArmorClass(a.ammo!.penetrationPower)}${a.buyFromTrader.length ? '' : ' (not sold by traders)'}`
  return {
    text: `Best ${caliberLabel(caliber)}${weapon ? ` for the ${weapon.shortName}` : ''} by penetration: ${rows.slice(0, 2).map((a) => a.shortName).join(', then ')}.${buyable[0] && buyable[0] !== rows[0] ? ` Best you can buy from traders: ${buyable[0].shortName}.` : ''}`,
    lines: rows.slice(0, 6).map(line),
    links: [{ label: 'Ammo tab', to: '/ammo' }],
  }
}

function bossAnswer(ctx: AssistantContext, h: RaidHelpers): Reply {
  const s = h.said
  // "Goons": on the map you are on (or named, or last talked about) their chance and spawn spots;
  // otherwise where they were last reported and every map's chance.
  if (/\b(goons|goon|knight|birdeye|big pipe)\b/.test(s)) return goonsAnswer(ctx, h)
  // A boss named in the question is looked for on every map; "bosses on Customs" only there.
  const allMaps = ctx.data.maps.filter((m) => !/night/.test(m.normalizedName))
  const namesBoss = (name: string) => compact(s).includes(compact(name)) || words(name).some((w) => w.length >= 4 && h.q.includes(w))
  const bossNamed = allMaps.some((m) => buildSpawnModel(ctx.data, m.id).bosses.some((b) => b.spawnChance > 0 && namesBoss(b.name)))
  const maps = h.map && !bossNamed ? [h.map] : allMaps
  const rows: { map: GameMap; name: string; chance: number; where: string[]; points: Position[] }[] = []
  for (const m of maps) {
    for (const b of buildSpawnModel(ctx.data, m.id).bosses) {
      if (b.spawnChance <= 0) continue
      // Internal ids ("2ScavPort29", long hex) are not names anyone says.
      const where = [...new Set(b.spawns.flatMap((sp) => sp.locations.map((l) => l.name)))].filter((n) => n && !/^[0-9a-f-]{20,}$/i.test(n) && !(/\d/.test(n) && !/\s/.test(n)))
      rows.push({ map: m, name: b.name, chance: b.spawnChance, where, points: b.spawns.flatMap((sp) => sp.locations.flatMap((l) => l.positions)) })
    }
  }
  // A boss by name: every map it spawns on.
  // "Tagilla" is Tagilla, not "Shadow of Tagilla": a boss whose whole name was said wins.
  const named = rows.filter((r) => namesBoss(r.name))
  const whole = named.filter((r) => compact(s).includes(compact(r.name)))
  const wanted = whole.length ? whole : named
  const pick = wanted.length ? wanted : rows
  if (!pick.length) return { text: h.map ? `No bosses spawn on ${h.map.name} in the data.` : 'I did not find that boss in the data.' }
  if (wanted.length) {
    const best = [...wanted].sort((a, b) => b.chance - a.chance)
    const first = best[0]
    return {
      text: `${first.name} shows up on ${best.map((r, i) => `${r.map.name} ${i === 0 ? 'about ' : ''}${Math.round(r.chance * 100)}%${i === 0 ? ' of the time' : ''}`).join(', ')}.`,
      lines: best.map((r) => `${r.map.name}: ${r.where.join(', ') || 'spawn spots without names'}`),
      map: first.points.length ? { map: first.map, points: first.points.slice(0, 30).map((p, i) => ({ id: `b${i}`, position: p, label: first.name, kind: 'quest' as MapPoint['kind'] })), route: null } : undefined,
      mapId: first.map.id,
    }
  }
  const map = h.map
  if (!map) return { text: 'Which map? Ask like "bosses on Customs".', quiet: true }
  const sorted = [...pick].sort((a, b) => b.chance - a.chance)
  return {
    text: `On ${map.name} you might run into ${sorted.map((r) => `${r.name} (${Math.round(r.chance * 100)}%)`).join(', ')}.`,
    lines: sorted.map((r) => `${r.name}: ${r.where.join(', ') || 'spawn spots without names'}`),
    mapId: map.id,
  }
}

/** The Goons on one map: their spawn chance (the highest of the three) and spots. */
function goonsOn(ctx: AssistantContext, map: GameMap): { chance: number; where: string[]; points: Position[] } | null {
  const goons = buildSpawnModel(ctx.data, map.id).bosses.filter((b) => b.group === 'goons' && b.spawnChance > 0)
  if (!goons.length) return null
  const locations = goons.flatMap((b) => b.spawns.flatMap((sp) => sp.locations))
  const where = [...new Set(locations.map((l) => l.name))].filter((n) => n && !/^[0-9a-f-]{20,}$/i.test(n) && !(/\d/.test(n) && !/\s/.test(n)))
  // The three spawn together, so their spots repeat: one point per spot.
  const seen = new Set<string>()
  const points = locations.flatMap((l) => l.positions).filter((p) => {
    const k = `${Math.round(p.x)},${Math.round(p.z)}`
    return !seen.has(k) && seen.add(k)
  })
  return { chance: Math.max(...goons.map((b) => b.spawnChance)), where, points }
}

function goonsAnswer(ctx: AssistantContext, h: RaidHelpers): Reply {
  const r = ctx.data.goonReport
  const reported = r ? ctx.data.maps.find((m) => m.id === r.mapId) : undefined
  const reportLine = reported && r ? `Last reported on ${reported.name}, ${ago(Date.now() - r.at)} (player reports via tarkov.dev).` : 'No recent Goons report in the data.'
  const all = ctx.data.maps
    .filter((m) => !/night/.test(m.normalizedName))
    .map((m) => ({ map: m, on: goonsOn(ctx, m) }))
    .filter((x): x is { map: GameMap; on: NonNullable<ReturnType<typeof goonsOn>> } => x.on !== null)
    .sort((a, b) => b.on.chance - a.on.chance)
  const chances = all.map((x) => `${x.map.name} ${Math.round(x.on.chance * 100)}%`).join(', ')
  const map = h.map
  if (map) {
    const here = goonsOn(ctx, map)
    if (!here) return { text: `The Goons don't spawn on ${map.name}.`, lines: [`They can spawn on: ${chances || 'no map in the data'}.`, reportLine], mapId: map.id }
    const pct = Math.round(here.chance * 100)
    const reportedHere = reported?.id === map.id
    return {
      text: `The Goons have about a ${pct}% chance on ${map.name}${reportedHere ? ', and they were reported there most recently' : ''}.`,
      lines: [`Spawn spots: ${here.where.join(', ') || 'spots without names'}`, reportLine, `Other maps: ${all.filter((x) => x.map.id !== map.id).map((x) => `${x.map.name} ${Math.round(x.on.chance * 100)}%`).join(', ') || 'none'}`],
      map: here.points.length ? { map, points: here.points.slice(0, 30).map((p, i) => ({ id: `g${i}`, position: p, label: 'Goons', kind: 'quest' as MapPoint['kind'] })), route: null } : undefined,
      mapId: map.id,
    }
  }
  return {
    text: reported && r ? `The Goons were last reported on ${reported.name}, ${ago(Date.now() - r.at)}.` : 'There is no recent Goons report in the data.',
    lines: [`Spawn chance: ${chances || 'no map in the data'}.`, 'Say "Goons on Woods" for their spawn spots on a map.'],
    mapId: reported?.id,
  }
}

function hazardAnswer(ctx: AssistantContext, map: GameMap): Reply {
  const hz = ctx.data.mapDetails[map.id]?.hazards ?? []
  const snipers = buildSpawnModel(ctx.data, map.id).sniper.length
  if (!hz.length && !snipers) return { text: `The data marks no minefields or sniper spots on ${map.name}.`, mapId: map.id }
  const byType = new Map<string, number>()
  // The data calls sniper areas "Sniper": they are zones where sniper scavs shoot, so say so.
  const label = (x: (typeof hz)[number]) => (/sniper/i.test(x.name || x.type) ? 'Sniper zone' : x.name || x.type)
  for (const x of hz) byType.set(label(x), (byType.get(label(x)) ?? 0) + 1)
  return {
    text: `${map.name}: ${[...byType.entries()].map(([n, c]) => countOf(c, n)).join(', ')}${snipers ? `${hz.length ? ', and ' : ''}${plural(snipers, 'sniper scav spot')}` : ''}.`,
    map: { map, points: hz.slice(0, 40).map((x) => ({ id: x.id, position: x.position, label: x.name || x.type, kind: 'place' as const })), route: null },
    lines: ['Shown on the map as dots; the Maps tab draws the full areas under Layers.'],
    mapId: map.id,
  }
}

/** Keys for a quest (from the quest data only) or locked doors near a named place. */
function keysAnswer(ctx: AssistantContext, h: RaidHelpers): Reply | null {
  if (!ctx.items) return { text: 'Loading the item list…', needsItems: true }
  const name = (id: string) => ctx.items![id]?.name ?? 'an unknown key'
  if (h.quest) {
    const t = h.quest
    const ids = new Set<string>()
    for (const o of t.objectives) for (const alt of o.requiredKeys) for (const id of alt) ids.add(id)
    for (const k of t.neededKeys ?? []) for (const id of k.keyIds) ids.add(id)
    if (!ids.size) return { text: `The quest data lists no keys for ${t.name}.`, lines: ['Some objectives may still be behind a locked door the data does not mention.'] }
    return { text: `${t.name} needs: ${[...ids].map(name).join(', ')}.` }
  }
  const place = h.place!
  const map = h.mapOf(place.mapKey)
  if (!map) return null
  const near = (ctx.data.mapDetails[map.id]?.locks ?? []).filter((l) => dist(l.position, place.position) <= 40)
  if (!near.length) return { text: `The data has no locked doors within 40 metres of ${place.name}.` }
  const keys = [...new Set(near.map((l) => name(l.keyId)))]
  return {
    text: `Locked doors near ${place.name} need: ${keys.join(', ')}.`,
    map: { map, points: near.map((l) => ({ id: l.id, position: l.position, label: name(l.keyId), kind: 'loot' as const })), route: null },
    mapId: map.id,
  }
}

/** Loot containers: near a place, or one kind ("safes") across a map. */
function lootAnswer(ctx: AssistantContext, h: RaidHelpers): Reply | null {
  const map = h.place ? h.mapOf(h.place.mapKey) : h.map
  if (!map) return null
  const all = (ctx.data.mapDetails[map.id]?.lootContainers ?? []).map((c) => ({ ...c, name: ctx.data.lootContainerNames[c.containerId] ?? 'Container' }))
  if (!all.length) return { text: `The data lists no loot containers on ${map.name}.` }
  // A kind of container named in the question ("safes", "weapon boxes").
  const said = ` ${h.q.join(' ')} `
  const kinds = [...new Set(all.map((c) => c.name))].filter((n) => {
    const w = words(n)
    return w.length && w.every((x) => said.includes(` ${x} `) || said.includes(` ${x}s `) || said.includes(` ${x}es `))
  })
  let pick = kinds.length ? all.filter((c) => kinds.includes(c.name)) : all
  let where = map.name
  if (h.place) {
    pick = pick.filter((c) => dist(c.position, h.place!.position) <= 50)
    where = `near ${h.place.name}`
  } else if (!kinds.length) return null
  if (!pick.length) return { text: `No ${kinds[0]?.toLowerCase() ?? 'containers'} ${where} in the data.` }
  const counts = new Map<string, number>()
  for (const c of pick) counts.set(c.name, (counts.get(c.name) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return {
    text: `${where[0].toUpperCase()}${where.slice(1)}: ${sorted.slice(0, 5).map(([n, c]) => countOf(c, n)).join(', ')}${sorted.length > 5 ? ', and more' : ''}.`,
    lines: sorted.map(([n, c]) => `${n}: ${c}`),
    map: { map, points: pick.slice(0, 60).map((c, i) => ({ id: `c${i}`, position: c.position, label: c.name, kind: 'loot' as const })), route: null },
    mapId: map.id,
  }
}
