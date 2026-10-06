import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Lock, Search } from 'lucide-react'
import { useBarters, type Barter } from '../api/barters'
import { useGameData, useItems } from '../api/hooks'
import type { Item, ItemsById, Task, Trader } from '../api/types'
import { ErrorPanel, LoadingPanel } from '../components/DataState'
import { SegmentButton } from '../components/SegmentButton'
import { FEE_NOTE } from '../lib/economy'
import { formatNumber, formatRoubles, formatTimeAgo } from '../lib/format'
import {
  barterRows,
  categoryOptions,
  flipRows,
  latestPriceUpdate,
  lootRows,
  sortRows,
  type BarterRow,
  type FlipRow,
  type LootRow,
  type SortDir,
  type UnlockContext,
  type UnlockState,
} from '../lib/moneyMakers'
import { useProgressStore } from '../store/progress'
import { useModeInventory } from '../store/inventory'

const inputClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'
const PAGE = 200

type Tab = 'barters' | 'flips' | 'loot'
interface SortState<K extends string> {
  key: K
  dir: SortDir
}

interface Lookups {
  items: ItemsById
  traders: Record<string, Trader>
  tasks: Record<string, Task>
}

export function MoneyPage() {
  const items = useItems()
  const gameData = useGameData()
  const barters = useBarters()
  const gameMode = useProgressStore((s) => s.gameMode)
  const completedTaskIds = useProgressStore((s) => s.profiles[s.gameMode].completedTaskIds)
  const inventory = useModeInventory()
  const [tab, setTab] = useState<Tab>('barters')

  const ctx = useMemo<UnlockContext>(
    () => ({ traderLevels: inventory.traderLevels, completedTaskIds }),
    [inventory.traderLevels, completedTaskIds],
  )
  const lookups = useMemo<Lookups | null>(() => {
    if (!items.data) return null
    return {
      items: items.data.items,
      traders: Object.fromEntries((gameData.data?.traders ?? []).map((t) => [t.id, t])),
      tasks: gameData.data?.tasksById ?? {},
    }
  }, [items.data, gameData.data])
  const updatedAt = useMemo(() => (items.data ? latestPriceUpdate(Object.values(items.data.items)) : null), [items.data])

  if (items.isPending) return <LoadingPanel label="items and prices" />
  if (items.isError && !items.data) return <ErrorPanel error={items.error} onRetry={() => void items.refetch()} />
  if (!lookups || !items.data) return null

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Money makers</h1>
          <p className="text-sm text-ink-muted">
            Ways to earn roubles in {gameMode === 'pve' ? 'PvE' : 'PvP'}, worked out from tarkov.dev prices. Information only: check prices in game before you buy anything.
          </p>
          <p className="text-[11px] text-ink-dim">{FEE_NOTE}</p>
        </div>
        <span className="text-xs text-ink-dim">
          {updatedAt ? `Prices updated ${formatTimeAgo(updatedAt)}` : 'Price update time unknown'}
          {items.dataUpdatedAt ? ` · downloaded ${formatTimeAgo(items.dataUpdatedAt)}` : ''}
        </span>
      </div>

      <div className="mt-4 inline-flex gap-1 rounded border border-line bg-surface-2 p-1">
        <SegmentButton label="Barter profits" active={tab === 'barters'} onClick={() => setTab('barters')} />
        <SegmentButton label="Trader → flea flips" active={tab === 'flips'} onClick={() => setTab('flips')} />
        <SegmentButton label="Loot value per slot" active={tab === 'loot'} onClick={() => setTab('loot')} />
      </div>

      {tab === 'barters' &&
        (barters.isPending ? (
          <div className="mt-4"><LoadingPanel label="barters" /></div>
        ) : barters.isError && !barters.data ? (
          <div className="mt-4"><ErrorPanel error={barters.error} onRetry={() => void barters.refetch()} /></div>
        ) : (
          <BartersSection rows={barters.data ?? []} lookups={lookups} ctx={ctx} />
        ))}
      {tab === 'flips' && <FlipsSection lookups={lookups} ctx={ctx} />}
      {tab === 'loot' && <LootSection lookups={lookups} categoryNames={items.data.categoryNames} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function useSort<K extends string>(initial: K, textKeys: K[] = []) {
  const [sort, setSort] = useState<SortState<K>>({ key: initial, dir: textKeys.includes(initial) ? 'asc' : 'desc' })
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: textKeys.includes(key) ? 'asc' : 'desc' }))
  return { sort, toggle }
}

function SortTh<K extends string>({
  label,
  k,
  sort,
  onSort,
  right,
  className = '',
}: {
  label: string
  k: K
  sort: SortState<K>
  onSort: (k: K) => void
  right?: boolean
  className?: string
}) {
  const active = sort.key === k
  return (
    <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${active ? 'text-ink' : ''}`}>
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${inputClass} w-60 pl-8`} />
    </label>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {children}
    </label>
  )
}

function TraderSelect({ value, onChange, traderIds, traders }: { value: string; onChange: (v: string) => void; traderIds: string[]; traders: Record<string, Trader> }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Trader" className={inputClass}>
      <option value="all">All traders</option>
      {traderIds.map((id) => (
        <option key={id} value={id}>{traders[id]?.name ?? 'Unknown trader'}</option>
      ))}
    </select>
  )
}

function ItemCell({ item, count }: { item: Item; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      {item.iconLink ? <img src={item.iconLink} alt="" className="h-8 w-8 shrink-0 object-contain" loading="lazy" /> : <span className="h-8 w-8 shrink-0" />}
      <span className="font-medium">{item.name}{count && count > 1 ? ` ×${count}` : ''}</span>
    </div>
  )
}

function Explainer({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs text-ink-muted">{children}</p>
}

function TableShell({ minWidth, head, children, shown, total, onMore, empty }: { minWidth: string; head: ReactNode; children: ReactNode; shown: number; total: number; onMore: () => void; empty: string }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line bg-surface-2">
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidth} text-sm`}>
          <thead className="bg-surface-3 text-xs text-ink-muted">{head}</thead>
          <tbody className="divide-y divide-line">{children}</tbody>
        </table>
      </div>
      {total === 0 && <p className="px-4 py-10 text-center text-sm text-ink-muted">{empty}</p>}
      {shown < total && (
        <div className="border-t border-line px-4 py-2 text-center">
          <button type="button" onClick={onMore} className="text-sm text-accent hover:underline">
            Show more ({formatNumber(total - shown)} left)
          </button>
        </div>
      )}
    </div>
  )
}

const profitClass = (n: number) => (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : '')
const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`

function lockReason(u: UnlockState, minLevel: number, taskId: string | null, tasks: Record<string, Task>): string | null {
  const parts: string[] = []
  if (!u.levelOk) parts.push(`needs loyalty level ${minLevel}`)
  if (!u.taskOk && taskId) parts.push(`needs quest "${tasks[taskId]?.name ?? 'unknown quest'}"`)
  return parts.length ? parts.join(', ') : null
}

function TraderCell({ traderId, minLevel, taskId, u, lookups }: { traderId: string; minLevel: number; taskId: string | null; u: UnlockState; lookups: Lookups }) {
  const reason = lockReason(u, minLevel, taskId, lookups.tasks)
  return (
    <div className="text-xs">
      <span className="font-medium">{lookups.traders[traderId]?.name ?? 'Trader'}</span> <span className="text-ink-muted">LL{minLevel}</span>
      {taskId && u.taskOk && <span className="block text-ink-dim">quest unlock done</span>}
      {reason && (
        <span className="mt-0.5 flex items-center gap-1 text-accent">
          <Lock className="h-3 w-3 shrink-0" /> {reason}
        </span>
      )}
    </div>
  )
}

const traderIdsOf = (ids: Iterable<string>, traders: Record<string, Trader>) =>
  [...new Set(ids)].sort((a, b) => (traders[a]?.name ?? a).localeCompare(traders[b]?.name ?? b))

const matches = (needle: string, ...parts: (string | undefined)[]) => !needle || parts.some((p) => p?.toLowerCase().includes(needle))

// ---------------------------------------------------------------------------
// Barters
// ---------------------------------------------------------------------------

type BarterKey = 'name' | 'trader' | 'cost' | 'value' | 'profit' | 'profitPct'

function BartersSection({ rows: barters, lookups, ctx }: { rows: Barter[]; lookups: Lookups; ctx: UnlockContext }) {
  const [search, setSearch] = useState('')
  const [trader, setTrader] = useState('all')
  const [onlyNow, setOnlyNow] = useState(false)
  const [traderOnly, setTraderOnly] = useState(false)
  const [showLosses, setShowLosses] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const { sort, toggle } = useSort<BarterKey>('profit', ['name', 'trader'])

  const all = useMemo(() => barterRows(barters, lookups.items, ctx, traderOnly), [barters, lookups.items, ctx, traderOnly])
  const traderIds = useMemo(() => traderIdsOf(all.map((r) => r.barter.traderId), lookups.traders), [all, lookups.traders])
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = all.filter((r) => {
      if (!showLosses && r.profit <= 0) return false
      if (trader !== 'all' && r.barter.traderId !== trader) return false
      if (onlyNow && !r.unlocked) return false
      return matches(needle, r.outputItem.name, r.outputItem.shortName, ...r.barter.inputs.map((i) => lookups.items[i.itemId]?.name))
    })
    const key = (r: BarterRow): number | string => {
      switch (sort.key) {
        case 'name': return r.outputItem.name
        case 'trader': return `${lookups.traders[r.barter.traderId]?.name ?? ''} ${r.barter.minTraderLevel}`
        case 'cost': return r.cost
        case 'value': return r.value
        case 'profitPct': return r.profitPct
        default: return r.profit
      }
    }
    return sortRows(rows, key, sort.dir)
  }, [all, search, trader, onlyNow, showLosses, sort, lookups])

  return (
    <section>
      <Explainer>
        Cost = each required item at its cheapest price (flea 24 h average or a trader). Value = the reward at its best sale (flea minus the listing fee, or the best trader). Profit % = profit ÷ cost. Barters with an item that has no known price (for example dogtags) are left out. Locked rows use your trader loyalty levels (set in the Flea Market tab's traders panel) and your completed quests.
      </Explainer>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search reward or ingredients…" />
        <TraderSelect value={trader} onChange={setTrader} traderIds={traderIds} traders={lookups.traders} />
        <Check checked={onlyNow} onChange={setOnlyNow}>Only what I can do now</Check>
        <Check checked={traderOnly} onChange={setTraderOnly}>Value rewards at trader prices only</Check>
        <Check checked={showLosses} onChange={setShowLosses}>Show losing barters</Check>
        <span className="ml-auto text-xs text-ink-dim">{filtered.length} of {all.length} priced barters</span>
      </div>
      <p className="mt-1 text-[11px] text-ink-dim">
        Barter rewards are not "found in raid"; if the flea refuses them, tick "trader prices only" to see what a trader would pay.
      </p>
      <TableShell
        minWidth="min-w-[960px]"
        shown={Math.min(limit, filtered.length)}
        total={filtered.length}
        onMore={() => setLimit((l) => l + PAGE)}
        empty="No barters match these filters."
        head={
          <tr>
            <SortTh label="Reward" k="name" sort={sort} onSort={toggle} />
            <th className="px-3 py-2 text-left font-medium uppercase tracking-wide">You give</th>
            <SortTh label="Trader" k="trader" sort={sort} onSort={toggle} className="w-48" />
            <SortTh label="Cost" k="cost" sort={sort} onSort={toggle} right className="w-24" />
            <SortTh label="Value" k="value" sort={sort} onSort={toggle} right className="w-28" />
            <SortTh label="Profit" k="profit" sort={sort} onSort={toggle} right className="w-24" />
            <SortTh label="%" k="profitPct" sort={sort} onSort={toggle} right className="w-16" />
          </tr>
        }
      >
        {filtered.slice(0, limit).map((r) => (
          <tr key={r.barter.id} className={`hover:bg-surface-3 ${r.unlocked ? '' : 'opacity-50'}`}>
            <td className="px-3 py-1.5"><ItemCell item={r.outputItem} count={r.barter.output.count} /></td>
            <td className="px-3 py-1.5">
              <div className="flex flex-wrap gap-1">
                {r.barter.inputs.map((inp, i) => {
                  const it = lookups.items[inp.itemId]
                  return (
                    <span key={i} title={it?.name ?? inp.itemId} className="inline-flex items-center gap-1 rounded bg-surface px-1 py-0.5 text-[11px]">
                      {it?.iconLink && <img src={it.iconLink} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
                      <span className="max-w-[120px] truncate">{it?.shortName ?? '…'}</span>
                      <span className="text-ink-dim">×{inp.count}</span>
                    </span>
                  )
                })}
              </div>
            </td>
            <td className="px-3 py-1.5">
              <TraderCell traderId={r.barter.traderId} minLevel={r.barter.minTraderLevel} taskId={r.barter.taskUnlock} u={r} lookups={lookups} />
              {r.barter.buyLimit > 0 && <span className="text-[11px] text-ink-dim">limit {r.barter.buyLimit} per restock</span>}
            </td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatRoubles(r.cost)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums" title={r.valueVia === 'flea' ? 'Flea, after fee' : 'Trader'}>
              {formatRoubles(r.value)}
              <span className="block text-[10px] text-ink-dim">{r.valueVia === 'flea' ? 'flea' : (lookups.traders[r.valueTraderId ?? '']?.name ?? 'trader')}</span>
            </td>
            <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${profitClass(r.profit)}`}>{formatRoubles(r.profit)}</td>
            <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${profitClass(r.profit)}`}>{pct(r.profitPct)}</td>
          </tr>
        ))}
      </TableShell>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Trader -> flea flips
// ---------------------------------------------------------------------------

type FlipKey = 'name' | 'trader' | 'buy' | 'net' | 'profit' | 'profitPct' | 'restock'

function FlipsSection({ lookups, ctx }: { lookups: Lookups; ctx: UnlockContext }) {
  const [search, setSearch] = useState('')
  const [trader, setTrader] = useState('all')
  const [onlyNow, setOnlyNow] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const { sort, toggle } = useSort<FlipKey>('profit', ['name', 'trader'])

  const all = useMemo(() => flipRows(lookups.items, ctx), [lookups.items, ctx])
  const traderIds = useMemo(() => traderIdsOf(all.map((r) => r.traderId), lookups.traders), [all, lookups.traders])
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = all.filter((r) => {
      if (trader !== 'all' && r.traderId !== trader) return false
      if (onlyNow && !r.unlocked) return false
      return matches(needle, r.item.name, r.item.shortName)
    })
    const key = (r: FlipRow): number | string | null => {
      switch (sort.key) {
        case 'name': return r.item.name
        case 'trader': return `${lookups.traders[r.traderId]?.name ?? ''} ${r.minTraderLevel}`
        case 'buy': return r.buyPrice
        case 'net': return r.fleaNet
        case 'profitPct': return r.profitPct
        case 'restock': return r.profitPerRestock
        default: return r.profit
      }
    }
    return sortRows(rows, key, sort.dir)
  }, [all, search, trader, onlyNow, sort, lookups.traders])

  return (
    <section>
      <Explainer>
        Items a trader sells for cash that go for more on the flea. Flea price = the lower of the 24 h average and the cheapest current offer (you have to undercut it), minus the listing fee. Profit = that minus the trader price; "per restock" = profit × how many the trader lets you buy per restock. Items the flea bans are left out.
      </Explainer>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search items…" />
        <TraderSelect value={trader} onChange={setTrader} traderIds={traderIds} traders={lookups.traders} />
        <Check checked={onlyNow} onChange={setOnlyNow}>Only what I can do now</Check>
        <span className="ml-auto text-xs text-ink-dim">{filtered.length} of {all.length} flips</span>
      </div>
      <p className="mt-1 text-[11px] text-accent">
        Careful: items bought from traders are not "found in raid", and the game may not let you list them on the flea at all. The flea also unlocks at player level 15 and limits how many offers you can have. Check one in game before buying many.
      </p>
      <TableShell
        minWidth="min-w-[960px]"
        shown={Math.min(limit, filtered.length)}
        total={filtered.length}
        onMore={() => setLimit((l) => l + PAGE)}
        empty="No profitable flips right now."
        head={
          <tr>
            <SortTh label="Item" k="name" sort={sort} onSort={toggle} />
            <SortTh label="Trader" k="trader" sort={sort} onSort={toggle} className="w-48" />
            <SortTh label="Trader price" k="buy" sort={sort} onSort={toggle} right className="w-28" />
            <SortTh label="Flea after fee" k="net" sort={sort} onSort={toggle} right className="w-32" />
            <SortTh label="Profit" k="profit" sort={sort} onSort={toggle} right className="w-24" />
            <SortTh label="%" k="profitPct" sort={sort} onSort={toggle} right className="w-16" />
            <SortTh label="Per restock" k="restock" sort={sort} onSort={toggle} right className="w-32" />
          </tr>
        }
      >
        {filtered.slice(0, limit).map((r) => (
          <tr key={`${r.item.id}-${r.traderId}-${r.minTraderLevel}-${r.buyPrice}`} className={`hover:bg-surface-3 ${r.unlocked ? '' : 'opacity-50'}`}>
            <td className="px-3 py-1.5"><ItemCell item={r.item} /></td>
            <td className="px-3 py-1.5"><TraderCell traderId={r.traderId} minLevel={r.minTraderLevel} taskId={r.taskUnlock} u={r} lookups={lookups} /></td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatRoubles(r.buyPrice)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums" title={`Listed at ${formatRoubles(r.fleaPrice)}, fee ${formatRoubles(r.fee)}`}>
              {formatRoubles(r.fleaNet)}
              <span className="block text-[10px] text-ink-dim">{formatRoubles(r.fleaPrice)} − {formatRoubles(r.fee)} fee</span>
            </td>
            <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${profitClass(r.profit)}`}>{formatRoubles(r.profit)}</td>
            <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${profitClass(r.profit)}`}>{pct(r.profitPct)}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">
              {r.profitPerRestock != null ? (
                <>
                  {formatRoubles(r.profitPerRestock)}
                  <span className="block text-[10px] text-ink-dim">limit {formatNumber(r.buyLimit ?? 0)}</span>
                </>
              ) : (
                <span className="text-ink-dim">no limit known</span>
              )}
            </td>
          </tr>
        ))}
      </TableShell>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Loot value per slot
// ---------------------------------------------------------------------------

type LootKey = 'name' | 'slots' | 'value' | 'perSlot'

function LootSection({ lookups, categoryNames }: { lookups: Lookups; categoryNames: Record<string, string> }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [traderOnly, setTraderOnly] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const { sort, toggle } = useSort<LootKey>('perSlot', ['name'])

  const all = useMemo(() => lootRows(lookups.items, traderOnly), [lookups.items, traderOnly])
  const categories = useMemo(() => categoryOptions(all.map((r) => r.item), categoryNames), [all, categoryNames])
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const rows = all.filter((r) => {
      if (category !== 'all' && !r.item.categories.includes(category)) return false
      return matches(needle, r.item.name, r.item.shortName)
    })
    const key = (r: LootRow): number | string => {
      switch (sort.key) {
        case 'name': return r.item.name
        case 'slots': return r.slots
        case 'value': return r.value
        default: return r.perSlot
      }
    }
    return sortRows(rows, key, sort.dir)
  }, [all, search, category, sort])

  return (
    <section>
      <Explainer>
        ₽/slot = the item's best sale (flea minus the listing fee, or the best trader) ÷ the number of inventory cells it takes (width × height). Higher means more money for the space in your backpack. Assembled weapon presets are left out; flea-banned items use trader prices.
      </Explainer>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Search items…" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={`${inputClass} max-w-[220px]`}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
          ))}
        </select>
        <Check checked={traderOnly} onChange={setTraderOnly}>Trader prices only</Check>
        <span className="ml-auto text-xs text-ink-dim">{formatNumber(filtered.length)} of {formatNumber(all.length)} items</span>
      </div>
      <TableShell
        minWidth="min-w-[720px]"
        shown={Math.min(limit, filtered.length)}
        total={filtered.length}
        onMore={() => setLimit((l) => l + PAGE)}
        empty="No items match these filters."
        head={
          <tr>
            <SortTh label="Item" k="name" sort={sort} onSort={toggle} />
            <SortTh label="Size" k="slots" sort={sort} onSort={toggle} right className="w-20" />
            <SortTh label="Value" k="value" sort={sort} onSort={toggle} right className="w-28" />
            <th className="w-32 px-3 py-2 text-left font-medium uppercase tracking-wide">Sell at</th>
            <SortTh label="₽ / slot" k="perSlot" sort={sort} onSort={toggle} right className="w-28" />
          </tr>
        }
      >
        {filtered.slice(0, limit).map((r) => (
          <tr key={r.item.id} className="hover:bg-surface-3">
            <td className="px-3 py-1.5"><ItemCell item={r.item} /></td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.item.width}×{r.item.height}</td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatRoubles(r.value)}</td>
            <td className="px-3 py-1.5 text-xs">{r.via === 'flea' ? 'Flea market' : (lookups.traders[r.traderId ?? '']?.name ?? 'Trader')}</td>
            <td className="px-3 py-1.5 text-right text-xs font-medium tabular-nums">{formatRoubles(r.perSlot)}</td>
          </tr>
        ))}
      </TableShell>
    </section>
  )
}
