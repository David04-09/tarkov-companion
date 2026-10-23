import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ExternalLink, Map as MapIcon, Search, X } from 'lucide-react'
import { readOnlyPersistOptions } from '../api/persist'
import { queryClient } from '../api/queryClient'
import type { Item, Task } from '../api/types'
import { useNeeds } from '../hooks/useNeeds'
import { matchesSearch, rankMatch, searchWords } from '../lib/fleaSearch'
import { formatRoubles } from '../lib/format'
import { remainingFor } from '../lib/needs'
import { computeTaskStatuses, isFactionEligible, STATUS_LABEL } from '../lib/taskStatus'
import { followOtherWindows } from '../lib/crossWindow'
import { useMapOptions, type MapOption } from '../maps/useMapOptions'
import { useInventoryStore } from '../store/inventory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProfile, useProgressStore } from '../store/progress'
import { useUiStore } from '../store/ui'
import { useTickedOnMap } from './tickedOnMap'

// The map (Leaflet) loads only when a map is opened.
const SearchBarMap = lazy(() => import('./SearchBarMap').then((m) => ({ default: m.SearchBarMap })))

/** Other names people use for maps. */
const MAP_NICKNAMES: Record<string, string> = { 'the-lab': 'labs lab', 'streets-of-tarkov': 'streets', 'ground-zero': 'gz', 'ground-zero-21': 'gz', 'night-factory': 'night' }

type Hit = { kind: 'item'; item: Item } | { kind: 'quest'; task: Task } | { kind: 'map'; map: MapOption }

const MAX_ITEMS = 6
const MAX_QUESTS = 5
const MAX_MAPS = 3

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
    // Ticks, levels and map choices made in the app window show here too (and the other way round).
    return followOtherWindows([useProgressStore, useInventoryStore, useMapOverlayStore, useUiStore])
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
  const mapOptions = useMapOptions()
  const onMap = useMapOverlayStore((s) => s.checkedTaskIds)
  const setOnMap = useMapOverlayStore((s) => s.setTaskChecked)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(true)
  const [cursor, setCursor] = useState(0)
  const [picked, setPicked] = useState<Hit | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Clicking back into the game hides the result list (an open card or map stays); coming back shows it again.
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
    const ms = mapOptions.filter((m) => !/night/.test(m.key) && matchesSearch(`${m.name} ${MAP_NICKNAMES[m.key] ?? ''}`.toLowerCase(), w)).slice(0, MAX_MAPS)
    return [...ms.map((map) => ({ kind: 'map' as const, map })), ...its.map((item) => ({ kind: 'item' as const, item })), ...qs.map((task) => ({ kind: 'quest' as const, task }))]
  }, [query, itemList, itemText, tasks, mapOptions])

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
      h.kind === 'map'
        ? `/maps?${new URLSearchParams({ map: h.map.key, t: String(Date.now()) })}`
        : h.kind === 'quest'
        ? `/quests?${new URLSearchParams({ q: h.task.name, t: String(Date.now()) })}`
        : h.item.types.includes('keys')
          ? `/keys?${new URLSearchParams({ key: h.item.id, t: String(Date.now()) })}`
          : `/flea?${new URLSearchParams({ q: h.item.name, t: String(Date.now()) })}`
    void window.desktop?.openInApp(to)
  }
  const traderName = (id: string) => gameData.data?.traders.find((t) => t.id === id)?.name ?? 'Trader'
  const showResults = open && query.trim().length > 0
  // A map is something to keep an eye on during the raid: it stays clearer than the rest.
  const mapShown = picked?.kind === 'map'

  return (
    <div ref={box} className={`group m-1 w-[372px] text-[13px] text-white transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100 ${mapShown ? 'opacity-80' : 'opacity-45'}`} style={{ fontFamily: 'system-ui, sans-serif' }}>
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
          placeholder={items.isPending ? 'Loading items…' : 'Search maps, items, keys, quests…'}
          aria-label="Search maps, items, keys and quests"
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
            <li key={h.kind === 'item' ? h.item.id : h.kind === 'quest' ? h.task.id : h.map.key} role="option" aria-selected={i === cursor} className="flex items-center">
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => pick(h)} className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-1 text-left ${i === cursor ? 'bg-white/10' : ''}`}>
                {h.kind === 'map' ? (
                  <>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/10 text-white/80"><MapIcon className="h-3.5 w-3.5" /></span>
                    <span className="min-w-0 flex-1 truncate">{h.map.name}</span>
                    <span className="shrink-0 text-xs text-white/55">map</span>
                  </>
                ) : h.kind === 'item' ? (
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
              {h.kind === 'quest' && <OnMapBox checked={onMap.includes(h.task.id)} onChange={(on) => setOnMap(h.task.id, on)} />}
            </li>
          ))}
        </ul>
      )}

      {picked?.kind === 'map' && <MapCard option={picked.map} onBack={() => setPicked(null)} onOpen={() => openInApp(picked)} />}
      {picked?.kind === 'item' && (
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
      {picked?.kind === 'quest' && (
        <QuestCard task={picked.task} status={STATUS_LABEL[statuses[picked.task.id] ?? 'locked']} onMap={onMap.includes(picked.task.id)} setOnMap={(on) => setOnMap(picked.task.id, on)} onBack={() => setPicked(null)} onOpen={() => openInApp(picked)} />
      )}
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

function QuestCard({ task, status, onMap, setOnMap, onBack, onOpen }: { task: Task; status: string; onMap: boolean; setOnMap: (on: boolean) => void; onBack: () => void; onOpen: () => void }) {
  return (
    <CardFrame onBack={onBack} onOpen={onOpen}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 font-medium">{task.name}</div>
        <OnMapBox checked={onMap} onChange={setOnMap} />
      </div>
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

/** "On map": the quest's spots are drawn on its map, here and on the app's Maps tab. */
function OnMapBox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1 px-2 text-[11px] text-white/60 hover:text-white" title="Show this quest's spots on its map (here and on the Maps tab)">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
      On map
    </label>
  )
}

function MapCard({ option, onBack, onOpen }: { option: MapOption; onBack: () => void; onOpen: () => void }) {
  const ticked = useTickedOnMap(option)
  return (
    <div className="mt-1 rounded-lg border border-white/20 bg-black/85 p-2 shadow-2xl backdrop-blur-sm">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="font-medium">{option.name}</span>
        <span className="text-[11px] text-white/55">{ticked ? `${ticked} quest${ticked === 1 ? '' : 's'} on the map` : 'Tick "On map" next to a quest to show it'}</span>
      </div>
      <Suspense fallback={<div className="h-72 rounded-md bg-white/5" />}>
        <SearchBarMap option={option} />
      </Suspense>
      <div className="mt-1.5 flex justify-between px-1 text-xs">
        <button type="button" onClick={onBack} className="text-white/60 hover:text-white">← Results</button>
        <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-white/60 hover:text-white">
          Open in the app <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
