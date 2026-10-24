import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

/** Which way the window grows from the glass (main flips it near a screen edge). */
export interface Flip {
  left: boolean
  up: boolean
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

/** A clock that ticks only while something on screen needs it (null = stopped). */
export function useNow(everyMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!everyMs) return
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [everyMs])
  return now
}
