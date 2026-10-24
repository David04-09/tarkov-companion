import type { Task } from '../api/types'
import type { Faction, Profile } from '../store/progress'
import { isRequirementMet, lockReasons, type ProgressContext } from './progression'

export type TaskStatus = 'available' | 'locked' | 'completed'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  available: 'Available',
  locked: 'Locked',
  completed: 'Completed',
}

/** USEC/BEAR-only tasks are hidden for the other faction. */
export function isFactionEligible(task: Task, faction: Faction): boolean {
  return task.factionName === 'Any' || task.factionName === faction
}

/** Without the full picture (no trader levels, no deduction): only what the profile says. */
function plainContext(profile: Profile): ProgressContext {
  return {
    completed: profile.completedTaskIds,
    inferred: new Set(),
    active: profile.activeTaskIds,
    failed: profile.failedTaskIds,
    level: profile.playerLevel,
    reputation: {},
    calculatedTraderLevel: {},
    traderLevel: {},
  }
}

/**
 * Completed (ticked, or done by deduction when a context is given) → completed. Started in game
 * or marked "I have this quest" → available, whatever the rules say (the game gave it to you).
 * Otherwise available when the level, the quests before it and the trader loyalty level are met
 * (see progression.ts); story counters and trader talks cannot be tracked and never lock.
 */
export function computeTaskStatus(task: Task, profile: Profile, ctx: ProgressContext = plainContext(profile)): TaskStatus {
  if (ctx.completed.has(task.id)) return 'completed'
  if (ctx.active.has(task.id)) return 'available'
  if (task.minPlayerLevel > ctx.level) return 'locked'
  for (const r of task.taskRequirements) if (!isRequirementMet(r.status, r.taskId, ctx)) return 'locked'
  return lockReasons(task, ctx).length ? 'locked' : 'available'
}

export function computeTaskStatuses(tasks: Task[], profile: Profile, ctx?: ProgressContext): Record<string, TaskStatus> {
  const c = ctx ?? plainContext(profile)
  const out: Record<string, TaskStatus> = {}
  for (const t of tasks) out[t.id] = computeTaskStatus(t, profile, c)
  return out
}

export function countStatuses(statuses: Record<string, TaskStatus>): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = { available: 0, locked: 0, completed: 0 }
  for (const s of Object.values(statuses)) counts[s] += 1
  return counts
}
