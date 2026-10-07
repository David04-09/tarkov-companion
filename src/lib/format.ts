import { prefs } from '../store/prefs'

/** Thousands separator per Settings → General → Number style. */
const FORMATTERS = {
  comma: new Intl.NumberFormat('en-US'),
  space: new Intl.NumberFormat('fr-FR'),
  dot: new Intl.NumberFormat('de-DE'),
}

export function formatNumber(n: number): string {
  // fr-FR uses a narrow no-break space; a normal no-break space reads the same and copies better.
  return FORMATTERS[prefs().numberStyle].format(n).replace(/ /g, ' ')
}

/** 1.2M / 350K, for "compact prices". */
function compact(n: number): string {
  const abs = Math.abs(n)
  const [div, unit] = abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : [1e3, 'K']
  const v = n / div
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2
  const text = v.toFixed(digits).replace(/\.?0+$/, '')
  return `${prefs().numberStyle === 'dot' ? text.replace('.', ',') : text}${unit}`
}

export function formatRoubles(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (prefs().compactPrices && Math.abs(n) >= 100_000) return `₽${compact(n)}`
  return `₽${formatNumber(n)}`
}

export function formatObjectiveType(type: string): string {
  // "findQuestItem" -> "Find quest item"
  const spaced = type.replace(/([A-Z])/g, ' $1').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function formatTimeAgo(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}

/** Clock style per Settings → General → Time format. */
function hour12(): boolean | undefined {
  const f = prefs().timeFormat
  return f === 'system' ? undefined : f === '12h'
}

/** Date and time, e.g. for logs, backups, timers. Pass Intl options to narrow it down. */
export function formatDateTime(at: number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  const d = at instanceof Date ? at : new Date(at)
  if (Number.isNaN(d.getTime())) return '—'
  const withClock = opts.timeStyle || opts.hour ? { ...opts, hour12: hour12() } : opts
  return d.toLocaleString(undefined, withClock)
}

export function formatTime(at: number | Date): string {
  return formatDateTime(at, { hour: '2-digit', minute: '2-digit' })
}
