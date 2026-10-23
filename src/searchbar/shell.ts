import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

/** Which way the window grows from the glass (main flips it near a screen edge). */
export interface Flip {
  left: boolean
  up: boolean
}

/** How see-through the search bar is when the mouse is not over it (percent). */
export interface Look {
  idle: number
  map: number
}

export const DEFAULT_LOOK: Look = { idle: 45, map: 80 }
const LOOK_KEY = 'tc-searchbar-look'

export function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null') as Partial<Look> | null
    const pct = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(10, Math.round(n))) : d)
    return { idle: pct(v?.idle, DEFAULT_LOOK.idle), map: pct(v?.map, DEFAULT_LOOK.map) }
  } catch {
    return DEFAULT_LOOK
  }
}

export function saveLook(look: Look) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look))
  } catch {
    // only a convenience
  }
}

/** A remembered yes/no (sidebar shown, bigger map, …). */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function saveFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    // only a convenience
  }
}

/** The column holding the glass/bar and the card under (or, flipped, above) it. */
export const columnClass = (flip: Flip) => `flex flex-col gap-1 ${flip.up ? 'flex-col-reverse' : ''} ${flip.left ? 'items-end' : 'items-start'}`

export type DragProps = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
  onPointerMove: (e: PointerEvent<HTMLElement>) => void
  onPointerUp: (e: PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: PointerEvent<HTMLElement>) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

/**
 * Drag to move the whole search bar window anywhere on the screen; a press without moving is a
 * click. Moves are sent at most once per frame; the spot is saved when the drag ends.
 */
export function useDrag(onClick?: () => void): DragProps {
  const st = useRef<{ x: number; y: number; moved: boolean; dx: number; dy: number; raf: number } | null>(null)
  const flush = () => {
    const s = st.current
    if (!s) return
    s.raf = 0
    if (s.dx || s.dy) void window.desktop?.moveSearchBar(s.dx, s.dy)
    s.dx = 0
    s.dy = 0
  }
  const end = (click: boolean) => {
    const s = st.current
    st.current = null
    if (!s) return
    if (s.raf) cancelAnimationFrame(s.raf)
    if (s.moved) {
      if (s.dx || s.dy) void window.desktop?.moveSearchBar(s.dx, s.dy)
      void window.desktop?.searchBarMoved()
    } else if (click) onClick?.()
  }
  return {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      st.current = { x: e.screenX, y: e.screenY, moved: false, dx: 0, dy: 0, raf: 0 }
    },
    onPointerMove: (e) => {
      const s = st.current
      if (!s) return
      const dx = e.screenX - s.x
      const dy = e.screenY - s.y
      if (!s.moved && Math.hypot(dx, dy) < 4) return
      s.moved = true
      s.x = e.screenX
      s.y = e.screenY
      s.dx += dx
      s.dy += dy
      if (!s.raf) s.raf = requestAnimationFrame(flush)
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      onClick?.()
    },
  }
}
