import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Item } from '../api/types'
import { sellValue } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import { groupDetections, needLookup, sourceLabel, sortSell, stashValues, type Confidence, type SellSort } from '../scan/stashValues'
import { useDetails } from './detailsContext'
import { useStashScan, type StashScan } from './stashScan'

const KEEP_FILL = 'rgba(34,197,94,0.32)'
const SELL_FILL = 'rgba(239,68,68,0.28)'

/** The last snip, what was found in it, and how it splits into keep and sell. */
function useScanAnalysis() {
  const ctx = useDetails()
  const scan = useStashScan((s) => s.scan)
  const needFor = useMemo(() => needLookup(ctx.needs.values(), ctx.collected), [ctx.needs, ctx.collected])
  const found = useMemo(() => (scan?.status === 'done' ? groupDetections(scan.detections) : []), [scan])
  const values = useMemo(() => (ctx.items ? stashValues(found, needFor, ctx.items, sellValue) : null), [found, needFor, ctx.items])
  // How many of each item to keep (the rest is spare).
  const keepById = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of values?.keep ?? []) m.set(k.itemId, (m.get(k.itemId) ?? 0) + k.count)
    return m
  }, [values])
  return { ctx, scan, found, values, keepById }
}

function ScanStatus({ scan }: { scan: StashScan | null }) {
  if (!scan) return <p className="text-xs text-white/60">Click the camera next to the glass, then drag a box around stash or container slots.</p>
  if (scan.status === 'error') return <p className="text-xs text-red-300">The scan failed: {scan.error}</p>
  if (scan.status === 'done') return null
  const text = scan.status === 'matching' ? `Matching items… ${Math.round(scan.progress * 100)}%` : 'Reading item names…'
  return (
    <p className="flex items-center gap-1.5 text-xs text-white/70">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {text}
    </p>
  )
}

const CONF: Record<Confidence, { label: string; cls: string }> = {
  sure: { label: '', cls: '' },
  likely: { label: 'likely', cls: 'border-amber-300/50 text-amber-200' },
  check: { label: 'check', cls: 'border-red-400/60 text-red-300' },
}

function ConfChip({ c }: { c: Confidence }) {
  if (c === 'sure') return null
  return (
    <span className={`rounded border px-1 text-[10px] ${CONF[c].cls}`} title={c === 'check' ? 'Not sure this is the right item: check it in game' : 'Probably right'}>
      {CONF[c].label}
    </span>
  )
}

function Icon({ item }: { item: Item | undefined }) {
  return item?.iconLink ? <img src={item.iconLink} alt="" className="h-7 w-7 shrink-0 rounded-sm bg-white/5 object-contain" loading="lazy" /> : <span className="h-7 w-7 shrink-0 rounded-sm bg-white/5" />
}

/**
 * "Item scan" panel: the snip with a box per item found (green = keep, you still need it;
 * red = spare), and each item with what it is needed for.
 */
export function ScanItemsView() {
  const { ctx, scan, found, values, keepById } = useScanAnalysis()
  const [hover, setHover] = useState<string | null>(null)
  const name = (id: string) => ctx.items?.[id]?.name ?? 'Unknown item'
  const needOf = (id: string) => values?.keep.find((k) => k.itemId === id)?.need
  const rows = useMemo(
    () => [...found].sort((a, b) => Number(keepById.has(b.itemId)) - Number(keepById.has(a.itemId)) || (ctx.items?.[a.itemId]?.name ?? '').localeCompare(ctx.items?.[b.itemId]?.name ?? '')),
    [found, keepById, ctx.items],
  )
  // Keep the first spots of an item up to what you need; the rest are spare.
  const spotKeep = new Map<number, boolean>()
  for (const f of found) f.spots.forEach((s, i) => spotKeep.set(s, i < (keepById.get(f.itemId) ?? 0)))
  const grid = scan?.grid
  const total = found.reduce((s, f) => s + f.count, 0)

  return (
    <div className="space-y-2 text-xs">
      <ScanStatus scan={scan} />
      {scan && (
        <div className="relative overflow-hidden rounded border border-white/10">
          <img src={scan.url} alt="Your snip" className="block w-full" />
          {grid && (
            <svg viewBox={`0 0 ${scan.width} ${scan.height}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {scan.detections.map((d, i) =>
                d.itemId ? (
                  <rect
                    key={i}
                    x={grid.ox + d.col * grid.pitch + 1}
                    y={grid.oy + d.row * grid.pitch + 1}
                    width={d.w * grid.pitch - 2}
                    height={d.h * grid.pitch - 2}
                    fill={spotKeep.get(i) ? KEEP_FILL : SELL_FILL}
                    stroke={hover === d.itemId ? '#fde68a' : 'rgba(255,255,255,0.35)'}
                    strokeWidth={hover === d.itemId ? Math.max(3, grid.pitch / 14) : 1}
                  >
                    <title>{`${name(d.itemId)} · ${spotKeep.get(i) ? 'keep' : 'spare'}`}</title>
                  </rect>
                ) : null,
              )}
            </svg>
          )}
        </div>
      )}
      {scan?.status === 'done' && (
        <>
          <p className="text-white/55">
            {total === 0 ? 'No items found. Try a box that covers whole slots.' : `${total} item${total === 1 ? '' : 's'}, ${found.length} kind${found.length === 1 ? '' : 's'}.`}{' '}
            <span className="text-emerald-300/80">Green</span> = still needed, <span className="text-red-300/80">red</span> = spare.
          </p>
          <ul className="space-y-1">
            {rows.map((f) => {
              const keep = keepById.get(f.itemId) ?? 0
              const need = needOf(f.itemId)
              return (
                <li key={f.itemId}>
                  <button
                    type="button"
                    onClick={() => ctx.open({ kind: 'item', id: f.itemId })}
                    onMouseEnter={() => setHover(f.itemId)}
                    onMouseLeave={() => setHover(null)}
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10"
                  >
                    <Icon item={ctx.items?.[f.itemId]} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate">{name(f.itemId)}</span>
                        <span className="text-white/50">×{f.count}</span>
                        <ConfChip c={f.confidence} />
                      </span>
                      {keep > 0 && need ? (
                        <span className="block truncate text-[11px] text-emerald-300/90" title={need.sources.map(sourceLabel).join('\n')}>
                          Keep {keep < f.count ? `${keep} ` : ''}for {sourceLabel(need.sources[0])}
                          {need.sources.length > 1 ? ` +${need.sources.length - 1} more` : ''}
                        </span>
                      ) : (
                        <span className="block text-[11px] text-white/45">Not needed for quests or the hideout</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

const SORTS: { id: SellSort; label: string }[] = [
  { id: 'total', label: 'Stack' },
  { id: 'each', label: 'Each' },
  { id: 'slot', label: 'Per slot' },
]

/**
 * "Values" panel: everything spare from the snip, priciest first (best of flea after the fee and
 * traders), and at the bottom "Do not sell": what you still need, with what for.
 */
export function ScanValuesView() {
  const { ctx, scan, values } = useScanAnalysis()
  const [sort, setSort] = useState<SellSort>('total')
  const items = ctx.items
  const sell = useMemo(() => (values ? sortSell(values.sell, sort, (id) => items?.[id]?.name ?? id) : []), [values, sort, items])
  if (!scan || scan.status !== 'done') return <ScanStatus scan={scan} />
  if (!values || !items) return <p className="text-xs text-white/60">Loading prices…</p>
  const priced = sell.filter((l) => l.total > 0)
  const unpriced = sell.filter((l) => l.total <= 0)
  const via = (l: (typeof sell)[number]) => (l.via === 'flea' ? 'Flea' : l.via === 'trader' ? ctx.traderName(items[l.itemId]?.sellToTrader[0]?.traderId ?? '') : '')

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-white/70">
          {sell.length === 0 ? 'Nothing spare here.' : <>Spare: about <span className="font-semibold text-white">{formatRoubles(values.total)}</span></>}
        </span>
        {sell.length > 1 && (
          <span className="flex rounded border border-white/15 p-0.5">
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => setSort(s.id)} className={`rounded px-1.5 py-0.5 text-[10px] ${sort === s.id ? 'bg-white/20 text-white' : 'text-white/55 hover:text-white'}`}>
                {s.label}
              </button>
            ))}
          </span>
        )}
      </div>
      {priced.length > 0 && (
        <ul className="space-y-1">
          {priced.map((l) => {
            const item = items[l.itemId]
            return (
              <li key={l.itemId}>
                <button type="button" onClick={() => ctx.open({ kind: 'item', id: l.itemId })} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10">
                  <Icon item={item} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{item?.shortName ?? l.itemId}</span>
                      {l.count > 1 && <span className="text-white/50">×{l.count}</span>}
                      <ConfChip c={l.confidence} />
                    </span>
                    <span className="block text-[11px] text-white/50">
                      {l.count > 1 ? `${formatRoubles(l.each)} each · ` : ''}
                      {formatRoubles(l.perSlot)}/slot{via(l) ? ` · ${via(l)}` : ''}
                      {item?.weapon ? ' · bare gun, parts not counted' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-white">{formatRoubles(sort === 'each' ? l.each : sort === 'slot' ? l.perSlot : l.total)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {unpriced.length > 0 && (
        <p className="text-[11px] text-white/45">No price known: {unpriced.map((l) => `${items[l.itemId]?.shortName ?? l.itemId}${l.count > 1 ? ` ×${l.count}` : ''}`).join(', ')}</p>
      )}
      <div className="rounded border border-amber-300/30 bg-amber-300/5 p-2">
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">Do not sell</h4>
        {values.keep.length === 0 ? (
          <p className="text-white/55">Nothing here is needed for quests or the hideout.</p>
        ) : (
          <ul className="space-y-1">
            {values.keep.map((k) => (
              <li key={k.itemId}>
                <button type="button" onClick={() => ctx.open({ kind: 'item', id: k.itemId })} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white/10" title={k.need.sources.map(sourceLabel).join('\n')}>
                  <Icon item={items[k.itemId]} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate">{items[k.itemId]?.shortName ?? k.itemId}</span>
                      <span className="text-white/50">×{k.count}</span>
                      {k.fir && <span className="rounded border border-sky-300/50 px-1 text-[10px] text-sky-200" title="Needed found in raid: check the tick on the item">FIR</span>}
                      <ConfChip c={k.confidence} />
                    </span>
                    <span className="block truncate text-[11px] text-white/55">
                      for {sourceLabel(k.need.sources[0])}
                      {k.need.sources.length > 1 ? ` +${k.need.sources.length - 1} more` : ''} · {k.need.remaining} still needed
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
