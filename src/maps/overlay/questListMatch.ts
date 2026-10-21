/**
 * Finds quest names in the words read from a screenshot of the in-game quest list
 * (character Tasks screen or a trader's Tasks tab). Pure, so it can be tested.
 *
 * Words are grouped into lines, lines are split into cells where there is a wide gap
 * (the list has columns: name, trader, location, status…), and every run of words in
 * a cell is compared with every quest name. Only clear matches count: short names
 * must fill a whole cell exactly, longer ones may differ by a few misread letters.
 */
import type { OcrWord } from '../../scan/core'

export interface QuestNameEntry {
  name: string
  /** Every quest with this name (BEAR/USEC variants and repeats share a name). */
  ids: string[]
}

export interface QuestNameMatch {
  name: string
  ids: string[]
  /** What was read on the screenshot. */
  read: string
  /** 0..1, 1 = exact after normalising. */
  score: number
}

/** Lower-case letters and digits only; letters OCR confuses are folded together. */
export function normQuestText(s: string): string {
  return s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[0o]/g, 'o')
    .replace(/[1il|!]/g, 'l')
    .replace(/5/g, 's')
    .replace(/[^a-z0-9]/g, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length)
  return len === 0 ? 0 : 1 - levenshtein(a, b) / len
}

/** Names this short (normalised) must match a whole cell exactly ("Debut", "Scout", "Oil Run"). */
const SHORT = 6
/** Longer names: allowed similarity. */
const minScore = (len: number) => (len <= 9 ? 0.88 : 0.82)
/** Longest run of words tried as one name. */
const MAX_WORDS = 9

/** Words on one line, left to right, split into cells at wide gaps. */
export function questListCells(words: OcrWord[]): OcrWord[][] {
  const usable = words.filter((w) => w.text.trim() && w.y1 > w.y0)
  const sorted = [...usable].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)
  const lines: OcrWord[][] = []
  for (const w of sorted) {
    const h = w.y1 - w.y0
    const line = lines.find((l) => {
      const top = Math.max(...l.map((x) => x.y0))
      const bottom = Math.min(...l.map((x) => x.y1))
      const overlap = Math.min(bottom, w.y1) - Math.max(top, w.y0)
      return overlap > 0.5 * Math.min(h, bottom - top)
    })
    if (line) line.push(w)
    else lines.push([w])
  }
  const cells: OcrWord[][] = []
  for (const line of lines) {
    line.sort((a, b) => a.x0 - b.x0)
    const height = [...line.map((w) => w.y1 - w.y0)].sort((a, b) => a - b)[line.length >> 1]
    let cell: OcrWord[] = []
    for (const w of line) {
      const last = cell[cell.length - 1]
      if (last && w.x0 - last.x1 > 1.6 * height) {
        cells.push(cell)
        cell = []
      }
      cell.push(w)
    }
    if (cell.length) cells.push(cell)
  }
  return cells
}

/** Quest names grouped by their exact text (variants share one entry). */
export function questNameIndex(tasks: { id: string; name: string }[]): QuestNameEntry[] {
  const byName = new Map<string, QuestNameEntry>()
  for (const t of tasks) {
    const e = byName.get(t.name)
    if (e) e.ids.push(t.id)
    else byName.set(t.name, { name: t.name, ids: [t.id] })
  }
  return [...byName.values()]
}

/** Quest names found in the words, best read per quest. */
export function matchQuestNames(words: OcrWord[], index: QuestNameEntry[]): QuestNameMatch[] {
  const names = index.map((e) => ({ entry: e, norm: normQuestText(e.name) })).filter((n) => n.norm.length >= 3)
  const best = new Map<string, QuestNameMatch>()

  for (const cell of questListCells(words)) {
    const parts = cell.map((w) => normQuestText(w.text))
    // A long name the game cut short ("The Huntsman Path - Sadis…").
    const cut = /(\.\.\.|…)$/.test(cell[cell.length - 1].text.trim())
    const candidates: { entry: QuestNameEntry; start: number; end: number; score: number; len: number }[] = []
    for (let start = 0; start < parts.length; start++) {
      let text = ''
      for (let end = start; end < Math.min(parts.length, start + MAX_WORDS); end++) {
        text += parts[end]
        if (!text) continue
        const whole = start === 0 && end === parts.length - 1
        for (const n of names) {
          if (n.norm.length <= SHORT) {
            if (whole && text === n.norm) candidates.push({ entry: n.entry, start, end, score: 1, len: n.norm.length })
            continue
          }
          const target = cut && end === parts.length - 1 && text.length >= 10 && text.length < n.norm.length ? n.norm.slice(0, text.length) : n.norm
          if (Math.abs(text.length - target.length) > target.length * 0.2) continue
          const score = similarity(text, target)
          if (score >= minScore(target.length)) candidates.push({ entry: n.entry, start, end, score, len: target.length })
        }
      }
    }
    // Best first; a longer exact name beats a shorter one inside it ("Part 11" vs "Part 1").
    candidates.sort((a, b) => b.score - a.score || b.len - a.len)
    const used = new Set<number>()
    for (const c of candidates) {
      let free = true
      for (let i = c.start; i <= c.end; i++) if (used.has(i)) free = false
      if (!free) continue
      for (let i = c.start; i <= c.end; i++) used.add(i)
      // Just as good a fit for another quest ("Part 1" vs "Part 7" with the digit unreadable): no guessing.
      if (candidates.some((o) => o.entry !== c.entry && o.score >= c.score && o.start <= c.end && o.end >= c.start)) continue
      const read = cell.slice(c.start, c.end + 1).map((w) => w.text).join(' ')
      const prev = best.get(c.entry.name)
      if (!prev || c.score > prev.score) best.set(c.entry.name, { name: c.entry.name, ids: c.entry.ids, read, score: c.score })
    }
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name))
}
