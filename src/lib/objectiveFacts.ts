import type { TaskObjective } from '../api/types'

/**
 * What a kill objective actually counts, written out from the conditions the game checks (count,
 * targets, weapons and their parts, distance, body parts, time, maps). The quest text in the data
 * can lag behind those: Hunting Trip's text still says "Shturman with an M700", while the game now
 * counts 20 kills of any of a dozen bosses with any bolt-action rifle. So the app shows this line
 * next to the text, and `staleText` says when the two disagree.
 */
export interface FactsLookup {
  itemName: (id: string) => string | undefined
  /** The most specific category all these items share ("Bolt-action rifle"), if a useful one exists. */
  sharedCategory: (ids: string[]) => string | undefined
}

const GOONS = new Set(['Knight', 'Big Pipe', 'Birdeye'])
const BOSSES = ['Shturman', 'Glukhar', 'Killa', 'Reshala', 'Sanitar', 'Tagilla', 'Kaban', 'Kollontay', 'Zryachiy', 'Partisan', 'Knight']
const MAX_TARGETS = 8

/** Untranslated game ids such as "bossStormtrooper" are left out (counted as "more"). */
const isRawId = (n: string) => /^boss[A-Z]/.test(n)

export function targetsText(names: string[]): string {
  const shown: string[] = []
  let hidden = 0
  for (const n of names) {
    if (isRawId(n)) hidden++
    else if (GOONS.has(n)) {
      if (!shown.includes('The Goons')) shown.push('The Goons')
    } else if (!shown.includes(n)) shown.push(n)
  }
  if (shown.length === 0) return hidden ? `${hidden} target${hidden === 1 ? '' : 's'}` : 'any target'
  if (shown.length === 1 && !hidden) return shown[0]
  const more = Math.max(0, shown.length - MAX_TARGETS) + hidden
  const list = shown.slice(0, MAX_TARGETS)
  return `any of ${list.join(', ')}${more ? ` and ${more} more` : ''}`
}

const BODY: Record<string, string> = { Head: 'head', Chest: 'thorax', Stomach: 'stomach', LeftArm: 'arms', RightArm: 'arms', LeftLeg: 'legs', RightLeg: 'legs' }

export function bodyPartsText(parts: string[]): string | null {
  const names = [...new Set(parts.map((p) => BODY[p.split('/').pop() ?? ''] ?? p.split('/').pop() ?? p))]
  if (!names.length || names.length >= 5) return null
  return `in the ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`}`
}

/** The game's category names, as players say them ("Sniper rifle" is only the bolt-actions; DMRs are "Marksman rifle"). */
const CATEGORY_WORDS: Record<string, string> = { 'Sniper rifle': 'bolt-action sniper rifle' }

function weaponsText(ids: string[], look: FactsLookup): string | null {
  if (!ids.length) return null
  if (ids.length === 1) return `with the ${look.itemName(ids[0]) ?? 'listed weapon'}`
  const cat = look.sharedCategory(ids)
  if (cat) return `with any ${CATEGORY_WORDS[cat] ?? cat.toLowerCase()} (${ids.length} kinds)`
  const names = ids.map((id) => look.itemName(id)).filter((n): n is string => Boolean(n))
  if (names.length === ids.length && ids.length <= 3) return `with the ${names.join(' or ')}`
  return `with any of ${ids.length} weapons${names.length ? ` (${names.slice(0, 2).join(', ')}, …)` : ''}`
}

/** Each set lists parts that must all be fitted; the sets are alternatives (Job for a Patriot: scope and suppressor). */
function modsText(sets: string[][], look: FactsLookup): string | null {
  const parts = sets.filter((g) => g.length).map((g) => g.map((id) => look.itemName(id) ?? 'a listed part').join(' and '))
  return parts.length ? `fitted with ${parts.join(', or ')}` : null
}

const hour = (h: number) => `${String(h).padStart(2, '0')}:00`

/** One line: what this kill/hit objective counts. Null for other objective types. */
export function shootFacts(o: TaskObjective, look: FactsLookup): string | null {
  if (o.type !== 'shoot') return null
  const parts = [`${o.shotType === 'hit' ? 'Hit' : 'Kill'} ${o.count ?? 1} × ${targetsText(o.targetNames)}`]
  const body = bodyPartsText(o.bodyParts)
  if (body) parts.push(body)
  const weapons = weaponsText(o.usingWeaponIds, look)
  if (weapons) parts.push(weapons)
  const mods = modsText(o.usingWeaponModIds, look)
  if (mods) parts.push(mods)
  if (o.distance && o.distance.value > 0) parts.push(`from ${o.distance.value} m or ${o.distance.compare === '<=' ? 'less' : 'more'}`)
  if (o.hours) parts.push(`between ${hour(o.hours.from)} and ${hour(o.hours.until)} in-game time`)
  if (o.maps.length > 0 && o.maps.length <= 4) parts.push(`on ${o.maps.map((m) => m.name).join(' or ')}`)
  return parts.join(' · ')
}

/**
 * Why the objective's text looks older than its conditions, or null. Only two signs are trusted
 * (checked against every kill objective in both modes on 2026-10-25: they flag Hunting Trip and
 * Job for a Patriot, nothing else): a kill count in the text that differs from the counted one,
 * and a text that names one boss while several other targets count.
 */
export function staleText(o: TaskObjective): string | null {
  if (o.type !== 'shoot') return null
  const text = o.description.replace(/\((?:excluding|except)[^)]*\)/gi, '')
  const reasons: string[] = []
  const n = /\b(?:eliminate|kill|neutrali[sz]e|shoot|hit)\s+(\d+)\b/i.exec(text) ?? /\b(\d+)\s+(?:PMCs?|Scavs?|targets?|times|bosses)\b/i.exec(text)
  if (n && o.count && Number(n[1]) !== o.count) reasons.push(`it says ${n[1]}, the game counts ${o.count}`)
  if (!/any boss/i.test(text)) {
    const named = BOSSES.filter((b) => new RegExp(`\\b${b}\\b`).test(text))
    if (named.length === 1) {
      const others = o.targetNames.filter((t) => !t.includes(named[0]) && !isRawId(t))
      if (others.length >= 2) reasons.push(`it names only ${named[0]}, but other targets count too`)
    }
  }
  return reasons.length ? `The quest text in the game data is out of date (${reasons.join('; ')}). What the game counts is the line below.` : null
}

/** Lookup for objectiveFacts from the items doc (names and category names). */
export function factsLookup(items: Record<string, { name: string; categories: string[] }> | undefined, categoryNames: Record<string, string> | undefined): FactsLookup {
  const GENERIC = new Set(['Item', 'Compound item', 'Weapon', 'Weapon parts & mods'])
  return {
    itemName: (id) => items?.[id]?.name,
    sharedCategory: (ids) => {
      if (!items || !categoryNames) return undefined
      const lists = ids.map((id) => items[id]?.categories)
      if (lists.some((l) => !l?.length)) return undefined
      const first = lists[0]!
      for (const c of first) {
        const name = categoryNames[c]
        if (name && !GENERIC.has(name) && lists.every((l) => l!.includes(c))) return name
      }
      return undefined
    },
  }
}
