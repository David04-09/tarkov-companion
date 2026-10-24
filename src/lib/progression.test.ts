import { describe, expect, it } from 'vitest'
import type { Task, Trader } from '../api/types'
import type { Profile } from '../store/progress'
import { buildProgressContext, inferCompleted, isRequirementMet, lockReasons, loyaltyLevel, nextLoyalty, reputationFromQuests } from './progression'
import { computeTaskStatuses } from './taskStatus'

const PRAPOR: Trader = {
  id: 'prapor',
  name: 'Prapor',
  normalizedName: 'prapor',
  imageLink: null,
  currency: 'RUB',
  resetTime: null,
  maxLevel: 4,
  levels: [
    { level: 1, playerLevel: 0, reputation: 0 },
    { level: 2, playerLevel: 6, reputation: 0.7 },
    { level: 3, playerLevel: 21, reputation: 2.7 },
    { level: 4, playerLevel: 36, reputation: 7.9 },
  ],
}
const FENCE: Trader = { ...PRAPOR, id: 'fence', name: 'Fence', normalizedName: 'fence', levels: [{ level: 0, playerLevel: 1, reputation: 0 }, { level: 1, playerLevel: 1, reputation: 0 }, { level: 2, playerLevel: 1, reputation: 6 }] }

const task = (id: string, o: Partial<Task> = {}): Task =>
  ({ id, name: id, minPlayerLevel: 0, taskRequirements: [], traderRequirements: [], standing: [], factionName: 'Any', trader: PRAPOR, ...o }) as unknown as Task
const req = (taskId: string, ...status: string[]) => ({ taskId, status })
const profile = (o: Partial<Profile> = {}): Profile => ({ playerLevel: 1, faction: 'USEC', completedTaskIds: new Set(), activeTaskIds: new Set(), failedTaskIds: new Set(), ...o })
const opts = { startingReputation: 0, manualTraderLevels: {}, levelTable: null }

describe('loyalty levels', () => {
  it('needs both the player level and the reputation, level by level', () => {
    expect(loyaltyLevel(PRAPOR, 5, 1)).toBe(1) // reputation enough for 2, level not
    expect(loyaltyLevel(PRAPOR, 6, 0.69)).toBe(1)
    expect(loyaltyLevel(PRAPOR, 6, 0.7)).toBe(2)
    expect(loyaltyLevel(PRAPOR, 40, 2.69)).toBe(2)
    expect(loyaltyLevel(PRAPOR, 40, 8)).toBe(4)
    expect(loyaltyLevel(FENCE, 1, 0)).toBe(1)
  })
  it('says what the next level needs', () => {
    expect(nextLoyalty(PRAPOR, 2, 15, 1.2)).toEqual({ level: 3, playerLevel: 21, reputation: 2.7, needLevel: 6, needReputation: 1.5 })
    expect(nextLoyalty(PRAPOR, 4, 50, 9)).toBeNull()
  })
})

describe('reputation from quests', () => {
  it('adds the edition bonus (not for Fence) and every finished quest, minus penalties', () => {
    const tasks = [task('a', { standing: [{ traderId: 'prapor', standing: 0.4 }] }), task('b', { standing: [{ traderId: 'prapor', standing: 0.3 }, { traderId: 'fence', standing: -0.1 }] }), task('c', { standing: [{ traderId: 'prapor', standing: 5 }] })]
    expect(reputationFromQuests(tasks, [PRAPOR, FENCE], new Set(['a', 'b']), 0.2)).toEqual({ prapor: 0.9, fence: -0.1 })
  })
})

describe('done by deduction', () => {
  it('a started or finished quest means everything it needed is done, down the line', () => {
    const tasks = [task('a'), task('b', { taskRequirements: [req('a', 'complete')] }), task('c', { taskRequirements: [req('b', 'complete')] }), task('d', { taskRequirements: [req('x', 'complete', 'failed')] }), task('x')]
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
    expect([...inferCompleted(byId, ['c'], new Set())].sort()).toEqual(['a', 'b'])
    // "completed or failed" says nothing certain about x.
    expect([...inferCompleted(byId, ['d'], new Set())]).toEqual([])
  })
  it('turns "locked" quests you plainly have into available, and counts their reputation', () => {
    const tasks = [
      task('debut', { standing: [{ traderId: 'prapor', standing: 0.5 }] }),
      task('checking', { taskRequirements: [req('debut', 'complete')], standing: [{ traderId: 'prapor', standing: 0.2 }] }),
      task('shootout', { taskRequirements: [req('checking', 'complete')] }),
      task('next', { taskRequirements: [req('shootout', 'complete')] }),
    ]
    // The log says "shootout" is started; nothing was ticked.
    const p = profile({ playerLevel: 10, activeTaskIds: new Set(['shootout']) })
    const ctx = buildProgressContext(tasks, [PRAPOR], p, opts)
    expect([...ctx.inferred].sort()).toEqual(['checking', 'debut'])
    expect(computeTaskStatuses(tasks, p, ctx)).toEqual({ debut: 'completed', checking: 'completed', shootout: 'available', next: 'locked' })
    expect(ctx.reputation.prapor).toBe(0.7)
    expect(ctx.traderLevel.prapor).toBe(2)
  })
})

describe('requirements', () => {
  const ctx = { completed: new Set(['done']), failed: new Set(['lost']) }
  it('reads complete / failed / active', () => {
    expect(isRequirementMet(['complete'], 'done', ctx)).toBe(true)
    expect(isRequirementMet(['complete'], 'open', ctx)).toBe(false)
    expect(isRequirementMet(['complete', 'failed'], 'lost', ctx)).toBe(true)
    expect(isRequirementMet(['complete', 'failed'], 'open', ctx)).toBe(false)
    expect(isRequirementMet(['failed'], 'lost', ctx)).toBe(true)
    expect(isRequirementMet(['failed'], 'done', ctx)).toBe(false)
    expect(isRequirementMet(['active'], 'open', ctx)).toBe(true)
  })
  it('uses the quest-XP level when it is higher, and trader loyalty as a gate', () => {
    const t = task('gated', { minPlayerLevel: 10, traderRequirements: [{ traderId: 'prapor', type: 'level', compare: '>=', value: 2 }] })
    // 9,000 XP from finished quests reaches level 12 in this table.
    const xp = task('xp', { experience: 9000 } as Partial<Task>)
    const table = [{ level: 1, exp: 0 }, { level: 11, exp: 8000 }, { level: 12, exp: 9000 }, { level: 13, exp: 10000 }]
    const low = buildProgressContext([t, xp], [PRAPOR], profile({ playerLevel: 1, completedTaskIds: new Set(['xp']) }), { ...opts, levelTable: table })
    expect(low.level).toBe(12)
    expect(lockReasons(t, low, undefined, () => 'Prapor').map((r) => r.text)).toEqual(['Prapor loyalty 2 (you: 1)'])
    // Set by hand in the Traders panel: the higher one counts.
    const set = buildProgressContext([t, xp], [PRAPOR], profile({ playerLevel: 1, completedTaskIds: new Set(['xp']) }), { ...opts, levelTable: table, manualTraderLevels: { prapor: 2 } })
    expect(lockReasons(t, set)).toEqual([])
  })
  it('a quest marked as "I have it" is available whatever the rules say', () => {
    const t = task('mine', { minPlayerLevel: 50 })
    const p = profile({ activeTaskIds: new Set(['mine']) })
    expect(computeTaskStatuses([t], p, buildProgressContext([t], [PRAPOR], p, opts))).toEqual({ mine: 'available' })
  })
})
