/**
 * Flea Market search the way the game does it: every word typed must appear somewhere in the
 * item's name or short name, in any order ("ps 5.45" finds "5.45x39mm PS gs"). Pure.
 */

/** The typed words, lower case. */
export function searchWords(needle: string): string[] {
  return needle.toLowerCase().split(/\s+/).filter(Boolean)
}

/** `hay` is the item's name and short name, lower case. */
export function matchesSearch(hay: string, words: string[]): boolean {
  return words.every((w) => hay.includes(w))
}

/**
 * Best matches first for the drop-down under the search box: the short name or name said
 * exactly, then names starting with the first word, then a word of the name starting with it,
 * then shorter names.
 */
export function rankMatch(name: string, shortName: string, words: string[]): number {
  const n = name.toLowerCase()
  const s = shortName.toLowerCase()
  const typed = words.join(' ')
  if (s === typed || n === typed) return 0
  if (n.startsWith(words[0] ?? '') || s.startsWith(words[0] ?? '')) return 1
  if (n.split(/[^a-z0-9.]+/).some((x) => x.startsWith(words[0] ?? ''))) return 2
  return 3
}
