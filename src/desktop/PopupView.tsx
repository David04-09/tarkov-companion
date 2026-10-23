import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PopupData, PopupItem, PopupQuest } from '../shared/desktop-api'

// The map (Leaflet) loads only when an answer has one.
const PopupMap = lazy(() => import('./PopupMap').then((m) => ({ default: m.PopupMap })))

const rub = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₽`

/** Time left before the pop-up closes by itself, with "say pause" next to it. */
function Countdown({ seconds, paused, hint }: { seconds: number; paused: boolean; hint: string }) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (paused || !seconds) return
    const end = Date.now() + seconds * 1000
    const id = window.setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 250)
    return () => window.clearInterval(id)
  }, [seconds, paused])
  if (paused) return <div className="mt-3 text-[11px] text-white/60">Paused · say "close" to hide it</div>
  if (!seconds) return hint ? <div className="mt-3 text-[11px] text-white/45">{hint}</div> : null
  return (
    <div className="mt-3">
      <div className="h-1 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-white/50 transition-[width] duration-200 ease-linear" style={{ width: `${(left / seconds) * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-white/55">
        <span>Closes in {left} s</span>
        <span>Say "pause" to keep it · "close" to hide it</span>
      </div>
    </div>
  )
}

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
 * It cannot be clicked (clicks go to the game); it closes when its countdown runs out ("pause"
 * stops it) or when you say "close". Maps come first (with an A1–F6 grid for "zoom in on D3"),
 * then an item's or quest's card, then a quest's guide pictures.
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null)
  // Each new card starts its own countdown.
  const [version, setVersion] = useState(0)
  const [mapReady, setMapReady] = useState(0)
  const onMapReady = useCallback(() => setMapReady((n) => n + 1), [])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The page itself is see-through; only the card is drawn.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.desktop?.onPopupData((d) => {
      setData(d)
      setVersion((v) => v + 1)
    })
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
      {data.map && (
        <Suspense fallback={<div className="mt-2 h-52 rounded-lg bg-white/5" />}>
          <PopupMap map={data.map} onReady={onMapReady} />
        </Suspense>
      )}
      {data.item && <ItemCard item={data.item} />}
      {data.quest && <QuestCard quest={data.quest} />}
      {data.images && data.images.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {data.images.map((im) => (
            <figure key={im.thumb} className="min-w-0">
              <img src={im.thumb} alt="" className="h-20 w-full rounded object-cover" onLoad={onMapReady} />
              {im.caption && <figcaption className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-white/60">{im.caption}</figcaption>}
            </figure>
          ))}
        </div>
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
      <Countdown key={version} seconds={data.autoCloseSeconds ?? 0} paused={!!data.paused} hint={data.hint} />
    </div>
  )
}
