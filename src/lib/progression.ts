/**
 * Quest unlocking and trader loyalty, worked out from what the app knows.
 *
 * - Done by deduction: a quest you have finished, started or failed could only be taken after
 *   every quest it needs ("complete" requirements) was finished, so those count as done too,
 *   all the way down the line, even when they were never ticked.
 * - Player level: the level you set, or the level your quest XP alone already reaches, whichever
 *   is higher (quest XP is a lower bound: raids give XP too).
 * - Reputation per trader: the game edition's starting bonus plus the standing every finished
 *   quest gives (and takes away), from tarkov.dev's quest rewards. Daily/weekly quests and Fence's
 *   scav karma are not in the data, so it is a lower bound; a loyalty level you set by hand wins
 *   when it is higher.
 * - Loyalty level: the highest level whose player level and reputation you meet (money spent is
 *   0 for every level in the data).
 */
import type { PlayerLevel, Task, Trader } from '../api/types'
import type { Profile } from '../store/progress'

export interface ProgressOptions {
  /** Edition bonus to every main trader's starting reputation (0, or 0.2 for Prepare for Escape / Edge of Darkness / The Unheard). */
  startingReputation: number
  /** Loyalty levels set by hand (Traders panel); the higher of this and the calculated one counts. */
  manualTraderLevels: Record<string, number>
  /** The game's level table (items document), to get the level your quest XP alone reaches; null when not loaded. */
  levelTable: PlayerLevel[] | null
  /** Quests known only from the wiki (Quests tab): used for "done by deduction", never for XP or reputation. */
  extraTasks?: Task[]
}

export interface ProgressContext {
  /** Ticked as done, plus done by deduction. */
  completed: ReadonlySet<string>
  /** Done by deduction only (not ticked). */
  inferred: ReadonlySet<string>
  active: ReadonlySet<string>
  failed: ReadonlySet<string>
  /** Player level used for the rules. */
  level: number
  /** Reputation per trader id (lower bound). */
  reputation: Record<string, number>
  /** Loyalty level from level + reputation alone, per trader id. */
  calculatedTraderLevel: Record<string, number>
  /** The level the rules use: the higher of calculated and set by hand. */
  traderLevel: Record<string, number>
}

/** Fence's standing comes mostly from scav karma and Ref's levels are tiny: the edition bonus is not added to them. */
const NO_EDITION_BONUS = new Set(['fence', 'ref'])

/** A requirement deduction can lean on: only plain "must be completed" (not "completed or failed", not "started"). */
const onlyComplete = (status: string[]) => status.length === 1 && status[0] === 'complete'

/** Every quest that must be done before the given ones, walking down the line (cycle-safe). */
export function inferCompleted(tasksById: Record<string, Task | undefined>, known: Iterable<string>, completed: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  const stack = [...known]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const r of tasksById[id]?.taskRequirements ?? []) {
      if (!onlyComplete(r.status) || !tasksById[r.taskId]) continue
      if (!completed.has(r.taskId)) out.add(r.taskId)
      stack.push(r.taskId)
    }
  }
  return out
}

/** Reputation per trader from the edition bonus and the quests finished. */
export function reputationFromQuests(tasks: Task[], traders: Trader[], completed: ReadonlySet<string>, startingReputation: number): Record<string, number> {
  const rep: Record<string, number> = {}
  for (const t of traders) rep[t.id] = NO_EDITION_BONUS.has(t.normalizedName) ? 0 : startingReputation
  for (const task of tasks) {
    if (!completed.has(task.id)) continue
    for (const s of task.standing) rep[s.traderId] = (rep[s.traderId] ?? 0) + s.standing
  }
  // Two decimals, like the game shows it (and no floating-point dust such as 0.70000001).
  for (const id of Object.keys(rep)) rep[id] = Math.round(rep[id] * 1000) / 1000
  return rep
}

/** Highest loyalty level whose player level and reputation are met (levels must be met in order). */
export function loyaltyLevel(trader: Trader, playerLevel: number, reputation: number): number {
  let best = trader.levels[0]?.level ?? 1
  for (const l of trader.levels) {
    if (playerLevel >= l.playerLevel && reputation + 1e-9 >= l.reputation) best = l.level
    else break
  }
  return Math.max(1, best)
}

/** What the next loyalty level still needs, or null at the top. */
export function nextLoyalty(trader: Trader, level: number, playerLevel: number, reputation: number): { level: number; playerLevel: number; reputation: number; needLevel: number; needReputation: number } | null {
  const next = trader.levels.find((l) => l.level === level + 1)
  if (!next) return null
  return { ...next, needLevel: Math.max(0, next.playerLevel - playerLevel), needReputation: Math.max(0, Math.round((next.reputation - reputation) * 1000) / 1000) }
}

export function buildProgressContext(tasks: Task[], traders: Trader[], profile: Profile, opts: ProgressOptions): ProgressContext {
  const tasksById: Record<string, Task> = {}
  for (const t of tasks) tasksById[t.id] = t
  for (const t of opts.extraTasks ?? []) tasksById[t.id] ??= t
  const known = new Set([...profile.completedTaskIds, ...profile.activeTaskIds, ...profile.failedTaskIds])
  const inferred = inferCompleted(tasksById, known, profile.completedTaskIds)
  const completed = new Set([...profile.completedTaskIds, ...inferred])
  const level = Math.max(profile.playerLevel, levelFromXp(tasks, completed, opts.levelTable))
  const reputation = reputationFromQuests(tasks, traders, completed, opts.startingReputation)
  const calculatedTraderLevel: Record<string, number> = {}
  const traderLevel: Record<string, number> = {}
  for (const t of traders) {
    const calc = t.levels.length ? loyaltyLevel(t, level, reputation[t.id] ?? 0) : 1
    calculatedTraderLevel[t.id] = calc
    traderLevel[t.id] = Math.max(calc, opts.manualTraderLevels[t.id] ?? 0)
  }
  return { completed, inferred, active: profile.activeTaskIds, failed: profile.failedTaskIds, level, reputation, calculatedTraderLevel, traderLevel }
}

/** The level your finished quests' XP alone reaches (0 when the level table is not known). */
export function levelFromXp(tasks: Task[], completed: ReadonlySet<string>, table: PlayerLevel[] | null): number {
  if (!table?.length) return 0
  let xp = 0
  for (const t of tasks) if (completed.has(t.id)) xp += t.experience
  let level = 0
  for (const row of table) {
    if (row.exp <= xp) level = row.level
    else break
  }
  return level
}

/** Why a quest is locked, in words (empty = it can be taken). */
export interface LockReason {
  kind: 'level' | 'quest' | 'trader'
  text: string
  taskId?: string
  traderId?: string
}

const COMPARE: Record<string, (a: number, b: number) => boolean> = {
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '<': (a, b) => a < b,
  '=': (a, b) => a === b,
  '==': (a, b) => a === b,
}

/**
 * Whether one "quest X must be …" requirement is met.
 * - "complete": X is done (ticked or by deduction).
 * - "failed" (alone or with "complete"): X failed, or (with "complete") is done; a failed-only
 *   requirement can never be met once X is done, and is taken as met while X is still open (the
 *   app does not always learn about failures).
 * - "active": X has to be started; the app cannot always tell, so it is taken as met.
 */
export function isRequirementMet(status: string[], taskId: string, ctx: Pick<ProgressContext, 'completed' | 'failed'>): boolean {
  if (status.includes('active')) return true
  const done = ctx.completed.has(taskId)
  const failed = ctx.failed.has(taskId)
  if (status.includes('complete') && done) return true
  if (status.includes('failed')) return failed || (!done && !status.includes('complete'))
  return false
}

export function lockReasons(task: Task, ctx: ProgressContext, nameOf: (taskId: string) => string = () => 'an earlier quest', traderNameOf: (id: string) => string = () => 'the trader'): LockReason[] {
  const out: LockReason[] = []
  if (task.minPlayerLevel > ctx.level) out.push({ kind: 'level', text: `Level ${task.minPlayerLevel} (you: ${ctx.level})` })
  for (const r of task.taskRequirements) {
    if (isRequirementMet(r.status, r.taskId, ctx)) continue
    const how = r.status.includes('failed') && !r.status.includes('complete') ? 'failed' : r.status.includes('failed') ? 'done or failed' : 'done'
    out.push({ kind: 'quest', taskId: r.taskId, text: `${nameOf(r.taskId)} ${how}` })
  }
  for (const r of task.traderRequirements) {
    // Loyalty levels are the game's own gate; reputation gates (mostly Fence's scav karma) are shown but not enforced.
    if (r.type !== 'level') continue
    const have = ctx.traderLevel[r.traderId] ?? 1
    const ok = (COMPARE[r.compare] ?? COMPARE['>='])(have, r.value)
    if (!ok) out.push({ kind: 'trader', traderId: r.traderId, text: `${traderNameOf(r.traderId)} loyalty ${r.value} (you: ${have})` })
  }
  return out
}
