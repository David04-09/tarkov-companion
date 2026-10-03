import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { useGameData, useItems, usePriceHistory } from '../api/hooks'
import type { Item } from '../api/types'
import { ErrorPanel, LoadingPanel } from '../components/DataState'
import { useNeeds } from '../hooks/useNeeds'
import { fleaFee } from '../lib/economy'
import { formatRoubles, formatTimeAgo } from '../lib/format'

const TEN_MINUTES = 10 * 60 * 1000
const ROW_HEIGHT = 44
const OVERSCAN = 8

const selectClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'

const TYPE_LABEL: Record<string, string> = {
  gun: 'Weapons', mods: 'Weapon mods', ammo: 'Ammo', ammoBox: 'Ammo boxes', armor: 'Armor', armorPlate: 'Armor plates', rig: 'Rigs',
  backpack: 'Backpacks', helmet: 'Helmets', headphones: 'Headsets', glasses: 'Glasses', meds: 'Meds', injectors: 'Injectors',
  provisions: 'Food & drink', barter: 'Barter items', keys: 'Keys', container: 'Containers', grenade: 'Grenades', wearable: 'Wearables',
}
const HIDDEN_TYPES = new Set(['noFlea', 'preset', 'markedOnly', 'specialSlot', 'pistolGrip', 'suppressor', 'poster'])

interface Row {
  item: Item
  flea: number | null
  perSlot: number | null
  traderSell: number
  traderSellId: string | null
  traderBuy: number | null
  traderBuyId: string | null
  /** Profit from buying at a trader and selling on the flea, after fee. */
  flip: number | null
  change: number | null
}

type SortKey = 'name' | 'flea' | 'low' | 'high' | 'change' | 'perSlot' | 'traderSell' | 'flip'
const NUMERIC: Record<SortKey, (r: Row) => number | null> = {
  name: () => null,
  flea: (r) => r.flea,
  low: (r) => r.item.low24hPrice,
  high: (r) => r.item.high24hPrice,
  change: (r) => r.change,
  perSlot: (r) => r.perSlot,
  traderSell: (r) => r.traderSell,
  flip: (r) => r.flip,
}

function buildRow(item: Item): Row {
  const flea = item.types.includes('noFlea') ? null : item.avg24hPrice
  const traderSell = item.sellToTrader[0]?.priceRUB ?? 0
  const best = Math.max(flea ?? 0, traderSell)
  const slots = item.width * item.height || 1
  const traderBuy = item.buyFromTrader[0]?.priceRUB ?? null
  const flip =
    flea != null && traderBuy != null ? Math.round(flea - fleaFee(item.basePrice, flea) - traderBuy) : null
  return {
    item,
    flea,
    perSlot: best > 0 ? Math.round(best / slots) : null,
    traderSell,
    traderSellId: item.sellToTrader[0]?.traderId ?? null,
    traderBuy,
    traderBuyId: item.buyFromTrader[0]?.traderId ?? null,
    flip,
    change: item.changeLast48hPercent,
  }
}

function Head({
  label,
  k,
  sort,
  onSort,
  className = '',
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-ink ${active ? 'text-accent' : ''} ${className}`}>
      {label} <Icon className="h-3 w-3" />
    </button>
  )
}

function Sparkline({ points }: { points: { t: number; p: number }[] }) {
  if (points.length < 2) return null
  const w = 220
  const h = 44
  const min = Math.min(...points.map((p) => p.p))
  const max = Math.max(...points.map((p) => p.p))
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const d = points
    .map((p, i) => {
      const x = t1 === t0 ? 0 : ((p.t - t0) / (t1 - t0)) * w
      const y = max === min ? h / 2 : h - ((p.p - min) / (max - min)) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={1.5} />
    </svg>
  )
}

function HistoryPanel({ item }: { item: Item }) {
  const history = usePriceHistory(item.id)
  const stats = useMemo(() => {
    const pts = (history.data ?? []).map((p) => ({ t: p.timestamp, p: p.price })).sort((a, b) => a.t - b.t)
    if (pts.length === 0) return null
    const now = pts[pts.length - 1]
    const at = (ms: number) => {
      const target = now.t - ms
      let best = pts[0]
      for (const p of pts) if (p.t <= target) best = p
      return best
    }
    const d1 = at(24 * 3600 * 1000)
    const d7 = at(7 * 24 * 3600 * 1000)
    const pct = (from: number, to: number) => (from > 0 ? ((to - from) / from) * 100 : null)
    return { last7: pts.filter((p) => p.t >= now.t - 7 * 24 * 3600 * 1000), c24: pct(d1.p, now.p), c7: pct(d7.p, now.p), latest: now }
  }, [history.data])

  return (
    <div className="flex flex-wrap items-center gap-6 border-t border-line bg-surface px-4 py-2 text-xs">
      {history.isPending && <span className="text-ink-dim">Loading price history…</span>}
      {history.isError && <span className="text-danger">Price history unavailable.</span>}
      {stats && (
        <>
          <Sparkline points={stats.last7} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-ink-muted">24h change</dt>
            <dd className={stats.c24 != null && stats.c24 > 0 ? 'text-success' : stats.c24 != null && stats.c24 < 0 ? 'text-danger' : ''}>{stats.c24 != null ? `${stats.c24 > 0 ? '+' : ''}${stats.c24.toFixed(1)}%` : '—'}</dd>
            <dt className="text-ink-muted">7d change</dt>
            <dd className={stats.c7 != null && stats.c7 > 0 ? 'text-success' : stats.c7 != null && stats.c7 < 0 ? 'text-danger' : ''}>{stats.c7 != null ? `${stats.c7 > 0 ? '+' : ''}${stats.c7.toFixed(1)}%` : '—'}</dd>
            <dt className="text-ink-muted">Last point</dt>
            <dd>{formatRoubles(stats.latest.p)} · {formatTimeAgo(stats.latest.t)}</dd>
          </dl>
        </>
      )}
      {item.wikiLink && <a href={item.wikiLink} target="_blank" rel="noreferrer" className="ml-auto text-accent underline">Wiki</a>}
    </div>
  )
}

export function FleaMarketPage() {
  const items = useItems(true, TEN_MINUTES)
  const gameData = useGameData()
  const { needs } = useNeeds()

  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minPerSlot, setMinPerSlot] = useState('')
  const [neededOnly, setNeededOnly] = useState(false)
  const [risingOnly, setRisingOnly] = useState(false)
  const [flipOnly, setFlipOnly] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'flea', dir: 'desc' })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(() => (items.data ? Object.values(items.data.items).map(buildRow) : []), [items.data])
  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) for (const t of r.item.types) if (!HIDDEN_TYPES.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const min = Number(minPrice) || 0
    const max = Number(maxPrice) || Infinity
    const minSlot = Number(minPerSlot) || 0
    const list = rows.filter((r) => {
      if (type !== 'all' && !r.item.types.includes(type)) return false
      if (needle && !`${r.item.name} ${r.item.shortName}`.toLowerCase().includes(needle)) return false
      const price = r.flea ?? r.traderSell
      if (price < min || price > max) return false
      if (minSlot > 0 && (r.perSlot ?? 0) < minSlot) return false
      if (neededOnly && !needs.has(r.item.id)) return false
      if (risingOnly && !(r.change != null && r.change >= 10)) return false
      if (flipOnly && !(r.flip != null && r.flip > 0)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    const get = NUMERIC[sort.key]
    list.sort((a, b) => {
      if (sort.key === 'name') return a.item.name.localeCompare(b.item.name) * dir
      const va = get(a)
      const vb = get(b)
      if (va == null && vb == null) return a.item.name.localeCompare(b.item.name)
      if (va == null) return 1
      if (vb == null) return -1
      return (va - vb) * dir || a.item.name.localeCompare(b.item.name)
    })
    return list
  }, [rows, search, type, minPrice, maxPrice, minPerSlot, neededOnly, risingOnly, flipOnly, sort, needs])

  // --- virtualised list -----------------------------------------------------
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(600)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setViewport(el.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const total = filtered.length
  const expandedIndex = expandedId ? filtered.findIndex((r) => r.item.id === expandedId) : -1
  const extra = expandedIndex >= 0 ? 72 : 0
  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN)
  const visible = filtered.slice(first, last)

  const traderName = (id: string | null) => (id ? (gameData.data?.traders.find((t) => t.id === id)?.name ?? 'Trader') : '—')
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }))

  if (items.isPending) return <LoadingPanel label="flea market prices" />
  if (items.isError && !items.data) return <ErrorPanel error={items.error} onRetry={() => void items.refetch()} />

  const grid = 'grid grid-cols-[minmax(220px,2fr)_110px_100px_100px_80px_100px_150px_110px] items-center gap-2 px-3'

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4 md:px-8 md:py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Flea Market</h1>
          <p className="text-sm text-ink-muted">
            {rows.length.toLocaleString()} items · prices refresh every 10 minutes while this tab is open
            {items.dataUpdatedAt ? ` · updated ${formatTimeAgo(items.dataUpdatedAt)}` : ''}
            {items.isFetching ? ' · refreshing…' : ''}
          </p>
        </div>
        <span className="text-xs text-ink-dim">{total.toLocaleString()} shown</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" aria-label="Search items" className={`${selectClass} w-56 pl-8`} />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Category" className={selectClass}>
          <option value="all">All categories</option>
          {types.map(([t, n]) => (
            <option key={t} value={t}>{TYPE_LABEL[t] ?? t} ({n})</option>
          ))}
        </select>
        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Min ₽" aria-label="Minimum price" className={`${selectClass} w-24`} />
        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max ₽" aria-label="Maximum price" className={`${selectClass} w-24`} />
        <input type="number" value={minPerSlot} onChange={(e) => setMinPerSlot(e.target.value)} placeholder="Min ₽/slot" aria-label="Minimum price per slot" className={`${selectClass} w-28`} />
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={neededOnly} onChange={(e) => setNeededOnly(e.target.checked)} /> Needed by me</label>
        <label className="flex items-center gap-1.5 text-sm" title="48h change of +10% or more"><input type="checkbox" checked={risingOnly} onChange={(e) => setRisingOnly(e.target.checked)} /> Rising fast</label>
        <label className="flex items-center gap-1.5 text-sm" title="Cheaper at a trader than it sells for on the flea after the fee"><input type="checkbox" checked={flipOnly} onChange={(e) => setFlipOnly(e.target.checked)} /> Trader flip</label>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface-2">
        <div className={`${grid} h-9 border-b border-line bg-surface-3 text-xs uppercase tracking-wide text-ink-muted`}>
          <Head sort={sort} onSort={onSort} label="Item" k="name" />
          <Head sort={sort} onSort={onSort} label="Flea avg" k="flea" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="Low 24h" k="low" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="High 24h" k="high" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="48h" k="change" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="₽ / slot" k="perSlot" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="Trader sell" k="traderSell" className="justify-end" />
          <Head sort={sort} onSort={onSort} label="Flip" k="flip" className="justify-end" />
        </div>
        <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto">
          <div style={{ height: total * ROW_HEIGHT + extra, position: 'relative' }}>
            {visible.map((r, i) => {
              const index = first + i
              const top = index * ROW_HEIGHT + (expandedIndex >= 0 && index > expandedIndex ? extra : 0)
              const open = r.item.id === expandedId
              return (
                <div key={r.item.id} style={{ position: 'absolute', top, left: 0, right: 0 }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedId(open ? null : r.item.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setExpandedId(open ? null : r.item.id)}
                    className={`${grid} h-11 cursor-pointer border-b border-line text-sm hover:bg-surface-3 ${open ? 'bg-surface-3' : ''}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {r.item.iconLink && <img src={r.item.iconLink} alt="" className="h-8 w-8 shrink-0 object-contain" loading="lazy" />}
                      <span className="min-w-0 truncate">{r.item.name}</span>
                      {needs.has(r.item.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Needed for your quests/hideout" />}
                    </div>
                    <div className="text-right tabular-nums">{r.flea != null ? formatRoubles(r.flea) : <span className="text-ink-dim">no flea</span>}</div>
                    <div className="text-right text-xs tabular-nums text-ink-muted">{formatRoubles(r.item.low24hPrice)}</div>
                    <div className="text-right text-xs tabular-nums text-ink-muted">{formatRoubles(r.item.high24hPrice)}</div>
                    <div className={`text-right text-xs tabular-nums ${r.change != null && r.change > 0 ? 'text-success' : r.change != null && r.change < 0 ? 'text-danger' : 'text-ink-dim'}`}>{r.change != null ? `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}%` : '—'}</div>
                    <div className="text-right text-xs tabular-nums">{r.perSlot != null ? formatRoubles(r.perSlot) : '—'}</div>
                    <div className="truncate text-right text-xs tabular-nums">{r.traderSell ? `${traderName(r.traderSellId)} ${formatRoubles(r.traderSell)}` : '—'}</div>
                    <div className={`text-right text-xs tabular-nums ${r.flip != null && r.flip > 0 ? 'text-success' : 'text-ink-dim'}`} title={r.traderBuy != null ? `Buy at ${traderName(r.traderBuyId)} for ${formatRoubles(r.traderBuy)}` : ''}>{r.flip != null ? formatRoubles(r.flip) : '—'}</div>
                  </div>
                  {open && <HistoryPanel item={r.item} />}
                </div>
              )
            })}
          </div>
        </div>
        {total === 0 && <p className="px-4 py-10 text-center text-sm text-ink-muted">No items match these filters.</p>}
      </div>
    </div>
  )
}
