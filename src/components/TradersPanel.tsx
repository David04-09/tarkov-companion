import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, ChevronDown, ChevronUp } from 'lucide-react'
import { gameDataKeys, useGameData } from '../api/hooks'
import { formatClock } from '../desktop/timers'
import { useFleaStore } from '../store/flea'
import { useInventoryStore, useModeInventory } from '../store/inventory'
import { useProgressStore } from '../store/progress'

const NOTIFY_BEFORE_MS = 2 * 60 * 1000

function countdown(ms: number): string {
  if (ms <= 0) return 'due now'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}h ${formatClock(total % 3600)}` : formatClock(total)
}

/** Traders with avatar, editable loyalty level and restock countdown (from the API's resetTime). */
export function TradersPanel() {
  const gameData = useGameData()
  const queryClient = useQueryClient()
  const gameMode = useProgressStore((s) => s.gameMode)
  const inventory = useModeInventory()
  const setTraderLevel = useInventoryStore((s) => s.setTraderLevel)
  const notifyIds = useFleaStore((s) => s.notifyTraderIds)
  const setNotify = useFleaStore((s) => s.setNotifyTrader)
  const collapsed = useFleaStore((s) => s.tradersCollapsed)
  const setCollapsed = useFleaStore((s) => s.setTradersCollapsed)
  const [now, setNow] = useState(0)
  const notified = useRef(new Set<string>())
  const refreshedFor = useRef(new Set<string>())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Notifications 2 minutes before a chosen trader restocks; refetch traders once a reset passes.
  useEffect(() => {
    const traders = gameData.data?.traders ?? []
    for (const t of traders) {
      if (t.resetTime == null) continue
      const left = t.resetTime - now
      const key = `${t.id}:${t.resetTime}`
      if (notifyIds.includes(t.id) && left <= NOTIFY_BEFORE_MS && left > 0 && !notified.current.has(key)) {
        notified.current.add(key)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`${t.name} restocks in 2 minutes`, { body: 'Tarkov Companion', silent: false })
        }
      }
      if (left <= -30_000 && !refreshedFor.current.has(key)) {
        refreshedFor.current.add(key)
        void queryClient.invalidateQueries({ queryKey: gameDataKeys.mode(gameMode) })
      }
    }
  }, [now, gameData.data, notifyIds, queryClient, gameMode])

  const traders = (gameData.data?.traders ?? []).filter((t) => t.maxLevel > 1 || t.resetTime != null)
  if (traders.length === 0) return null
  const anyReset = traders.some((t) => t.resetTime != null)

  const toggleNotify = async (traderId: string, on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const res = await Notification.requestPermission()
      if (res !== 'granted') return
    }
    setNotify(traderId, on)
  }

  return (
    <section className="rounded-lg border border-line bg-surface-2">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Traders</h2>
        <span className="text-[11px] text-ink-dim">{anyReset ? 'Loyalty level is yours to set · countdown = next restock' : 'No restock times in the data right now'}</span>
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="ml-auto text-ink-dim hover:text-ink" aria-label={collapsed ? 'Expand traders' : 'Collapse traders'}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>
      {!collapsed && (
        <ul className="grid grid-cols-2 gap-1.5 border-t border-line px-3 py-2 sm:grid-cols-4 lg:grid-cols-8">
          {traders.map((t) => {
            const level = inventory.traderLevels[t.id] ?? 1
            const left = t.resetTime != null ? t.resetTime - now : null
            const on = notifyIds.includes(t.id)
            return (
              <li key={t.id} className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-xs">
                {t.imageLink ? <img src={t.imageLink} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" /> : <span className="h-8 w-8 rounded bg-surface-3" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="flex items-center gap-1 text-ink-muted">
                    {t.maxLevel > 1 ? (
                      <select value={level} onChange={(e) => setTraderLevel(gameMode, t.id, Number(e.target.value))} aria-label={`${t.name} loyalty level`} className="rounded border border-line bg-surface-2 px-1 py-px text-[11px] text-ink">
                        {Array.from({ length: t.maxLevel }, (_, i) => i + 1).map((l) => (
                          <option key={l} value={l}>LL{l}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-ink-dim">—</span>
                    )}
                    {left != null && <span className={`tabular-nums ${left <= NOTIFY_BEFORE_MS ? 'text-accent' : ''}`}>{countdown(left)}</span>}
                  </div>
                </div>
                {left != null && (
                  <button type="button" onClick={() => void toggleNotify(t.id, !on)} title={on ? 'Notification on (2 min before restock)' : 'Notify me 2 min before restock'} aria-pressed={on} className={`shrink-0 ${on ? 'text-accent' : 'text-ink-dim hover:text-ink'}`}>
                    {on ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
