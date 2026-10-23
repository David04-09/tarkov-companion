import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ExternalLink, Search, X } from 'lucide-react'
import { readOnlyPersistOptions } from '../api/persist'
import { queryClient } from '../api/queryClient'
import type { Item, Task } from '../api/types'
import { useNeeds } from '../hooks/useNeeds'
import { matchesSearch, rankMatch, searchWords } from '../lib/fleaSearch'
import { formatRoubles } from '../lib/format'
import { remainingFor } from '../lib/needs'
import { computeTaskStatuses, isFactionEligible, STATUS_LABEL } from '../lib/taskStatus'
import { useInventoryStore } from '../store/inventory'
import { useProfile, useProgressStore } from '../store/progress'

type Hit = { kind: 'item'; item: Item } | { kind: 'quest'; task: Task }

const MAX_ITEMS = 6
const MAX_QUESTS = 3

/**
 * Desktop: the search bar over the game (its own small window, top left of the main screen).
 * Faint until the mouse is over it; type any words of an item, key or quest name and pick one
 * for its price, where it is needed, or what to do. It reads the game data the app already saved
 * on this PC and never writes it.
 */
export function SearchBarApp() {
  useEffect(() => {
    // The page itself is see-through; only the bar is drawn.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    // The window follows the bar's size; no scroll bars while it catches up.
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    // Ticks and levels changed in the app window show here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === useProgressStore.persist.getOptions().name) void useProgressStore.persist.rehydrate()
      if (e.key === useInventoryStore.persist.getOptions().name) void useInventoryStore.persist.rehydrate()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={readOnlyPersistOptions(queryClient)}>
      <SearchBar />
    </PersistQueryClientProvider>
  )
}

function SearchBar() {
  const { needs, gameData, items, inventory } = useNeeds()
  const profile = useProfile()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(true)
  const [cursor, setCursor] = useState(0)
  const [picked, setPicked] = useState<Hit | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Clicking back into the game hides the results; coming back shows them again.
  useEffect(() => {
    const blur = () => setOpen(false)
    const focus = () => setOpen(true)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
    }
  }, [])

  const tasks = useMemo(() => (gameData.data?.tasks ?? []).filter((t) => isFactionEligible(t, profile.faction)), [gameData.data, profile.faction])
  const statuses = useMemo(() => computeTaskStatuses(tasks, profile), [tasks, profile])
  const itemList = useMemo(() => (items.data ? Object.values(items.data.items) : []), [items.data])
  const itemText = useMemo(() => new Map(itemList.map((it) => [it.id, `${it.name}\n${it.shortName}`.toLowerCase()])), [itemList])

  const hits = useMemo<Hit[]>(() => {
    const w = searchWords(query)
    if (w.join('').length < 2) return []
    const its = itemList
      .filter((it) => matchesSearch(itemText.get(it.id) ?? '', w))
      .sort((a, b) => rankMatch(a.name, a.shortName, w) - rankMatch(b.name, b.shortName, w) || a.name.length - b.name.length)
      .slice(0, MAX_ITEMS)
    const qs = tasks
      .filter((t) => matchesSearch(t.name.toLowerCase(), w))
      .sort((a, b) => rankMatch(a.name, '', w) - rankMatch(b.name, '', w) || a.name.length - b.name.length)
      .slice(0, MAX_QUESTS)
    return [...its.map((item) => ({ kind: 'item' as const, item })), ...qs.map((task) => ({ kind: 'quest' as const, task }))]
  }, [query, itemList, itemText, tasks])

  // The window follows the bar's height (results and details make it grow).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const send = () => void window.desktop?.setSearchBarHeight(Math.ceil(el.getBoundingClientRect().height) + 8)
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pick = (h: Hit | undefined) => h && setPicked(h)
  const clear = () => {
    setQuery('')
    setPicked(null)
    setCursor(0)
  }
  const openInApp = (h: Hit) => {
    const to =
      h.kind === 'quest'
        ? `/quests?${new URLSearchParams({ q: h.task.name, t: String(Date.now()) })}`
        : h.item.types.includes('keys')
          ? `/keys?${new URLSearchParams({ key: h.item.id, t: String(Date.now()) })}`
          : `/flea?${new URLSearchParams({ q: h.item.name, t: String(Date.now()) })}`
    void window.desktop?.openInApp(to)
  }
  const traderName = (id: string) => gameData.data?.traders.find((t) => t.id === id)?.name ?? 'Trader'
  const showResults = open && query.trim().length > 0

  return (
    <div ref={box} className="group m-1 w-[372px] text-[13px] text-white opacity-45 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100" style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/75 px-3 py-2 shadow-2xl backdrop-blur-sm">
        <Search className="h-4 w-4 shrink-0 text-white/60" />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPicked(null)
            setCursor(0)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(hits.length - 1, c + 1))
            else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1))
            else if (e.key === 'Enter') pick(hits[cursor])
            else if (e.key === 'Escape') {
              if (picked) setPicked(null)
              else {
                clear()
                input.current?.blur()
              }
            } else return
            e.preventDefault()
          }}
          placeholder={items.isPending ? 'Loading items…' : 'Search items, keys, quests…'}
          aria-label="Search items, keys and quests"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none"
        />
        {query && (
          <button type="button" onClick={clear} aria-label="Clear" className="rounded p-0.5 text-white/55 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showResults && !picked && (
        <ul role="listbox" aria-label="Results" className="mt-1 overflow-hidden rounded-lg border border-white/15 bg-black/80 py-1 shadow-2xl backdrop-blur-sm">
          {hits.length === 0 && <li className="px-3 py-2 text-white/55">{items.isPending ? 'Loading items…' : 'Nothing matches.'}</li>}
          {hits.map((h, i) => (
            <li key={h.kind === 'item' ? h.item.id : h.task.id} role="option" aria-selected={i === cursor}>
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => pick(h)} className={`flex w-full items-center gap-2 px-3 py-1 text-left ${i === cursor ? 'bg-white/10' : ''}`}>
                {h.kind === 'item' ? (
                  <>
                    {h.item.iconLink ? <img src={h.item.iconLink} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" /> : <span className="h-6 w-6 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{h.item.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-white/55">{h.item.types.includes('noFlea') ? 'no flea' : h.item.avg24hPrice ? formatRoubles(h.item.avg24hPrice) : '—'}</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] text-white/70">Q</span>
                    <span className="min-w-0 flex-1 truncate">{h.task.name}</span>
                    <span className="shrink-0 text-xs text-white/55">{STATUS_LABEL[statuses[h.task.id] ?? 'locked']}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && picked?.kind === 'item' && (
        <ItemCard
          item={picked.item}
          traderName={traderName}
          remaining={(() => {
            const need = needs.get(picked.item.id)
            return need ? remainingFor(need, inventory.collected[picked.item.id] ?? 0) : 0
          })()}
          fir={(needs.get(picked.item.id)?.fir ?? 0) > 0}
          lockMaps={(gameData.data?.maps ?? []).filter((m) => (gameData.data?.mapDetails[m.id]?.locks ?? []).some((l) => l.keyId === picked.item.id)).map((m) => m.name)}
          onBack={() => setPicked(null)}
          onOpen={() => openInApp(picked)}
        />
      )}
      {open && picked?.kind === 'quest' && <QuestCard task={picked.task} status={STATUS_LABEL[statuses[picked.task.id] ?? 'locked']} onBack={() => setPicked(null)} onOpen={() => openInApp(picked)} />}
    </div>
  )
}

function CardFrame({ children, onBack, onOpen }: { children: React.ReactNode; onBack: () => void; onOpen: () => void }) {
  return (
    <div className="mt-1 rounded-lg border border-white/15 bg-black/80 p-3 shadow-2xl backdrop-blur-sm">
      {children}
      <div className="mt-2 flex justify-between text-xs">
        <button type="button" onClick={onBack} className="text-white/60 hover:text-white">← Results</button>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-white/60 hover:text-white">
          Open in the app <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function ItemCard({ item, traderName, remaining, fir, lockMaps, onBack, onOpen }: { item: Item; traderName: (id: string) => string; remaining: number; fir: boolean; lockMaps: string[]; onBack: () => void; onOpen: () => void }) {
  const sell = [...item.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)[0]
  const banned = item.types.includes('noFlea')
  return (
    <CardFrame onBack={onBack} onOpen={onOpen}>
      <div className="flex gap-3">
        {item.iconLink && <img src={item.iconLink} alt="" className="h-14 w-14 shrink-0 object-contain" />}
        <div className="min-w-0">
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-white/55">
            {item.shortName} · {item.width}×{item.height}
          </div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-white/50">Flea</dt>
        <dd className="tabular-nums">{banned ? "Can't be sold there" : item.avg24hPrice ? `${formatRoubles(item.avg24hPrice)}${item.lastLowPrice ? ` (lowest ${formatRoubles(item.lastLowPrice)})` : ''}` : '—'}</dd>
        {sell && (
          <>
            <dt className="text-white/50">Trader</dt>
            <dd className="tabular-nums">{formatRoubles(sell.priceRUB)} <span className="text-white/50">({traderName(sell.traderId)})</span></dd>
          </>
        )}
        {!banned && item.fleaLevel != null && (
          <>
            <dt className="text-white/50">Sell from</dt>
            <dd>level {item.fleaLevel}</dd>
          </>
        )}
        <dt className="text-white/50">Needed</dt>
        <dd>{remaining > 0 ? `${remaining} more${fir ? ' (found in raid)' : ''}` : 'nothing open needs it'}</dd>
        {lockMaps.length > 0 && (
          <>
            <dt className="text-white/50">Opens</dt>
            <dd>a lock on {[...new Set(lockMaps)].join(', ')}</dd>
          </>
        )}
      </dl>
    </CardFrame>
  )
}

function QuestCard({ task, status, onBack, onOpen }: { task: Task; status: string; onBack: () => void; onOpen: () => void }) {
  return (
    <CardFrame onBack={onBack} onOpen={onOpen}>
      <div className="font-medium">{task.name}</div>
      <div className="text-xs text-white/60">
        {task.trader.name}
        {task.map ? ` · ${task.map.name}` : ''} · {status}
        {task.minPlayerLevel > 1 ? ` · level ${task.minPlayerLevel}` : ''}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-white/85">
        {task.objectives
          .filter((o) => !o.optional)
          .slice(0, 6)
          .map((o) => (
            <li key={o.id} className="flex gap-1.5">
              <span className="text-white/40">•</span>
              <span className="min-w-0">{o.description}</span>
            </li>
          ))}
      </ul>
    </CardFrame>
  )
}
