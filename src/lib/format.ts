const number = new Intl.NumberFormat('en-US')

export function formatNumber(n: number): string {
  return number.format(n)
}

export function formatRoubles(n: number | null | undefined): string {
  if (n == null) return '—'
  return `₽${number.format(n)}`
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
  return `${hours} h ago`
}
