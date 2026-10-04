import { useMemo, useState } from 'react'
import { BookOpen, Check, ChevronDown, ChevronRight, Clock, ExternalLink, GitFork, Hourglass, Images, RotateCcw, Scale, Timer, X } from 'lucide-react'
import type { GameMode } from '../api/client'
import type { StoryChapter, StoryObjective } from '../api/storyWiki'
import { Lightbox } from '../components/QuestGuide'
import { formatCountdown, formatWait, timerPhase } from '../lib/storyTime'
import { useStoryStore, type ChapterProgress } from '../store/story'
import { RichHtml } from './RichHtml'
import { chapterCounts, openLink, shortTitle, useNow, visibleObjectives } from './storyUtils'

const clock = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

function EndingBadges({ endings, icons }: { endings: string[]; icons: Record<string, string | null> }) {
  if (!endings.length) return null
  return (
    <span className="ml-1 inline-flex items-center gap-1">
      {endings.map((e) => (
        <span key={e} title={`${e} ending`} className="inline-flex items-center gap-0.5 rounded border border-line bg-surface px-1 py-px text-[10px] font-medium text-ink-muted">
          {icons[e] && <img src={icons[e] as string} alt="" className="h-3.5 w-3.5 object-contain" />}
          {e}
        </span>
      ))}
    </span>
  )
}

function WaitControl({ objective, timer, now, onStart, onClear }: {
  objective: StoryObjective
  timer: ChapterProgress['timers'][string] | undefined
  now: number
  onStart: () => void
  onClear: () => void
}) {
  if (!objective.wait) {
    return <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-dim"><Hourglass className="h-3.5 w-3.5" /> The wiki gives no waiting time for this step: check back with the trader now and then.</p>
  }
  if (!timer) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="flex items-center gap-1 text-info"><Hourglass className="h-3.5 w-3.5" /> Time gate: {formatWait(objective.wait)}</span>
        <button type="button" onClick={onStart} className="btn !px-2 !py-0.5 text-[11px]"><Timer className="h-3.5 w-3.5" /> Start timer now</button>
        <span className="text-ink-dim">(starts by itself when you tick the step before)</span>
      </div>
    )
  }
  const { phase, readyAt, latestAt } = timerPhase(timer.startedAt, timer, now)
  const ranged = timer.minH !== timer.maxH
  const tone = phase === 'waiting' ? 'border-info/50 bg-info/10 text-info' : phase === 'maybe' ? 'border-accent/60 bg-accent/10 text-accent' : 'border-success/50 bg-success/10 text-success'
  return (
    <div className={`mt-1 flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-[11px] ${tone}`}>
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {phase === 'waiting' && <>Ready in <b>{formatCountdown(readyAt - now)}</b> · {ranged ? `between ${clock(readyAt)} and ${clock(latestAt)}` : `at ${clock(readyAt)}`}</>}
        {phase === 'maybe' && <>May be ready now: the wiki says {formatWait(timer)}, so at the latest by <b>{clock(latestAt)}</b> ({formatCountdown(latestAt - now)}).</>}
        {phase === 'ready' && <>Should be ready: go check with the trader (timer started {clock(timer.startedAt)}).</>}
      </span>
      <button type="button" onClick={onStart} title="Restart the timer from now" className="rounded p-0.5 hover:bg-white/10"><RotateCcw className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={onClear} title="Remove the timer" className="rounded p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}

export function ChapterView({
  chapter,
  mode,
  progress,
  endingIcons,
  chapterTitles,
  onChapter,
}: {
  chapter: StoryChapter
  mode: GameMode
  progress: ChapterProgress | undefined
  endingIcons: Record<string, string | null>
  /** Titles of all chapters (links to anything else are not chapter links). */
  chapterTitles: Set<string>
  onChapter: (title: string) => boolean
}) {
  const store = useStoryStore()
  const now = useNow()
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [confirmReset, setConfirmReset] = useState(false)
  const [allGuide, setAllGuide] = useState(false)
  const { list, tab } = useMemo(() => visibleObjectives(chapter, progress), [chapter, progress])
  const guideTab = chapter.guide[tab]
  const { done, total } = chapterCounts(chapter, progress)
  const timers = progress?.timers ?? {}

  const startTimer = (o: StoryObjective) => {
    if (!o.wait) return
    store.startTimer(mode, chapter.slug, o.key, { minH: o.wait.minH, maxH: o.wait.maxH, label: `${chapter.title.replace(/\s*\(story chapter\)/i, '')}: ${o.text}` })
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
  }

  const toggle = (o: StoryObjective, value: boolean) => {
    store.setDone(mode, chapter.slug, o.key, value)
    if (!value) return
    // Ticking the step before a time gate starts its timer.
    const i = list.indexOf(o)
    const next = list.slice(i + 1).find((n) => n.depth <= o.depth && !n.optional)
    if (next?.isWait && next.wait && !timers[next.key] && !progress?.done[next.key]) startTimer(next)
    if (o.isWait && timers[o.key]) store.setTimer(mode, chapter.slug, o.key, null)
  }

  const toggleOpen = (key: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const pct = total ? Math.round((done / total) * 100) : 0
  const name = shortTitle(chapter.title)
  const isOther = (t: string) => t !== chapter.title && chapterTitles.has(t)
  const previous = chapter.previous.filter(isOther)
  const leadsTo = chapter.leadsTo.filter(isOther)
  const mentions = chapter.linkedChapters.filter((t) => isOther(t) && !previous.includes(t) && !leadsTo.includes(t))
  const related = [...previous, ...leadsTo, ...mentions]
  const waits = list.filter((o) => o.isWait)
  // A branch header goes above the first objective of each branch.
  const branchRows = list.map((o, i) => (i === 0 ? (o.branch ?? undefined) : o.branch !== list[i - 1].branch ? o.branch : undefined))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
        {chapter.banner && <img src={chapter.banner} alt="" className="h-20 w-full object-cover opacity-80 sm:h-24" />}
        <div className="flex flex-wrap items-start gap-3 p-4">
          {chapter.icon && <img src={chapter.icon} alt="" className="h-14 w-11 shrink-0 object-contain" />}
          <div className="min-w-[12rem] flex-1">
            <h2 className="text-xl font-semibold">{name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <div className="h-1.5 w-40 overflow-hidden rounded bg-surface-3"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
              {done} / {total} required steps{done === total && total > 0 ? ' · complete' : ''}
              {waits.length > 0 && <span className="flex items-center gap-1 text-info"><Hourglass className="h-3.5 w-3.5" /> {waits.length} time gate{waits.length === 1 ? '' : 's'}</span>}
            </div>
            {chapter.description && <p className="mt-2 border-l-2 border-accent-dim pl-3 text-sm italic text-ink-muted">{chapter.description}</p>}
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            <button type="button" onClick={() => openLink(chapter.pageUrl)} className="inline-flex items-center gap-1 text-xs text-accent underline">Wiki page <ExternalLink className="h-3 w-3" /></button>
            <button
              type="button"
              onClick={() => {
                if (!confirmReset) return setConfirmReset(true)
                store.resetChapter(mode, chapter.slug)
                setConfirmReset(false)
              }}
              className={`text-xs ${confirmReset ? 'text-danger' : 'text-ink-dim hover:text-ink'}`}
            >
              {confirmReset ? 'Click again to clear this chapter' : 'Reset progress'}
            </button>
          </div>
        </div>
        {related.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2 text-xs">
            <GitFork className="h-3.5 w-3.5 text-ink-dim" />
            {previous.length > 0 && <span className="text-ink-dim">After</span>}
            {previous.map((t) => <ChapterChip key={`p${t}`} title={t} onChapter={onChapter} />)}
            {leadsTo.length > 0 && <span className="text-ink-dim">Leads to</span>}
            {leadsTo.map((t) => <ChapterChip key={`l${t}`} title={t} onChapter={onChapter} />)}
            {mentions.length > 0 && <span className="text-ink-dim">Connected with</span>}
            {mentions.map((t) => <ChapterChip key={`m${t}`} title={t} onChapter={onChapter} />)}
          </div>
        )}
      </div>

      {/* How it starts */}
      {chapter.startHtml && (
        <section className="rounded-lg border border-line bg-surface-2 p-4">
          <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><BookOpen className="h-3.5 w-3.5 text-accent" /> How the chapter starts</h3>
          <RichHtml html={chapter.startHtml} onImage={setLightbox} onChapter={onChapter} />
        </section>
      )}

      {/* Ending path (The Ticket) */}
      {chapter.guide.length > 1 && (
        <section className="rounded-lg border border-accent/40 bg-accent/5 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><Scale className="h-3.5 w-3.5 text-accent" /> Which ending are you going for?</h3>
          <div className="flex flex-wrap gap-2">
            {chapter.guide.map((g, i) => (
              <button
                key={g.label}
                type="button"
                onClick={() => store.setPath(mode, chapter.slug, g.label)}
                aria-pressed={i === tab}
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm ${i === tab ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface text-ink-muted hover:text-ink'}`}
              >
                {g.ending && endingIcons[g.ending] && <img src={endingIcons[g.ending] as string} alt="" className="h-5 w-5 object-contain" />}
                {g.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">Objectives and the step-by-step guide below follow this path. Steps shared by every path always show.</p>
        </section>
      )}

      {/* Objectives */}
      <section className="rounded-lg border border-line bg-surface-2">
        <h3 className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <Check className="h-3.5 w-3.5 text-accent" /> Objectives ({list.length})
          <span className="ml-auto font-normal normal-case tracking-normal text-ink-dim">Tick steps as you do them. “Guide” shows how.</span>
        </h3>
        <ul className="divide-y divide-line/60">
          {list.map((o, index) => {
            const branchRow = branchRows[index]
            const isDone = Boolean(progress?.done[o.key])
            const sectionIndex = o.sections[tab] ?? -1
            const section = sectionIndex >= 0 ? guideTab?.sections[sectionIndex] : undefined
            const isOpen = open.has(o.key)
            return (
              <li key={o.key}>
                {branchRow !== undefined && (
                  <div className={`flex flex-wrap items-center gap-1 px-4 py-1.5 text-xs font-semibold ${branchRow ? 'bg-surface-3 text-accent' : 'bg-surface-3/60 text-ink-dim'}`}>
                    <GitFork className="h-3.5 w-3.5" />
                    {branchRow ?? 'For everyone'}
                    <EndingBadges endings={o.endings} icons={endingIcons} />
                  </div>
                )}
                <div className={`flex items-start gap-2 px-4 py-1.5 ${o.depth ? 'pl-10' : ''} ${isDone ? 'opacity-55' : ''}`}>
                  <input type="checkbox" checked={isDone} onChange={(e) => toggle(o, e.target.checked)} aria-label={o.text} className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RichHtml html={o.html} className={`!text-sm ${isDone ? 'line-through' : '!text-ink'}`} onChapter={onChapter} />
                      {o.optional && <span className="rounded border border-line px-1 text-[10px] text-ink-dim">optional</span>}
                      {o.choice && <span className="flex items-center gap-0.5 rounded border border-accent/60 px-1 text-[10px] text-accent" title="A decision: it changes what comes later"><Scale className="h-3 w-3" /> choice</span>}
                      {o.isWait && o.wait && <span className="flex items-center gap-0.5 rounded border border-info/50 px-1 text-[10px] text-info"><Hourglass className="h-3 w-3" /> {formatWait(o.wait)}</span>}
                    </div>
                    {o.note && <p className="mt-0.5 text-[11px] text-ink-dim">{o.note}</p>}
                    {o.isWait && !isDone && (
                      <WaitControl objective={o} timer={timers[o.key]} now={now} onStart={() => startTimer(o)} onClear={() => store.setTimer(mode, chapter.slug, o.key, null)} />
                    )}
                    {isOpen && section && (
                      <div className="mt-1.5 rounded border border-line bg-surface p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-ink">{section.heading}{section.wait && <span className="font-normal text-info">· wait {formatWait(section.wait)}</span>}</div>
                        <RichHtml html={section.html || '<p>No details on the wiki for this step.</p>'} onImage={setLightbox} onChapter={onChapter} />
                      </div>
                    )}
                  </div>
                  {section && (
                    <button type="button" onClick={() => toggleOpen(o.key)} className={`flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] ${isOpen ? 'bg-accent/15 text-accent' : 'text-ink-muted hover:text-accent'}`}>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Guide{section.imageCount ? ` · ${section.imageCount}` : ''}
                      {section.imageCount > 0 && <Images className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Full guide */}
      {guideTab && guideTab.sections.length > 0 && (
        <section className="rounded-lg border border-line bg-surface-2">
          <h3 className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <BookOpen className="h-3.5 w-3.5 text-accent" /> Step-by-step guide{chapter.guide.length > 1 ? ` · ${guideTab.label}` : ''} ({guideTab.sections.filter((s) => !s.isBranch).length} steps, {guideTab.sections.reduce((n, s) => n + s.imageCount, 0)} pictures)
            <button type="button" onClick={() => setAllGuide((v) => !v)} className="ml-auto font-normal normal-case tracking-normal text-accent underline">{allGuide ? 'Collapse all' : 'Expand all'}</button>
          </h3>
          <div className="divide-y divide-line/60">
            {guideTab.sections.map((s, i) => (
              <details key={`${tab}-${i}-${allGuide}`} open={allGuide} className="group px-4 py-1.5">
                <summary className={`flex cursor-pointer list-none items-center gap-2 text-sm ${s.isBranch ? 'font-semibold text-accent' : 'text-ink'}`}>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-dim transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1">{s.heading}</span>
                  <EndingBadges endings={s.endings} icons={endingIcons} />
                  {s.wait && <span className="flex items-center gap-0.5 text-[11px] text-info"><Hourglass className="h-3 w-3" /> {formatWait(s.wait)}</span>}
                  {s.imageCount > 0 && <span className="flex items-center gap-0.5 text-[11px] text-ink-dim"><Images className="h-3 w-3" /> {s.imageCount}</span>}
                </summary>
                <div className="pb-2 pl-5 pt-1">
                  <RichHtml html={s.html || '<p>No details on the wiki for this step.</p>'} onImage={setLightbox} onChapter={onChapter} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {chapter.rewardsHtml && (
        <section className="rounded-lg border border-line bg-surface-2 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Rewards</h3>
          <RichHtml html={chapter.rewardsHtml} onImage={setLightbox} onChapter={onChapter} />
        </section>
      )}

      <p className="text-[10px] text-ink-dim">Chapter text, steps and pictures from the Escape from Tarkov Wiki (CC BY-SA 3.0). Waiting times are what the wiki reports; the game may differ slightly.</p>
      {lightbox !== null && chapter.images[lightbox] && <Lightbox images={chapter.images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />}
    </div>
  )
}

function ChapterChip({ title, onChapter }: { title: string; onChapter: (t: string) => boolean }) {
  return (
    <button type="button" onClick={() => onChapter(title)} className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink-muted hover:border-accent hover:text-accent">
      {shortTitle(title)}
    </button>
  )
}
