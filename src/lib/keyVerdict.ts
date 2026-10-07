/**
 * "Is this key worth it?" from the wiki's "Behind the lock" list. A rough, explainable score:
 * every loot line adds points for what it holds (LEDX, valuables, weapon boxes, safes, …),
 * times its count ("2x Weapon box"). Quest keys are always called out first.
 */
export type KeyVerdictKind = 'quest' | 'yes' | 'no' | 'unknown'

export interface KeyVerdict {
  kind: KeyVerdictKind
  /** Also worth it for the loot (for quest keys). */
  lootWorth: boolean | null
  score: number
  /** Short reasons, best first ("LEDX spawn", "2× weapon box"). */
  reasons: string[]
}

const RULES: { re: RegExp; points: number; label: string }[] = [
  { re: /\bledx\b/i, points: 6, label: 'LEDX spawn' },
  { re: /graphics card|\bgpu\b/i, points: 4, label: 'graphics card spawn' },
  { re: /bitcoin|physical bitcoin/i, points: 4, label: 'bitcoin spawn' },
  { re: /very rare valuables|rare valuables/i, points: 4, label: 'rare valuables' },
  { re: /\bkeycards?\b/i, points: 3, label: 'keycard spawns' },
  { re: /\bsafes?\b/i, points: 3, label: 'safe' },
  { re: /intelligence|\bintel\b/i, points: 3, label: 'intelligence spawn' },
  { re: /\bvaluables?\b/i, points: 2, label: 'valuables' },
  { re: /weapon (box|crate|case)/i, points: 2, label: 'weapon box' },
  { re: /\bweapons?\b|weapon spawn|weapon rack/i, points: 1.5, label: 'weapon spawns' },
  { re: /\bcurrency\b|\bmoney\b|cash register/i, points: 1.5, label: 'money' },
  { re: /\bpc\b|computer|server/i, points: 1.5, label: 'PC / tech' },
  { re: /electronics|\btech\b/i, points: 1, label: 'electronics' },
  { re: /medcase|medical (box|crate|supplies)|\bmeds\b/i, points: 1, label: 'medical' },
  { re: /toolbox/i, points: 1, label: 'toolbox' },
  { re: /ammo|ammunition/i, points: 1, label: 'ammo' },
  { re: /stash|duffle bag|bag\b/i, points: 0.8, label: 'bags / stashes' },
  { re: /loose loot/i, points: 1, label: 'loose loot' },
  { re: /grenade box/i, points: 0.5, label: 'grenade box' },
  { re: /jackets?\b/i, points: 0.5, label: 'jacket' },
  { re: /drawers?\b/i, points: 0.3, label: 'drawer' },
]

/** "2x Weapon box" -> 2; at most 5 so a long list of drawers cannot add up to a safe. */
function countOf(line: string): number {
  const m = /(\d+)\s*[x×]/i.exec(line)
  return m ? Math.min(5, Math.max(1, Number(m[1]))) : 1
}

export const WORTH_IT_SCORE = 4

export function keyVerdict(input: { behind: string[] | null; questNames: string[] }): KeyVerdict {
  const reasons = new Map<string, number>()
  let score = 0
  let extract = false
  let questOnly = false
  for (const line of input.behind ?? []) {
    if (/extraction|\bextract\b/i.test(line)) extract = true
    if (/unless the quest|only (?:during|for|with) the quest|quest .* (?:is )?active/i.test(line)) questOnly = true
    // One rule per line (the best match), so "very rare valuables" does not also count as "valuables".
    const rule = RULES.find((r) => r.re.test(line))
    if (!rule) continue
    const n = countOf(line)
    score += rule.points * n
    reasons.set(rule.label, (reasons.get(rule.label) ?? 0) + n)
  }
  if (extract) score += 1.5
  const reasonList = [...reasons.entries()]
    .sort((a, b) => (RULES.find((r) => r.label === b[0])?.points ?? 0) - (RULES.find((r) => r.label === a[0])?.points ?? 0))
    .map(([label, n]) => (n > 1 ? `${n}× ${label}` : label))
  if (extract) reasonList.push('opens an extraction (an extra way out)')
  if (questOnly) reasonList.push('the room only matters during a quest')
  const known = (input.behind?.length ?? 0) > 0
  // An extra way out of the raid is worth a key on its own.
  const lootWorth = known ? score >= WORTH_IT_SCORE || extract : null
  if (input.questNames.length) return { kind: 'quest', lootWorth, score, reasons: reasonList }
  if (!known) return { kind: 'unknown', lootWorth: null, score: 0, reasons: [] }
  return { kind: lootWorth ? 'yes' : 'no', lootWorth, score, reasons: reasonList }
}
