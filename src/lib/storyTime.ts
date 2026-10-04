/**
 * Time gates in story chapters. The wiki writes them as prose in the guide
 * ("Wait 3-5 hours then visit Prapor…", "Wait 1 and half a hour for Mr. Kerman…"),
 * so these helpers read a duration range out of such text and describe timers.
 */

export interface WaitRange {
  /** Hours (fractions allowed). */
  minH: number
  maxH: number
}

const UNIT_HOURS: Record<string, number> = { minute: 1 / 60, min: 1 / 60, hour: 1, hr: 1, h: 1, day: 24 }

function unitHours(unit: string): number {
  const u = unit.toLowerCase().replace(/s$/, '')
  return UNIT_HOURS[u] ?? 1
}

const num = (s: string) => Number(s.replace(',', '.'))

/**
 * First waiting time mentioned in `text`, or null. Prefers a number that follows
 * "wait" ("Wait 6-12 hours"), then any "N hours" / "N-M minutes" phrase.
 */
export function parseWait(text: string): WaitRange | null {
  const t = text.replace(/\s+/g, ' ')
  // "1 and half a hour", "1 and a half hours"
  const half = /(\d+)\s+and\s+(?:a\s+)?half\s+(?:an?\s+)?(hours?|hrs?)/i.exec(t)
  // "half an hour"
  const halfOnly = /\bhalf\s+an?\s+hour/i.exec(t)
  const range = /(\d+(?:[.,]\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:[.,]\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|days?)\b/i
  const single = /(\d+(?:[.,]\d+)?)\s*(minutes?|mins?|hours?|hrs?|h|days?)\b/i

  const candidates: { at: number; value: WaitRange }[] = []
  const r = range.exec(t)
  if (r) {
    const k = unitHours(r[3])
    candidates.push({ at: r.index, value: { minH: num(r[1]) * k, maxH: num(r[2]) * k } })
  }
  const s = single.exec(t)
  if (s) {
    const v = num(s[1]) * unitHours(s[2])
    candidates.push({ at: s.index, value: { minH: v, maxH: v } })
  }
  if (half) {
    const v = Number(half[1]) + 0.5
    candidates.push({ at: half.index, value: { minH: v, maxH: v } })
  }
  if (halfOnly) candidates.push({ at: halfOnly.index, value: { minH: 0.5, maxH: 0.5 } })
  if (!candidates.length) return null

  // A range wins over a single number found at the same place ("3-5 hours" also matches "5 hours").
  const waitAt = t.search(/\bwait/i)
  const score = (c: { at: number; value: WaitRange }) => (waitAt >= 0 && c.at >= waitAt ? c.at - waitAt : 10_000 + c.at)
  candidates.sort((a, b) => score(a) - score(b) || (b.value.maxH - b.value.minH) - (a.value.maxH - a.value.minH))
  const best = candidates[0]
  // "3-5 hours" is found by both patterns; keep the range form when they overlap.
  const asRange = candidates.find((c) => c.value.minH !== c.value.maxH && Math.abs(c.at - best.at) <= 6)
  return (asRange ?? best).value
}

/** "1 h", "3–5 h", "30 min", "1.5 h", "1–2 days". */
export function formatWait(w: WaitRange): string {
  const one = (h: number) => {
    if (h < 1 / 60) return `${Math.max(1, Math.round(h * 3600))} s`
    if (h < 1) return `${Math.round(h * 60)} min`
    if (h >= 48 && h % 24 === 0) return `${h / 24} days`
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
  }
  if (w.minH === w.maxH) return one(w.minH)
  if (w.minH >= 1 && w.maxH < 48) return `${Number.isInteger(w.minH) ? w.minH : w.minH.toFixed(1)}–${one(w.maxH)}`
  return `${one(w.minH)} – ${one(w.maxH)}`
}

/** "2 h 05 min", "12 min", "45 s". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`
  return `${Math.floor(h / 24)} d ${h % 24} h`
}

export type TimerPhase = 'waiting' | 'maybe' | 'ready'

/** Where a running wait stands: before the earliest time, inside the window, or past the latest. */
export function timerPhase(startedAt: number, w: WaitRange, now: number): { phase: TimerPhase; readyAt: number; latestAt: number } {
  const readyAt = startedAt + w.minH * 3_600_000
  const latestAt = startedAt + w.maxH * 3_600_000
  const phase: TimerPhase = now < readyAt ? 'waiting' : now < latestAt ? 'maybe' : 'ready'
  return { phase, readyAt, latestAt }
}

/** Lowercase words without links/punctuation, for matching objectives to guide headings. */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\(optional\)/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
}
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'in', 'on', 'for', 'from', 'with', 'or', 'about', 'your', 'his', 'her'])

/** 0..1: how well an objective's words are covered by a guide heading part. */
export function headingMatch(objective: string, heading: string): number {
  const o = wordsOf(objective)
  const h = new Set(wordsOf(heading))
  if (!o.length || !h.size) return 0
  let hit = 0
  for (const w of o) if (h.has(w)) hit++
  const cover = hit / o.length
  const reverse = hit / h.size
  // Short headings ("Terminal", "Skier - Customs") fully contained in the objective still count.
  const short = h.size <= 2 && hit === h.size ? 0.6 : 0
  return Math.min(1, Math.max(short, cover * 0.7 + reverse * 0.3))
}

/**
 * For each objective, the index of the guide section that explains it (or -1).
 * Headings may join several objectives with "/" ("Locate X/Obtain Y"). The guide follows
 * the objective order, so this is an in-order alignment: the best total match where section
 * indexes never go backwards (repeated steps like "Wait for information from Prapor" land
 * on their own sections, and a later heading that merely shares words can't jump the queue).
 */
export function matchObjectivesToSections(objectives: string[], headings: string[]): number[] {
  const MIN = 0.5
  const parts = headings.map((h) => h.split('/').map((p) => p.trim()).filter(Boolean))
  const gain = objectives.map((o) =>
    headings.map((h, i) => {
      const s = Math.max(headingMatch(o, h), ...parts[i].map((p) => headingMatch(o, p)))
      return s >= MIN ? s - MIN + 0.05 : -1
    }),
  )
  const n = objectives.length
  const m = headings.length
  // best[j + 1] = best total so far with the last used section index j (-1 = none yet).
  let best: number[] = new Array(m + 1).fill(-Infinity)
  best[0] = 0
  const back: Int32Array[] = []
  for (let i = 0; i < n; i++) {
    const next: number[] = best.slice() // objective i left unmatched
    const from = new Int32Array(m + 1).fill(-2) // -2 = unmatched (kept the same state)
    let runMax = -Infinity
    let runArg = -1
    for (let j = 0; j <= m; j++) {
      if (best[j] > runMax) {
        runMax = best[j]
        runArg = j
      }
      if (j === 0) continue
      const g = gain[i][j - 1]
      if (g < 0 || runMax === -Infinity) continue
      const v = runMax + g
      if (v > next[j]) {
        next[j] = v
        from[j] = runArg
      }
    }
    back.push(from)
    best = next
  }
  let j = best.indexOf(Math.max(...best))
  const out = new Array<number>(n).fill(-1)
  for (let i = n - 1; i >= 0; i--) {
    const f = back[i][j]
    if (f === -2) continue
    out[i] = j - 1
    j = f
  }
  return out
}
