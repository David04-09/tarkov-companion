import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Search } from 'lucide-react'
import { columnClass, readLook, saveLook, useDrag, type Flip, type Look } from './shell'

// Everything past the magnifying glass (game data, search, cards, maps) loads on the first click.
const SearchBarBody = lazy(() => import('./SearchBarBody'))

/** Nothing open for this long: the game data is dropped from memory (it loads again on the next click). */
const IDLE_UNLOAD_MS = 3 * 60_000

/**
 * Desktop: the search bar over the game (its own small window). At rest it is only a magnifying
 * glass: click it to search maps, items, keys and quests, drag it anywhere on the screen. Cards,
 * a map and side panels open around it; the see-through parts let clicks through to the game.
 * It reads the game data the app already saved on this PC and never writes it.
 */
export function SearchBarApp() {
  const [flip, setFlip] = useState<Flip>({ left: false, up: false })
  const [look, setLookState] = useState<Look>(readLook)
  const [woken, setWoken] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [state, setState] = useState({ busy: false, clear: false, preview: false })
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The page itself is see-through; only the bar is drawn. The window follows its size, so no scroll bars.
    for (const el of [document.documentElement, document.body]) {
      el.style.background = 'transparent'
      el.style.overflow = 'hidden'
    }
    const offLayout = window.desktop?.onSearchBarLayout(setFlip)
    // Clicking back into the game shrinks it to the glass (an open map and side panels stay).
    const blur = () => setExpanded(false)
    window.addEventListener('blur', blur)
    // Clicks on see-through parts go to the game: only drawn parts (data-solid) take the mouse.
    let through: boolean | null = null
    const move = (e: MouseEvent) => {
      const on = !(e.target instanceof Element && e.target.closest('[data-solid]'))
      if (on === through) return
      through = on
      void window.desktop?.setSearchBarPassthrough(on)
    }
    window.addEventListener('mousemove', move)
    return () => {
      offLayout?.()
      window.removeEventListener('blur', blur)
      window.removeEventListener('mousemove', move)
    }
  }, [])

  // The window follows what is drawn (the glass, the bar, cards, the map, side panels).
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const send = () => {
      const r = el.getBoundingClientRect()
      void window.desktop?.setSearchBarSize(Math.ceil(r.width) + 8, Math.ceil(r.height) + 8)
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Lightweight while it waits: after a while with nothing open, unload the data.
  useEffect(() => {
    if (!woken || expanded || state.busy) return
    const t = window.setTimeout(() => setWoken(false), IDLE_UNLOAD_MS)
    return () => window.clearTimeout(t)
  }, [woken, expanded, state.busy])

  const open = useCallback(() => {
    setWoken(true)
    setExpanded(true)
  }, [])
  const drag = useDrag(open)
  const grip = useDrag()
  const setLook = useCallback((l: Look) => {
    setLookState(l)
    saveLook(l)
  }, [])
  const onState = useCallback(
    (busy: boolean, clear: boolean, preview: boolean) => setState((s) => (s.busy === busy && s.clear === clear && s.preview === preview ? s : { busy, clear, preview })),
    [],
  )

  const glass = (
    <button
      type="button"
      data-solid
      {...drag}
      title="Click to search · drag to move it"
      aria-label="Open the search"
      className="flex h-10 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-full border border-white/15 bg-black/75 text-white/80 shadow-2xl hover:text-white active:cursor-grabbing"
    >
      <Search className="h-5 w-5" />
    </button>
  )
  const fade = (state.clear ? look.map : look.idle) / 100

  return (
    <div className="fixed inset-0 flex p-1" style={{ justifyContent: flip.left ? 'flex-end' : 'flex-start', alignItems: flip.up ? 'flex-end' : 'flex-start' }}>
      <div
        ref={box}
        className={`flex w-max gap-1.5 text-[13px] text-white transition-opacity duration-150 opacity-(--sb-fade) ${state.preview ? '' : 'hover:opacity-100 focus-within:opacity-100'} ${flip.left ? 'flex-row-reverse' : ''} ${flip.up ? 'items-end' : 'items-start'}`}
        style={{ fontFamily: 'system-ui, sans-serif', '--sb-fade': fade } as CSSProperties}
      >
        {woken ? (
          <Suspense fallback={<div className={columnClass(flip)}>{glass}</div>}>
            <SearchBarBody flip={flip} expanded={expanded} setExpanded={setExpanded} glass={glass} grip={grip} look={look} setLook={setLook} onState={onState} />
          </Suspense>
        ) : (
          <div className={columnClass(flip)}>{glass}</div>
        )}
      </div>
    </div>
  )
}
