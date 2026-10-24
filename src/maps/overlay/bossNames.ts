/**
 * Names players use for a boss. The game data lists the Goons as their leader Knight (with Big Pipe
 * and Birdeye as his escorts), but everyone calls the squad "The Goons".
 */
const DISPLAY: Record<string, string> = { knight: 'The Goons' }
const ALSO_KNOWN: Record<string, string> = { knight: 'Big Pipe Birdeye Goons' }

export function bossName(key: string, dataName: string): string {
  return DISPLAY[key] ?? dataName
}

/** Extra words search should find the boss by (its game name, the squad's members). */
export function bossSearchWords(key: string, dataName: string): string {
  return [dataName, ALSO_KNOWN[key] ?? ''].join(' ').trim()
}
