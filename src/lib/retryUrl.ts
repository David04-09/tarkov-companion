/** Same picture under a new URL, so the browser asks again instead of reusing the failed answer. */
export function retryUrl(src: string, attempt: number): string {
  if (attempt === 0) return src
  return `${src}${src.includes('?') ? '&' : '?'}tcretry=${attempt}`
}
