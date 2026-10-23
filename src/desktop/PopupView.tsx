import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PopupData, PopupItem, PopupQuest } from '../shared/desktop-api'

// The map (Leaflet) loads only when an answer has one.
const PopupMap = lazy(() => import('./PopupMap').then((m) => ({ default: m.PopupMap })))

const rub = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₽`

function ItemCard({ item }: { item: PopupItem }) {
  return (
    <div className="mt-2 flex gap-3 rounded-lg bg-white/5 p-2">
      {item.iconLink && <img src={item.iconLink} alt="" className="h-14 w-14 shrink-0 object-contain" />}
      <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
        <dt className="text-white/50">Flea</dt>
        <dd className="tabular-nums">{item.banned ? "Can't be sold there" : item.flea != null ? rub(item.flea) : '—'}</dd>
        {item.trader && (
          <>
            <dt className="text-white/50">Trader</dt>
            <dd className="tabular-nums">{rub(item.trader.price)} <span className="text-white/50">({item.trader.name})</span></dd>
          </>
        )}
        {!item.banned && item.fleaLevel != null && (
          <>
            <dt className="text-white/50">Sell from</dt>
            <dd>level {item.fleaLevel}</dd>
          </>
        )}
        <dt className="text-white/50">Needed</dt>
        <dd>{item.needed > 0 ? `${item.needed} more${item.fir ? ' (found in raid)' : ''}` : 'nothing open needs it'}</dd>
      </dl>
    </div>
  )
}

function QuestCard({ quest }: { quest: PopupQuest }) {
  return (
    <div className="mt-2 rounded-lg bg-white/5 p-2 text-[13px]">
      <div className="text-white/70">
        {quest.trader}
        {quest.map ? ` · ${quest.map}` : ''} · {quest.status}
        {quest.level > 1 ? ` · level ${quest.level}` : ''}
      </div>
      {quest.objectives.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-white/85">
          {quest.objectives.map((o, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-white/40">•</span>
              <span className="min-w-0">{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The assistant's pop-up window (desktop): only this card, on a see-through window over the game.
 * It cannot be clicked (clicks go to the game); it closes by itself or when you say "close".
 * Item answers show the item's card, quest answers the quest's, places and routes a mini-map.
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null)
  const [mapReady, setMapReady] = useState(0)
  const onMapReady = useCallback(() => setMapReady((n) => n + 1), [])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The page itself is see-through; only the card is drawn.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.desktop?.onPopupData(setData)
  }, [])

  // The window is sized to the card once it is drawn (again when the map has loaded).
  useLayoutEffect(() => {
    if (!data || !box.current) return
    void window.desktop?.setPopupHeight(Math.ceil(box.current.getBoundingClientRect().height) + 4)
  }, [data, mapReady])

  if (!data) return null
  return (
    <div ref={box} className="m-0.5 rounded-xl border border-white/15 bg-black/70 p-4 text-[15px] leading-snug text-white shadow-2xl backdrop-blur-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {data.title && <div className="mb-1 truncate text-xs uppercase tracking-wide text-white/55">{data.title}</div>}
      <p className="font-medium">{data.text}</p>
      {data.item && <ItemCard item={data.item} />}
      {data.quest && <QuestCard quest={data.quest} />}
      {!data.item && !data.quest && data.map && (
        <Suspense fallback={<div className="mt-2 h-52 rounded-lg bg-white/5" />}>
          <PopupMap map={data.map} onReady={onMapReady} />
        </Suspense>
      )}
      {data.lines.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[13px] text-white/80">
          {data.lines.map((l, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-white/40">•</span>
              <span className="min-w-0">{l}</span>
            </li>
          ))}
        </ul>
      )}
      {data.hint && <div className="mt-3 text-[11px] text-white/45">{data.hint}</div>}
    </div>
  )
}
