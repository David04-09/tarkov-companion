import { useMemo, useState } from 'react'
import { AlertTriangle, BookOpen, Clock, ExternalLink, Hourglass, RefreshCw } from 'lucide-react'
import { useStory, type StoryChapter } from '../api/storyWiki'
import { SegmentButton } from '../components/SegmentButton'
import { formatCountdown, timerPhase } from '../lib/storyTime'
import { useProgressStore } from '../store/progress'
import { useStoryStore } from '../store/story'
import { ChapterView } from '../story/ChapterView'
import { EndingsView } from '../story/EndingsView'
import { QuestGatesView } from '../story/QuestGatesView'
import { chapterCounts, openLink, shortTitle, useNow } from '../story/storyUtils'

type View = 'chapters' | 'endings' | 'gates'

/**
 * Main line first (the chapter that starts by itself, then whatever follows it through
 * "previous / leads to" or a start condition naming it), then the side chapters A–Z.
 */
function orderChapters(chapters: StoryChapter[]): { main: StoryChapter[]; side: StoryChapter[] } {
  const start = chapters.find((c) => /automatically/i.test(c.startHtml ?? '')) ?? chapters.find((c) => c.title === 'Tour')
  const main: StoryChapter[] = []
  for (let cur = start; cur && !main.includes(cur); ) {
    main.push(cur)
    const from: StoryChapter = cur
    cur =
      chapters.find((c) => !main.includes(c) && (c.previous.includes(from.title) || from.leadsTo.includes(c.title))) ??
      chapters.find((c) => !main.includes(c) && c.linkedChapters.includes(from.title) && c.previous.length === 0 && /story chapter|progressing/i.test(c.startHtml ?? ''))
  }
  const side = chapters.filter((c) => !main.includes(c)).sort((a, b) => a.title.localeCompare(b.title))
  return { main, side }
}

export function StoryPage() {
  const story = useStory()
  const mode = useProgressStore((s) => s.gameMode)
  const byChapter = useStoryStore((s) => s.byMode[mode])
  const now = useNow(30_000)
  const [view, setView] = useState<View>('chapters')
  const [selected, setSelected] = useState<string | null>(null)

  const chapters = story.data?.chapters
  const ordered = useMemo(() => (chapters ? orderChapters(chapters) : { main: [], side: [] }), [chapters])
  const titles = useMemo(() => new Set(chapters?.map((c) => c.title) ?? []), [chapters])
  const endingIcons = useMemo(() => Object.fromEntries((story.data?.endings?.endings ?? []).map((e) => [e.name, e.icon])), [story.data])

  if (story.isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-surface-2 px-6 py-16 text-ink-muted">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" aria-hidden />
        <p className="text-sm">Loading the story chapters from the Escape from Tarkov Wiki…</p>
      </div>
    )
  }
  if (!story.data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 px-5 py-5">
        <div className="flex items-center gap-2 text-danger"><AlertTriangle className="h-5 w-5" /><h2 className="font-semibold">Could not load the story chapters</h2></div>
        <p className="text-sm text-ink">{story.error instanceof Error ? story.error.message : 'The wiki is unreachable.'} The chapters come from the Escape from Tarkov Wiki; once loaded they also work offline.</p>
        <button type="button" onClick={() => void story.refetch()} className="btn">Try again</button>
      </div>
    )
  }

  const all = [...ordered.main, ...ordered.side]
  const current = all.find((c) => c.title === selected) ?? all.find((c) => {
    const n = chapterCounts(c, byChapter[c.slug])
    return n.done > 0 && n.done < n.total
  }) ?? all[0]
  const openChapter = (title: string) => {
    if (!titles.has(title)) return false
    setSelected(title)
    setView('chapters')
    window.scrollTo?.({ top: 0 })
    return true
  }
  const ticket = all.find((c) => c.guide.length > 1)
  const chosenEnding = ticket ? (ticket.guide.find((g) => g.label === byChapter[ticket.slug]?.path)?.ending ?? null) : null

  // Every running time gate in this game mode, soonest first.
  const timers = all
    .flatMap((c) => Object.entries(byChapter[c.slug]?.timers ?? {}).filter(([key]) => !byChapter[c.slug]?.done[key]).map(([key, t]) => ({ chapter: c, key, t, ...timerPhase(t.startedAt, t, now) })))
    .sort((a, b) => a.readyAt - b.readyAt)

  const listButton = (c: StoryChapter) => {
    const n = chapterCounts(c, byChapter[c.slug])
    const pct = n.total ? (n.done / n.total) * 100 : 0
    const running = timers.find((x) => x.chapter === c)
    const active = c === current && view === 'chapters'
    return (
      <li key={c.title}>
        <button
          type="button"
          onClick={() => openChapter(c.title)}
          className={`flex w-full items-center gap-2.5 rounded border px-2 py-1.5 text-left ${active ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface-3'}`}
        >
          {c.icon ? <img src={c.icon} alt="" className="h-9 w-7 shrink-0 object-contain" /> : <BookOpen className="h-5 w-5 text-ink-dim" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-ink">{shortTitle(c.title)}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <span className="h-1 w-20 overflow-hidden rounded bg-surface-3"><span className={`block h-full ${n.done === n.total && n.total ? 'bg-success' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></span>
              <span className="text-[10px] tabular-nums text-ink-dim">{n.done}/{n.total}</span>
              {running && <Hourglass className={`h-3 w-3 ${running.phase === 'waiting' ? 'text-info' : 'text-success'}`} />}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Story</h1>
          <p className="text-sm text-ink-muted">
            {all.length} chapters, 4 endings, every step with its guide, choices and waiting times ({mode === 'pve' ? 'PvE' : 'PvP'} progress).
          </p>
        </div>
        <div className="flex items-center gap-1 rounded border border-line bg-surface-2 p-0.5">
          <SegmentButton label="Chapters" active={view === 'chapters'} onClick={() => setView('chapters')} />
          <SegmentButton label="Endings" active={view === 'endings'} onClick={() => setView('endings')} />
          <SegmentButton label="Quest time gates" active={view === 'gates'} onClick={() => setView('gates')} />
        </div>
      </div>

      {timers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {timers.map((x) => (
            <button
              key={`${x.chapter.slug}:${x.key}`}
              type="button"
              onClick={() => openChapter(x.chapter.title)}
              className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${x.phase === 'waiting' ? 'border-info/50 bg-info/10 text-info' : 'border-success/50 bg-success/10 text-success'}`}
              title={x.t.label}
            >
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium">{shortTitle(x.chapter.title)}</span>
              {x.phase === 'waiting' ? `ready in ${formatCountdown(x.readyAt - now)}` : x.phase === 'maybe' ? 'may be ready now' : 'ready'}
            </button>
          ))}
        </div>
      )}

      {story.data.missing.length > 0 && (
        <p className="mt-3 text-xs text-danger">
          Could not load: {story.data.missing.map((m) => (
            <button key={m.title} type="button" onClick={() => openLink(`https://escapefromtarkov.fandom.com/wiki/${encodeURIComponent(m.title.replace(/ /g, '_'))}`)} className="mx-1 inline-flex items-center gap-0.5 underline">{m.title} <ExternalLink className="h-3 w-3" /></button>
          ))}
        </p>
      )}

      <div className="mt-4">
        {view === 'chapters' && current && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
            <nav aria-label="Story chapters" className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div>
                <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">Main story</h2>
                <ul className="space-y-0.5">{ordered.main.map(listButton)}</ul>
              </div>
              <div>
                <h2 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">Side chapters</h2>
                <ul className="space-y-0.5">{ordered.side.map(listButton)}</ul>
              </div>
              <p className="px-2 text-[10px] text-ink-dim">Updated from the wiki {new Date(story.data.fetchedAt).toLocaleDateString()}.</p>
            </nav>
            <ChapterView key={current.slug} chapter={current} mode={mode} progress={byChapter[current.slug]} endingIcons={endingIcons} chapterTitles={titles} onChapter={openChapter} />
          </div>
        )}
        {view === 'endings' &&
          (story.data.endings ? (
            <EndingsView endings={story.data.endings} chapters={all} chosen={chosenEnding} onChapter={openChapter} />
          ) : (
            <p className="text-sm text-ink-muted">The endings page could not be loaded from the wiki.</p>
          ))}
        {view === 'gates' && <QuestGatesView />}
      </div>
    </div>
  )
}
