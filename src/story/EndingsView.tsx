import { useState } from 'react'
import { ExternalLink, GitFork, Star } from 'lucide-react'
import { ENDING_NAMES, type StoryChapter, type StoryEndings } from '../api/storyWiki'
import { Lightbox } from '../components/QuestGuide'
import { RichHtml } from './RichHtml'
import { openLink } from './storyUtils'

/** The four endings, what decides them (branches of The Ticket) and their rewards. */
export function EndingsView({
  endings,
  chapters,
  chosen,
  onChapter,
}: {
  endings: StoryEndings
  chapters: StoryChapter[]
  /** Ending the player picked in The Ticket, if any. */
  chosen: string | null
  onChapter: (title: string) => boolean
}) {
  const [lightbox, setLightbox] = useState<number | null>(null)
  // Branch headings in chapters that name the endings they lead to.
  const branchesFor = (ending: string) => {
    const out: { chapter: string; branch: string }[] = []
    for (const c of chapters) {
      const seen = new Set<string>()
      for (const o of c.objectives) {
        if (!o.branch || !o.endings.includes(ending) || seen.has(o.branch)) continue
        seen.add(o.branch)
        out.push({ chapter: c.title, branch: o.branch })
      }
    }
    return out
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-surface-2 p-4">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold">The four endings</h2>
          <button type="button" onClick={() => openLink(endings.pageUrl)} className="ml-auto inline-flex items-center gap-1 text-xs text-accent underline">Wiki page <ExternalLink className="h-3 w-3" /></button>
        </div>
        <RichHtml html={endings.introHtml} onImage={setLightbox} onChapter={onChapter} />
        {endings.images.some((img) => !ENDING_NAMES.includes(img.section as never)) && (
          <div className="wiki-content">
            <div className="wiki-gallery">
              {endings.images.map((img, i) => ENDING_NAMES.includes(img.section as never) ? null : (
                <button key={img.full} type="button" className="wiki-figure" onClick={() => setLightbox(i)}>
                  <img src={img.thumb} alt={img.caption} loading="lazy" />
                  <span>{img.caption || img.section}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {endings.endings.map((e) => {
          const paths = branchesFor(e.name)
          const isChosen = chosen === e.name
          return (
            <section key={e.name} className={`rounded-lg border p-4 ${isChosen ? 'border-accent bg-accent/5' : 'border-line bg-surface-2'}`}>
              <div className="flex items-start gap-3">
                {e.icon && <img src={e.icon} alt="" className="h-16 w-14 shrink-0 object-contain" />}
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    {e.name}
                    {isChosen && <span className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent"><Star className="h-3 w-3" /> your path</span>}
                  </h3>
                  {e.quote && <p className="mt-1 text-xs italic leading-relaxed text-ink-muted">{e.quote}</p>}
                </div>
              </div>
              {paths.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-dim"><GitFork className="h-3.5 w-3.5" /> Decided by</h4>
                  <ul className="space-y-0.5 text-xs text-ink-muted">
                    {paths.map((p) => (
                      <li key={`${p.chapter}|${p.branch}`}>
                        <button type="button" onClick={() => onChapter(p.chapter)} className="text-left hover:text-accent">
                          <span className="text-ink">{p.chapter}:</span> {p.branch}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {e.html && <RichHtml html={e.html} className="mt-2" onImage={setLightbox} onChapter={onChapter} />}
              {e.rewardsHtml && (
                <div className="mt-3">
                  <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">Rewards</h4>
                  <RichHtml html={e.rewardsHtml} onImage={setLightbox} onChapter={onChapter} />
                </div>
              )}
            </section>
          )
        })}
      </div>
      <p className="text-[10px] text-ink-dim">From the Escape from Tarkov Wiki (CC BY-SA 3.0).</p>
      {lightbox !== null && endings.images[lightbox] && <Lightbox images={endings.images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />}
    </div>
  )
}
