import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGameData } from '../api/hooks'
import type { Task } from '../api/types'
import { WIKI_QUESTS_VERSION, fetchWikiQuestIndex, fetchWikiQuestPages, missingTitles, questInMode, titlesKey, toWikiTask } from '../api/wikiQuests'
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
