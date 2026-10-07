import { useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Loader2, RefreshCw, Server, Wrench } from 'lucide-react'
import { useServerStatus } from '../api/hooks'
import { usePatchNotes, useWikiEvents, type NewsBlock, type WikiEvent } from '../api/wikiNews'
import { formatDateTime, formatTimeAgo } from '../lib/format'

const OFFICIAL = {
  status: 'https://status.escapefromtarkov.com',
  news: 'https://www.escapefromtarkov.com/news',
  support: 'https://www.escapefromtarkov.com/support',
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

const day = (ms: number | null) => (ms ? formatDateTime(ms, { day: 'numeric', month: 'long', year: 'numeric' }) : '')

/** The blocks cut to at most `max` lines in total (headings of empty leftovers dropped). */
function limitBlocks(blocks: NewsBlock[], max = Infinity): NewsBlock[] {
  const out: NewsBlock[] = []
  let left = max
  for (const b of blocks) {
    if (left <= 0) break
    const lines = b.lines.slice(0, left)
    left -= lines.length
    if (lines.length || b.heading) out.push({ heading: b.heading, lines })
  }
  return out
}

function Blocks({ blocks, max }: { blocks: NewsBlock[]; max?: number }) {
  return (
    <div className="space-y-2">
      {limitBlocks(blocks, max).map((b, i) => {
        const lines = b.lines
        if (!lines.length && !b.heading) return null
        return (
          <div key={`${b.heading}-${i}`}>
            {b.heading && <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{b.heading}</h4>}
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
              {lines.map((l, j) => (
                <li key={j} className={l.startsWith('– ') ? 'ml-4 list-[circle] text-ink-muted' : ''}>
                  {l.replace(/^– /, '')}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function ServerStatusCard() {
  const status = useServerStatus()
  const data = status.data
  const problems = (data?.currentStatuses ?? []).filter((s) => s.status !== 0 && s.name !== 'Global')
  const notices = (data?.messages ?? []).filter((m) => m.content || m.statusCode).slice(0, 5)
  const ok = data && data.generalStatus.status === 0 && problems.length === 0
  return (
    <section className="card">
      <h2 className="card-title flex items-center gap-2">
        <Server className="h-4 w-4" /> Game servers
      </h2>
      {status.isPending && <p className="mt-2 text-sm text-ink-muted">Checking…</p>}
      {status.isError && !data && <p className="mt-2 text-sm text-danger">Could not reach the status service right now.</p>}
      {data && (
        <>
          <p className={`mt-2 flex items-center gap-2 text-sm font-semibold ${ok ? 'text-success' : 'text-danger'}`}>
            {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {ok ? 'All services working' : `Problems: ${problems.map((p) => `${p.name} (${p.statusCode})`).join(', ') || data.generalStatus.statusCode}`}
          </p>
          {data.generalStatus.message && <p className="mt-1 text-sm">{data.generalStatus.message}</p>}
          {notices.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {notices.map((m, i) => (
                <li key={m._id ?? i} className="rounded border border-line bg-surface px-2 py-1">
                  <span className="font-semibold">{m.statusCode}</span>
                  {m.content && <> · {m.content}</>}
                  <span className="text-ink-dim">
                    {' '}
                    · {formatDateTime(Date.parse(m.time))}
                    {m.solveTime ? ` – ${formatDateTime(Date.parse(m.solveTime))} (over)` : ' · ongoing'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-ink-dim">
            Battlestate's own status, via tarkov.dev{status.dataUpdatedAt ? `, checked ${formatTimeAgo(status.dataUpdatedAt)}` : ''}. <Ext href={OFFICIAL.status}>Official status page</Ext>
          </p>
        </>
      )}
    </section>
  )
}

function EventCard({ e, open, onToggle }: { e: WikiEvent; open: boolean; onToggle: () => void }) {
  return (
    <article className={`overflow-hidden rounded-lg border ${e.current ? 'border-accent/60 bg-accent/5' : 'border-line bg-surface-2'}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left hover:bg-surface-3/50">
        {e.image ? <img src={e.image.thumb} alt="" loading="lazy" className="h-16 w-28 shrink-0 rounded object-cover" /> : <CalendarClock className="mt-1 h-6 w-6 shrink-0 text-ink-dim" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{e.title}</h3>
            {e.current && <span className="rounded bg-accent px-1.5 text-[11px] font-semibold text-surface">ACTIVE</span>}
          </div>
          <p className="text-xs text-ink-muted">{e.start ? `Started ${day(e.start)}` : 'Start date not listed'}</p>
          {!open && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{e.blocks.flatMap((b) => b.lines).slice(0, 2).join(' · ')}</p>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-dim" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-dim" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <Blocks blocks={e.blocks} />
          <p className="text-[11px] text-ink-dim">
            <Ext href={e.url}>Full entry on the EFT Wiki</Ext>
          </p>
        </div>
      )}
    </article>
  )
}

function EventsSection() {
  const events = useWikiEvents()
  const [open, setOpen] = useState<string | null>(null)
  const list = events.data?.events ?? []
  const current = list.filter((e) => e.current)
  const recent = list.filter((e) => !e.current)
  const isOpen = (e: WikiEvent) => open === e.title || (open === null && e.current && e === current[0])
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClock className="h-5 w-5 text-accent" /> Events
      </h2>
      {events.isPending && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading from the EFT Wiki…
        </p>
      )}
      {events.isError && !events.data && (
        <p className="text-sm text-danger">
          The EFT Wiki could not be reached.{' '}
          <button type="button" onClick={() => void events.refetch()} className="underline">
            Try again
          </button>
        </p>
      )}
      {events.data && !events.data.knowsCurrent && (
        <p className="rounded border border-line bg-surface px-3 py-2 text-xs text-ink-muted">The wiki page does not say right now which events are still running, so the latest ones are listed without an "active" mark.</p>
      )}
      {events.data && events.data.knowsCurrent && current.length === 0 && <p className="text-sm text-ink-muted">No event is running according to the EFT Wiki.</p>}
      {current.map((e) => (
        <EventCard key={e.title} e={e} open={isOpen(e)} onToggle={() => setOpen(isOpen(e) ? '' : e.title)} />
      ))}
      {recent.length > 0 && (
        <>
          <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Recent past events</h3>
          {recent.map((e) => (
            <EventCard key={e.title + e.start} e={e} open={isOpen(e)} onToggle={() => setOpen(isOpen(e) ? '' : e.title)} />
          ))}
        </>
      )}
      {events.data && (
        <p className="text-[11px] text-ink-dim">
          From the <Ext href="https://escapefromtarkov.fandom.com/wiki/Events">EFT Wiki events page</Ext> (CC BY-SA 3.0), checked {formatTimeAgo(events.dataUpdatedAt)}; it updates by itself every few hours. "Active" is what the wiki lists above its past-events line.
        </p>
      )}
    </section>
  )
}

function PatchesSection() {
  const patches = usePatchNotes(3)
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Wrench className="h-5 w-5 text-accent" /> Latest patches and fixed bugs
      </h2>
      {patches.isPending && (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the patch notes…
        </p>
      )}
      {patches.isError && !patches.data && (
        <p className="text-sm text-danger">
          The patch notes could not be loaded.{' '}
          <button type="button" onClick={() => void patches.refetch()} className="underline">
            Try again
          </button>
        </p>
      )}
      {patches.data?.map((p, i) => {
        const fixes = p.blocks.filter((b) => /fix/i.test(b.heading))
        const other = p.blocks.filter((b) => !/fix/i.test(b.heading))
        const fixCount = fixes.reduce((n, b) => n + b.lines.length, 0)
        const key = p.version + p.date
        const showAll = expanded === key
        return (
          <article key={key} className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                Patch {p.version} {i === 0 && <span className="ml-1 rounded bg-surface-3 px-1.5 text-[11px] text-ink-muted">newest</span>}
              </h3>
              <span className="text-xs text-ink-muted">{day(p.date)}</span>
            </div>
            {fixCount > 0 ? (
              <div>
                <p className="text-sm font-semibold text-success">{fixCount} bug fix{fixCount === 1 ? '' : 'es'} in this patch</p>
                <div className="mt-2">
                  <Blocks blocks={fixes} max={showAll ? undefined : 8} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">No "Fixes" list in this patch's notes.</p>
            )}
            {showAll && other.length > 0 && (
              <div className="border-t border-line pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Other changes</p>
                <Blocks blocks={other} />
              </div>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              <button type="button" onClick={() => setExpanded(showAll ? null : key)} className="text-accent hover:underline">
                {showAll ? 'Show less' : 'Show all fixes and changes'}
              </button>
              <Ext href={p.url}>Patch notes on the EFT Wiki</Ext>
            </div>
          </article>
        )
      })}
      {patches.data && (
        <p className="text-[11px] text-ink-dim">
          Battlestate's official patch notes as copied on the <Ext href="https://escapefromtarkov.fandom.com/wiki/Changelog">EFT Wiki changelog</Ext> (CC BY-SA 3.0); updates by itself. Bugs that are not fixed yet are not listed: there is no official list of them. For problems with your game, see <Ext href={OFFICIAL.support}>Battlestate support</Ext>.
        </p>
      )}
    </section>
  )
}

export function EventsPage() {
  const [spin, setSpin] = useState(false)
  const events = useWikiEvents()
  const patches = usePatchNotes(3)
  const status = useServerStatus()
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Events & patches</h1>
          <p className="text-sm text-ink-muted">
            What is going on in Tarkov right now: server status, running events and the latest fixes. Updates by itself. <Ext href={OFFICIAL.news}>Official news</Ext>
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setSpin(true)
            void Promise.all([events.refetch(), patches.refetch(), status.refetch()]).finally(() => setSpin(false))
          }}
        >
          <RefreshCw className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <ServerStatusCard />
      <div className="grid gap-6 lg:grid-cols-2">
        <EventsSection />
        <PatchesSection />
      </div>
    </div>
  )
}
