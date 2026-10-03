import { useMemo, useState } from 'react'
import { Search, Star } from 'lucide-react'
import { useCrafts, useHideout, useItems } from '../api/hooks'
import { ErrorPanel, LoadingPanel } from '../components/DataState'
import { craftEconomics, formatDuration, type CraftEconomics } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import { useInventoryStore, useModeInventory } from '../store/inventory'

const selectClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'

type SortKey = 'profitPerHour' | 'profit' | 'duration' | 'name'

export function CraftsPage() {
  const crafts = useCrafts()
  const hideout = useHideout()
  const items = useItems()
  const inventory = useModeInventory()
  const favorites = useInventoryStore((s) => s.favoriteCraftIds)
  const toggleFavorite = useInventoryStore((s) => s.toggleFavoriteCraft)

  const [search, setSearch] = useState('')
  const [station, setStation] = useState('all')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('profitPerHour')

  const stationsById = useMemo(() => Object.fromEntries((hideout.data ?? []).map((s) => [s.id, s])), [hideout.data])
  const rows = useMemo<CraftEconomics[]>(() => {
    if (!crafts.data || !items.data) return []
    return crafts.data.map((c) => craftEconomics(c, items.data!.items, stationsById))
  }, [crafts.data, items.data, stationsById])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const fav = new Set(favorites)
    return rows
      .filter((r) => {
        if (station !== 'all' && r.craft.stationId !== station) return false
        if (availableOnly && (inventory.stationLevels[r.craft.stationId] ?? 0) < r.craft.level) return false
        if (favoritesOnly && !fav.has(r.craft.id)) return false
        if (needle) {
          const hay = `${r.outputItem?.name ?? ''} ${r.craft.inputs.map((i) => items.data?.items[i.itemId]?.name ?? '').join(' ')}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sort === 'name') return (a.outputItem?.name ?? '').localeCompare(b.outputItem?.name ?? '')
        if (sort === 'duration') return a.craft.duration - b.craft.duration
        if (sort === 'profit') return (b.profit ?? -Infinity) - (a.profit ?? -Infinity)
        return (b.profitPerHour ?? -Infinity) - (a.profitPerHour ?? -Infinity)
      })
  }, [rows, search, station, availableOnly, favoritesOnly, sort, favorites, inventory.stationLevels, items.data])

  if (crafts.isPending || items.isPending) return <LoadingPanel label="crafts" />
  if (crafts.isError && !crafts.data) return <ErrorPanel error={crafts.error} onRetry={() => void crafts.refetch()} />
  if (items.isError && !items.data) return <ErrorPanel error={items.error} onRetry={() => void items.refetch()} />

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Crafts</h1>
          <p className="text-sm text-ink-muted">
            Profit = best sale of the output (flea minus the listing fee, or trader) minus the cheapest way to buy the inputs. Tools are not counted. Star a craft to add its inputs to Item Collection.
          </p>
        </div>
        <span className="text-xs text-ink-dim">{filtered.length} of {rows.length} crafts</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search outputs or inputs…" aria-label="Search crafts" className={`${selectClass} w-60 pl-8`} />
        </label>
        <select value={station} onChange={(e) => setStation(e.target.value)} aria-label="Station" className={selectClass}>
          <option value="all">All stations</option>
          {(hideout.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort" className={selectClass}>
          <option value="profitPerHour">Profit per hour</option>
          <option value="profit">Profit</option>
          <option value="duration">Shortest first</option>
          <option value="name">Name</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} /> Available at my hideout</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} /> Favourites ({favorites.length})</label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-surface-3 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 text-left font-medium">Output</th>
                <th className="w-36 px-3 py-2 text-left font-medium">Station</th>
                <th className="px-3 py-2 text-left font-medium">Inputs</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Time</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Cost</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Sells for</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Profit</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Per hour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((r) => {
                const fav = favorites.includes(r.craft.id)
                const available = (inventory.stationLevels[r.craft.stationId] ?? 0) >= r.craft.level
                return (
                  <tr key={r.craft.id} className="hover:bg-surface-3">
                    <td className="px-2 py-1.5">
                      <button type="button" onClick={() => toggleFavorite(r.craft.id)} aria-pressed={fav} aria-label="Favourite" className={`rounded p-1 ${fav ? 'text-accent' : 'text-ink-dim hover:text-ink'}`}>
                        <Star className="h-4 w-4" fill={fav ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {r.outputItem?.iconLink && <img src={r.outputItem.iconLink} alt="" className="h-8 w-8 object-contain" loading="lazy" />}
                        <span className="font-medium">{r.outputItem?.name ?? r.craft.output.itemId}{r.craft.output.count > 1 ? ` ×${r.craft.output.count}` : ''}</span>
                      </div>
                    </td>
                    <td className={`px-3 py-1.5 text-xs ${available ? 'text-ink' : 'text-ink-muted'}`}>{r.station?.name ?? 'Station'} L{r.craft.level}{available ? '' : ' (not built)'}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {r.craft.inputs.map((inp, i) => {
                          const it = items.data?.items[inp.itemId]
                          return (
                            <span key={i} title={`${it?.name ?? inp.itemId}${inp.tool ? ' (tool, returned)' : ''}`} className={`inline-flex items-center gap-1 rounded bg-surface px-1 py-0.5 text-[11px] ${inp.tool ? 'opacity-60' : ''}`}>
                              {it?.iconLink && <img src={it.iconLink} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
                              <span className="max-w-[120px] truncate">{it?.shortName ?? '…'}</span>
                              <span className="text-ink-dim">×{inp.count}</span>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums">{formatDuration(r.craft.duration)}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums">{r.inputCost != null ? `${formatRoubles(r.inputCost)}${r.partialCost ? '+' : ''}` : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums" title={r.revenueVia === 'flea' ? 'Flea, after fee' : r.revenueVia === 'trader' ? 'Trader' : ''}>{formatRoubles(r.revenue)}{r.revenueVia === 'trader' ? ' T' : ''}</td>
                    <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${r.profit != null && r.profit > 0 ? 'text-success' : r.profit != null && r.profit < 0 ? 'text-danger' : ''}`}>{r.profit != null ? formatRoubles(r.profit) : '—'}</td>
                    <td className={`px-3 py-1.5 text-right text-xs tabular-nums ${r.profitPerHour != null && r.profitPerHour > 0 ? 'text-success' : ''}`}>{r.profitPerHour != null ? formatRoubles(r.profitPerHour) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-muted">No crafts match these filters.</p>}
      </div>
    </div>
  )
}
