import type { Task, TaskRequirement } from '../api/types'
import type { Faction, Profile } from '../store/progress'

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

/**
 * We only track completion. A requirement whose allowed states include
 * "complete" is satisfied once that task is marked complete. Requirements that
 * only ask for "active" or "failed" cannot be checked and are treated as met.
 */
export function isRequirementMet(req: TaskRequirement, completed: ReadonlySet<string>): boolean {
  if (!req.status.includes('complete')) return true
  return completed.has(req.taskId)
}

export function computeTaskStatus(task: Task, profile: Profile): TaskStatus {
  if (profile.completedTaskIds.has(task.id)) return 'completed'
  if (task.minPlayerLevel > profile.playerLevel) return 'locked'
  for (const req of task.taskRequirements) {
    if (!isRequirementMet(req, profile.completedTaskIds)) return 'locked'
  }
  return 'available'
}

export function computeTaskStatuses(tasks: Task[], profile: Profile): Record<string, TaskStatus> {
  const out: Record<string, TaskStatus> = {}
  for (const t of tasks) out[t.id] = computeTaskStatus(t, profile)
  return out
}

export function countStatuses(statuses: Record<string, TaskStatus>): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = { available: 0, locked: 0, completed: 0 }
  for (const s of Object.values(statuses)) counts[s] += 1
  return counts
}
