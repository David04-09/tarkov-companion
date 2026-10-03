import type { PlayerLevel, Task } from '../api/types'

export interface LevelEstimate {
  /** Total XP from the completed quests' rewards. */
  questXp: number
  /** Highest level whose XP threshold the quest XP alone already passes. */
  minLevel: number
  /** XP still needed for the next level, from quest XP alone. */
  xpToNext: number | null
  completedCount: number
}

/**
 * Lower bound for the player's level from quest rewards only. Raids, kills,
 * looting and hideout crafting all give XP too, so the real level is at least
 * this. Uses the game's level table (items document, `playerLevels`).
 */
export function estimateLevelFromQuests(
  tasks: Task[],
  completedTaskIds: ReadonlySet<string>,
  levels: PlayerLevel[],
): LevelEstimate | null {
  if (levels.length === 0) return null
  let questXp = 0
  let completedCount = 0
  for (const t of tasks) {
    if (!completedTaskIds.has(t.id)) continue
    completedCount += 1
    questXp += t.experience
  }
  let minLevel = levels[0].level
  let next: PlayerLevel | null = null
  for (const row of levels) {
    if (row.exp <= questXp) minLevel = row.level
    else {
      next = row
      break
    }
  }
  return { questXp, minLevel, xpToNext: next ? next.exp - questXp : null, completedCount }
}
