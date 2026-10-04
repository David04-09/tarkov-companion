import { useEffect, useState } from 'react'
import type { StoryChapter, StoryObjective } from '../api/storyWiki'
import { isDesktop } from '../desktop/useDesktop'
import type { ChapterProgress } from '../store/story'

export function openLink(url: string) {
  if (isDesktop()) void window.desktop?.openExternal(url)
  else window.open(url, '_blank', 'noreferrer')
}

/** Current time, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export const shortTitle = (t: string) => t.replace(/\s*\(story chapter\)/i, '')

/** Objectives shown for the chosen ending path (The Ticket); everything for other chapters. */
export function visibleObjectives(chapter: StoryChapter, progress: ChapterProgress | undefined): { list: StoryObjective[]; tab: number } {
  const tab = Math.max(0, chapter.guide.findIndex((t) => t.label === progress?.path))
  const ending = chapter.guide[tab]?.ending ?? null
  const list = chapter.objectives.filter((o) => !ending || !o.endings.length || o.endings.includes(ending))
  return { list, tab }
}

/** Required objectives done / total, for the chapter list and the header. */
export function chapterCounts(chapter: StoryChapter, progress: ChapterProgress | undefined) {
  const { list } = visibleObjectives(chapter, progress)
  const required = list.filter((o) => !o.optional)
  const done = required.filter((o) => progress?.done[o.key]).length
  return { done, total: required.length }
}
