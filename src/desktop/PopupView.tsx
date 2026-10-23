import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PopupData } from '../shared/desktop-api'

/**
 * The assistant's pop-up window (desktop): only this card, on a see-through window over the game.
 * It cannot be clicked (clicks go to the game); the assistant closes it when you say "close that".
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The page itself is see-through; only the card is drawn.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return window.desktop?.onPopupData(setData)
  }, [])

  // The window is sized to the card once it is drawn.
  useLayoutEffect(() => {
    if (!data || !box.current) return
    void window.desktop?.setPopupHeight(Math.ceil(box.current.getBoundingClientRect().height) + 4)
  }, [data])

  if (!data) return null
  return (
    <div ref={box} className="m-0.5 rounded-xl border border-white/15 bg-black/70 p-4 text-[15px] leading-snug text-white shadow-2xl backdrop-blur-sm" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {data.title && <div className="mb-1 truncate text-xs uppercase tracking-wide text-white/55">{data.title}</div>}
      <p className="font-medium">{data.text}</p>
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
