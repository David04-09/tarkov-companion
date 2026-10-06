/**
 * Player stats from the game's own log files (desktop app): raids per map and their
 * length, time with the game open, flea market sales and income, flea rating, quests
 * handed in. The logs do not record kills, deaths or how a raid ended, so those are not here.
 */
import type { GameEvent, LogStatsData, SessionMode } from '../shared/desktop-api'

export interface RaidRecord {
  location: string
  /** Raid start (GameStarted) or, if the start was not logged, the raid-end time. */
  start: number
  /** Minutes from start to the end notification, when both were logged. */
  minutes: number | null
}

export interface LogStats {
  raids: RaidRecord[]
  raidMinutes: number
  byMap: { location: string; raids: number; minutes: number }[]
  /** Raids per local day, oldest first, for the last `days` days. */
  perDay: { day: string; date: number; raids: number }[]
  playMinutes: number
  sessions: number
  fleaSales: number
  fleaItems: number
  income: { RUB: number; USD: number; EUR: number }
  topSold: { itemId: string; count: number; income: number; currency: 'RUB' | 'USD' | 'EUR' | null }[]
  fleaExpired: number
  rating: { at: number; rating: number }[]
  questsFinished: number
  questsStarted: number
  questsFailed: number
  first: number | null
  last: number | null
}

const dayKey = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Raids from matched/started/ended events in time order (one mode's events). */
export function pairRaids(events: GameEvent[]): RaidRecord[] {
  const raids: RaidRecord[] = []
  let pending: { location: string; startedAt: number | null } | null = null
  for (const e of events) {
    if (e.kind === 'raidMatched') pending = { location: e.location, startedAt: null }
    else if (e.kind === 'raidStarted') {
      if (!pending) pending = { location: '', startedAt: e.at }
      else pending.startedAt = e.at
    } else if (e.kind === 'raidEnded') {
      const location = e.location || pending?.location || 'Unknown'
      const startedAt = pending?.startedAt ?? null
      // A start more than 3 hours before the end belongs to another raid whose end was never logged.
      const minutes = startedAt !== null && e.at - startedAt < 3 * 3_600_000 ? (e.at - startedAt) / 60_000 : null
      raids.push({ location, start: minutes !== null && startedAt !== null ? startedAt : e.at, minutes })
      pending = null
    }
  }
  return raids
}

export function computeLogStats(data: LogStatsData, mode: SessionMode, since: number | null, days = 30, now = Date.now()): LogStats {
  const inRange = (t: number) => since === null || t >= since
  const events = data.events.filter((e) => e.mode === mode && inRange(e.at)).sort((a, b) => a.at - b.at)
  const raids = pairRaids(events)

  const maps = new Map<string, { raids: number; minutes: number }>()
  for (const r of raids) {
    const m = maps.get(r.location) ?? { raids: 0, minutes: 0 }
    m.raids += 1
    m.minutes += r.minutes ?? 0
    maps.set(r.location, m)
  }

  const perDay: LogStats['perDay'] = []
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    perDay.push({ day: dayKey(d.getTime()), date: d.getTime(), raids: 0 })
  }
  const dayIndex = new Map(perDay.map((d, i) => [d.day, i]))
  for (const r of raids) {
    const i = dayIndex.get(dayKey(r.start))
    if (i !== undefined) perDay[i].raids += 1
  }

  const income = { RUB: 0, USD: 0, EUR: 0 }
  const sold = new Map<string, LogStats['topSold'][number]>()
  let fleaSales = 0
  let fleaItems = 0
  let fleaExpired = 0
  const rating: LogStats['rating'] = []
  const finished = new Set<string>()
  const started = new Set<string>()
  const failed = new Set<string>()
  for (const e of events) {
    if (e.kind === 'fleaSold') {
      fleaSales += 1
      fleaItems += e.count
      if (e.currency) income[e.currency] += e.income
      const s = sold.get(e.itemId) ?? { itemId: e.itemId, count: 0, income: 0, currency: e.currency }
      s.count += e.count
      if (e.currency === 'RUB' || s.currency === null) s.income += e.income
      sold.set(e.itemId, s)
    } else if (e.kind === 'fleaExpired') fleaExpired += 1
    else if (e.kind === 'fleaRating') rating.push({ at: e.at, rating: e.rating })
    else if (e.kind === 'taskFinished') finished.add(e.taskId)
    else if (e.kind === 'taskStarted') started.add(e.taskId)
    else if (e.kind === 'taskFailed') failed.add(e.taskId)
  }

  // Sessions are not tied to one mode (you can switch PvP/PvE in one launch): game-open time overall.
  const sessions = data.sessions.filter((s) => inRange(s.end))
  const playMinutes = sessions.reduce((n, s) => n + Math.max(0, s.end - Math.max(s.start, since ?? s.start)) / 60_000, 0)

  return {
    raids,
    raidMinutes: raids.reduce((n, r) => n + (r.minutes ?? 0), 0),
    byMap: [...maps.entries()].map(([location, v]) => ({ location, ...v })).sort((a, b) => b.raids - a.raids || a.location.localeCompare(b.location)),
    perDay,
    playMinutes,
    sessions: sessions.length,
    fleaSales,
    fleaItems,
    income,
    topSold: [...sold.values()].sort((a, b) => b.income - a.income || b.count - a.count).slice(0, 10),
    fleaExpired,
    rating,
    questsFinished: finished.size,
    questsStarted: started.size,
    questsFailed: failed.size,
    first: events.length ? events[0].at : null,
    last: events.length ? events[events.length - 1].at : null,
  }
}

/** "3 h 20 min", "45 min", "2 d 4 h". */
export function formatMinutes(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}
