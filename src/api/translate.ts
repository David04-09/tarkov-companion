import { fetchJson, modePath, type EndpointName, type GameMode } from './client'
import type { TranslatedBaseDoc, TranslationDict, TranslationDoc } from './types'

export type Translator = (key: string | null | undefined, fallback?: string) => string

/**
 * Builds a lookup function over a translation dictionary. Falls back to the
 * provided fallback (or the key itself) when a key is missing or empty.
 */
export function makeTranslator(dict: TranslationDict): Translator {
  return (key, fallback) => {
    if (!key) return fallback ?? ''
    const value = dict[key]
    if (typeof value === 'string' && value.trim().length > 0) return value
    return fallback ?? key
  }
}

/**
 * Downloads a base document and its English translation document in parallel.
 *
 * Observed on 2026-10-02: the base documents do NOT contain readable English.
 * Translated fields hold keys such as "657315ddab5a49b71f098853 name", so the
 * "_en" document is always required for display.
 */
export async function fetchTranslated<TData>(
  gameMode: GameMode,
  endpoint: EndpointName,
  signal?: AbortSignal,
): Promise<{ doc: TranslatedBaseDoc<TData>; t: Translator }> {
  const [doc, en] = await Promise.all([
    fetchJson<TranslatedBaseDoc<TData>>(modePath(gameMode, endpoint), signal),
    fetchJson<TranslationDoc>(modePath(gameMode, endpoint, 'en'), signal),
  ])
  return { doc, t: makeTranslator(en.data ?? {}) }
}
