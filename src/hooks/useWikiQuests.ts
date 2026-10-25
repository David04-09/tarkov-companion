import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGameData, type GameDataOptions } from '../api/hooks'
import type { Task } from '../api/types'
import { WIKI_QUESTS_VERSION, fetchWikiQuestIndex, fetchWikiQuestPages, missingTitles, questInMode, titlesKey, toWikiTask, withWiki, type WikiQuestKind } from '../api/wikiQuests'
import { useProgressStore } from '../store/progress'

const ONE_DAY = 24 * 60 * 60 * 1000

/**
 * Quests the EFT Wiki lists that this mode's game data lacks, as Tasks (Quests tab). The wiki is
 * asked at most once a day (kept in the offline cache); past quests only while `past` is on.
 */
export function useWikiQuests(past: boolean) {
  const mode = useProgressStore((s) => s.gameMode)
  const data = useGameData().data
  const index = useQuery({
    queryKey: ['wikiQuestIndex', WIKI_QUESTS_VERSION] as const,
    queryFn: ({ signal }) => fetchWikiQuestIndex(signal),
    staleTime: ONE_DAY,
  })
  const titles = useMemo(() => {
    if (!index.data || !data) return null
    const historical = new Set(index.data.historical)
    const missing = missingTitles(index.data, data.tasks, true)
    return { current: missing.filter((t) => !historical.has(t)), past: missing.filter((t) => historical.has(t)) }
  }, [index.data, data])
  const currentPages = useQuery({
    queryKey: ['wikiQuestPages', WIKI_QUESTS_VERSION, titlesKey(titles?.current ?? [])] as const,
    queryFn: ({ signal }) => fetchWikiQuestPages(titles!.current, index.data!, signal),
    enabled: Boolean(titles),
    staleTime: ONE_DAY,
  })
  const pastPages = useQuery({
    queryKey: ['wikiQuestPages', WIKI_QUESTS_VERSION, titlesKey(titles?.past ?? [])] as const,
    queryFn: ({ signal }) => fetchWikiQuestPages(titles!.past, index.data!, signal),
    enabled: past && Boolean(titles),
    staleTime: ONE_DAY,
  })
  const tasks = useMemo<Task[]>(() => {
    if (!data || !currentPages.data) return []
    const pages = [...currentPages.data, ...(past ? (pastPages.data ?? []) : [])].filter((p) => questInMode(p, mode))
    const wikiTitles = new Set(pages.map((p) => p.title))
    return pages.map((p) => toWikiTask(p, data, wikiTitles, mode))
  }, [data, currentPages.data, pastPages.data, past, mode])
  const error = index.error ?? currentPages.error ?? (past ? pastPages.error : null)
  const loading = index.isPending || (Boolean(titles) && currentPages.isPending) || (past && Boolean(titles) && pastPages.isPending)
  const retry = () => {
    if (index.isError) void index.refetch()
    if (currentPages.isError) void currentPages.refetch()
    if (pastPages.isError) void pastPages.refetch()
  }
  return { tasks, loading, error, retry }
}

export type WikiKinds = Record<WikiQuestKind, boolean>
const WIKI_KINDS_KEY = 'tc-quests-wiki'
export const WIKI_KINDS: WikiQuestKind[] = ['regular', 'event', 'seasonal', 'arena', 'past']
const WIKI_KINDS_DEFAULT: WikiKinds = { regular: true, event: true, seasonal: false, arena: false, past: false }

/** Which kinds of wiki quests to list (the Quests tab's switches; new and event quests by default). */
export function loadWikiKinds(): WikiKinds {
  try {
    const saved = JSON.parse(localStorage.getItem(WIKI_KINDS_KEY) ?? '{}') as Partial<Record<string, unknown>>
    return Object.fromEntries(WIKI_KINDS.map((k) => [k, typeof saved[k] === 'boolean' ? saved[k] : WIKI_KINDS_DEFAULT[k]])) as WikiKinds
  } catch {
    return { ...WIKI_KINDS_DEFAULT }
  }
}

export function saveWikiKinds(kinds: WikiKinds) {
  try {
    localStorage.setItem(WIKI_KINDS_KEY, JSON.stringify(kinds))
  } catch {
    // remembering the switches is only a convenience
  }
}

/**
 * Game data plus the wiki-only quests the Quests tab lists, for the maps. Past and Arena quests
 * never go on the maps (they are not in the game you play).
 */
export function useGameDataWithWiki(opts?: GameDataOptions) {
  const query = useGameData(opts)
  const wiki = useWikiQuests(false)
  const [kinds] = useState(loadWikiKinds)
  const wikiTasks = useMemo(() => wiki.tasks.filter((t) => t.wiki && t.wiki.kind !== 'past' && t.wiki.kind !== 'arena' && kinds[t.wiki.kind]), [wiki.tasks, kinds])
  const data = useMemo(() => (query.data ? withWiki(query.data, wikiTasks) : undefined), [query.data, wikiTasks])
  return { query, data, wikiTasks }
}
