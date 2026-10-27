import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Crosshair, Dumbbell, Fan, Flame, HeartPulse, Hourglass, Lock, Monitor, Sparkles, Sun, Trophy, Wrench, Zap, type LucideIcon } from 'lucide-react'
import type { GameMode } from '../api/client'
import type { HideoutStation, Item, Trader } from '../api/types'
import { hideoutSummary, type StationInfo } from '../lib/hideoutState'
import { useNow } from '../searchbar/shell'
import { useHideoutTimers, type BuildTimer } from '../store/hideoutTimers'
import { Countdown } from './Countdown'
import { darkness, EFFECTS, roomsFor, WALL_STATION, type Effect } from './layout'
import { activeTimer, lookLabel, lookOf, type Look, type Names } from './look'
import { StationPanel } from './StationPanel'

const COUNTERS: { look: Look; label: string }[] = [
  { look: 'ready', label: 'ready to build' },
  { look: 'building', label: 'building' },
  { look: 'done', label: 'finished?' },
  { look: 'items', label: 'need items' },
  { look: 'locked', label: 'locked' },
  { look: 'max', label: 'fully built' },
]

const MOTION_KEY = 'tc-hideout-motion'
function loadMotion(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) !== 'off'
  } catch {
    return true
  }
}

export interface BunkerProps {
  stations: HideoutStation[]
  infos: Map<string, StationInfo>
  gameMode: GameMode
  items: Record<string, Item> | undefined
  traders: Trader[]
  /** Your loyalty per trader (null while the quest data loads). */
  traderLevel: Record<string, number> | null
  collected: Record<string, number>
  setLevel: (stationId: string, level: number) => void
  setCollected: (itemId: string, count: number) => void
}

export function BunkerView(props: BunkerProps) {
  const { stations, infos, gameMode, traders } = props
  const sceneRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<Look | null>(null)
  const [motion, setMotion] = useState(loadMotion)
  const timers = useHideoutTimers((s) => s.byMode[gameMode])
  // Tiles flip from "building" to "finished?" on this clock; the countdown text ticks by itself.
  const anyTimer = Object.keys(timers).length > 0
  const now = useNow(anyTimer ? 15_000 : null)

  const rooms = useMemo(() => roomsFor(stations), [stations])
  const looks = useMemo(() => {
    const out = new Map<string, Look>()
    for (const [id, info] of infos) out.set(id, lookOf(info, timers[id], now))
    return out
  }, [infos, timers, now])
  const summary = useMemo(() => hideoutSummary(infos.values()), [infos])
  const counts = useMemo(() => {
    const c: Partial<Record<Look, number>> = {}
    for (const l of looks.values()) c[l] = (c[l] ?? 0) + 1
    return c
  }, [looks])

  const byName = useMemo(() => new Map([...infos.values()].map((i) => [i.station.normalizedName, i])), [infos])
  const names = useMemo<Names>(
    () => ({
      station: (id: string) => infos.get(id)?.station.name ?? 'Station',
      trader: (id: string) => traders.find((t) => t.id === id)?.name ?? 'Trader',
    }),
    [infos, traders],
  )
  const light = byName.get('illumination')
  const dark = light ? darkness(light.level, light.max) : 0
  const powered = (byName.get('generator')?.level ?? 0) > 0
  const wall = byName.get(WALL_STATION)
  const wallOpen = !wall || wall.level >= wall.max

  // Hovering a station fades everything it has nothing to do with.
  const related = useMemo(() => {
    const info = hover ? infos.get(hover) : undefined
    if (!info) return null
    const ids = new Set([info.station.id])
    for (const r of info.next?.stationLevelRequirements ?? []) ids.add(r.stationId)
    for (const u of info.unlocks) ids.add(u.stationId)
    return ids
  }, [hover, infos])

  const pick = (id: string | null) => {
    setSelected((cur) => (cur === id ? null : id))
    if (id && !window.matchMedia('(min-width: 1280px)').matches) requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const toggleMotion = () => {
    setMotion((m) => {
      try {
        localStorage.setItem(MOTION_KEY, m ? 'off' : 'on')
      } catch {
        /* private window: only this visit */
      }
      return !m
    })
  }

  const ready = [...infos.values()].filter((i) => looks.get(i.station.id) === 'ready')
  const building = [...infos.values()].flatMap((i) => {
    const t = activeTimer(i, timers[i.station.id])
    return t ? [{ info: i, timer: t }] : []
  })
  const pct = summary.total ? Math.round((summary.built / summary.total) * 100) : 0
  const selectedInfo = selected ? infos.get(selected) ?? null : null

  const tile = (s: HideoutStation) => {
    const info = infos.get(s.id)
    if (!info) return null
    const look = looks.get(s.id) ?? info.state
    const dim = (related && !related.has(s.id)) || (highlight !== null && look !== highlight)
    return (
      <StationTile
        key={s.id}
        info={info}
        look={look}
        label={lookLabel(look, info, names, true)}
        timer={activeTimer(info, timers[s.id])}
        selected={selected === s.id}
        dim={Boolean(dim)}
        onPick={pick}
        onHover={setHover}
      />
    )
  }

  return (
    <div className={`mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem] ${motion ? '' : 'tc-still'}`}>
      <div className="min-w-0 space-y-3">
        {/* Overview strip: levels built, states (click to highlight), what can be built now. */}
        <div className="tc-hud">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-[13rem] flex-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold uppercase tracking-wider text-ink-muted">Hideout built</span>
                <span className="tabular-nums text-ink-muted">
                  <b className="text-base text-ink">{summary.built}</b>/{summary.total} levels · {pct}%
                </span>
              </div>
              <div className="tc-meter mt-1.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Hideout levels built">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Highlight stations">
              {COUNTERS.filter((c) => counts[c.look] || c.look === 'ready').map((c) => (
                <button
                  key={c.look}
                  type="button"
                  aria-pressed={highlight === c.look}
                  onClick={() => setHighlight((h) => (h === c.look ? null : c.look))}
                  className={`tc-counter tc-st-${c.look} ${highlight === c.look ? 'is-on' : ''}`}
                  title={highlight === c.look ? 'Show every station' : `Highlight stations that are ${c.label}`}
                >
                  <b>{counts[c.look] ?? 0}</b> {c.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={toggleMotion} aria-pressed={motion} className={`tc-counter ${motion ? 'is-on tc-st-max' : ''}`} title="Moving fans, lights and machines in the bunker">
              <Sparkles className="h-3.5 w-3.5" /> {motion ? 'Live' : 'Still'}
            </button>
          </div>
          {(ready.length > 0 || building.length > 0) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5 text-xs">
              {building.map(({ info, timer }) => (
                <button key={info.station.id} type="button" onClick={() => pick(info.station.id)} className="tc-mini tc-st-building">
                  <Hourglass className="h-3 w-3" /> {info.station.name} {timer.level} · <Countdown endsAt={timer.endsAt} />
                </button>
              ))}
              {ready.length > 0 && <span className="ml-1 text-ink-muted">Build now:</span>}
              {ready.map((i) => (
                <button key={i.station.id} type="button" onClick={() => pick(i.station.id)} className="tc-mini tc-st-ready">
                  {i.station.name} {i.next?.level}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* The bunker itself. */}
        <div ref={sceneRef} className="tc-bunker" style={{ '--dark': dark } as CSSProperties}>
          <div className="relative z-[1] flex items-center gap-2 px-4 pt-3 text-[11px] text-ink-muted">
            <Zap className={`h-3.5 w-3.5 ${powered ? 'text-[#f2b84b]' : 'text-ink-dim'}`} />
            <span className="whitespace-nowrap">{powered ? `Generator level ${byName.get('generator')?.level}` : 'No generator yet'}</span>
            <div className={`tc-bus flex-1 ${powered ? 'is-on' : ''}`} aria-hidden />
            <span className="whitespace-nowrap">{light && light.level > 0 ? `Lights level ${light.level}` : 'Lights off'}</span>
          </div>
          {/* Not its own layer: the lines (z 1) then run above the room floors but under the stations and room headers (z 2). */}
          <div className="relative grid gap-3 p-3 md:grid-cols-2 md:p-4">
            {rooms.map(({ room, stations: list }) => {
              const built = list.reduce((n, s) => n + Math.min(infos.get(s.id)?.level ?? 0, infos.get(s.id)?.max ?? 0), 0)
              const total = list.reduce((n, s) => n + (infos.get(s.id)?.max ?? 0), 0)
              const isWall = room.id === 'wall'
              const inner = isWall ? list.filter((s) => s.normalizedName !== WALL_STATION) : []
              return (
                <section key={room.id} className={`tc-room ${room.wide ? 'md:col-span-2' : ''}`} aria-label={room.name}>
                  <header className="tc-room-head">
                    <span className={`tc-lamp ${light && light.level > 0 ? (light.level < light.max ? 'is-on is-dim' : 'is-on') : ''}`} aria-hidden />
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink">{room.name}</h3>
                    <span className="hidden truncate text-[11px] text-ink-dim sm:inline">{room.note}</span>
                    <span className="ml-auto whitespace-nowrap text-[11px] tabular-nums text-ink-dim">
                      {built}/{total}
                    </span>
                  </header>
                  {isWall ? (
                    <div className="flex flex-wrap items-stretch justify-center gap-3 p-3">
                      {list.filter((s) => s.normalizedName === WALL_STATION).map(tile)}
                      <div className={`tc-sealed ${wallOpen ? 'is-open' : ''}`}>
                        <p className="w-full text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                          {wallOpen ? 'Hidden room' : `Sealed · wall ${wall?.level ?? 0}/${wall?.max ?? 6}`}
                        </p>
                        {inner.map(tile)}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-center gap-2 p-3">{list.map(tile)}</div>
                  )}
                </section>
              )
            })}
          </div>
          <p className="relative z-[1] px-4 pb-3 text-[11px] text-ink-dim">
            Rooms group stations by what they do; they are not the game's floor plan. Hover a station to see what it needs (green built, red still missing) and what it opens (gold).
          </p>
          <LinkLayer sceneRef={sceneRef} focus={hover ?? selected} infos={infos} />
        </div>
      </div>

      <div ref={panelRef} className="scroll-mt-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto">
        <StationPanel
          {...props}
          info={selectedInfo}
          look={selectedInfo ? looks.get(selectedInfo.station.id) ?? selectedInfo.state : null}
          timer={selectedInfo ? activeTimer(selectedInfo, timers[selectedInfo.station.id]) : undefined}
          names={names}
          ready={ready}
          onPick={(id) => setSelected(id)}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  )
}

function StationTile({ info, look, label, timer, selected, dim, onPick, onHover }: {
  info: StationInfo
  look: Look
  label: string
  timer: BuildTimer | undefined
  selected: boolean
  dim: boolean
  onPick: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const { station, level, max } = info
  const pct = max ? Math.round((Math.min(level, max) / max) * 100) : 100
  return (
    <button
      type="button"
      data-station={station.id}
      aria-pressed={selected}
      title={`${station.name}: level ${level} of ${max}${label ? ` · ${look === 'locked' ? 'needs ' : ''}${label}` : ''}`}
      className={`tc-station tc-st-${look} ${level > 0 ? 'is-built' : 'is-empty'} ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`}
      style={{ '--pct': pct, '--lvl': max ? Math.min(level, max) / max : 1 } as CSSProperties}
      onClick={() => onPick(station.id)}
      onMouseEnter={() => onHover(station.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(station.id)}
      onBlur={() => onHover(null)}
    >
      <span className="tc-badge">
        {level > 0 && <Fx effect={EFFECTS[station.normalizedName] ?? 'none'} level={level} max={max} />}
        {station.imageLink ? <img src={station.imageLink} alt="" loading="lazy" draggable={false} /> : <span className="relative z-[1] text-lg font-semibold">{station.name.slice(0, 1)}</span>}
      </span>
      <span className="tc-station-name">{station.name}</span>
      <span className="tc-pips" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <i key={i} className={i < level ? 'on' : i === level ? 'next' : ''} />
        ))}
      </span>
      <span className="tc-chip">
        {look === 'building' && timer ? (
          <>
            <Hourglass className="mr-0.5 inline h-2.5 w-2.5" />
            <Countdown endsAt={timer.endsAt} />
          </>
        ) : look === 'locked' ? (
          <>
            <Lock className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />
            {label}
          </>
        ) : (
          label
        )}
      </span>
    </button>
  )
}

/** The little bit of life on a built station (paused by the Live/Still switch and Reduce motion). */
function Fx({ effect, level, max }: { effect: Effect; level: number; max: number }) {
  const corner = (Icon: LucideIcon, anim: string, color: string, style: CSSProperties = {}) => (
    <span className="tc-fx tc-fx-corner" style={{ '--fx': color, ...style } as CSSProperties}>
      <Icon className={anim} />
    </span>
  )
  const aura = (color: string, anim = 'tc-anim-breathe') => <span className={`tc-fx tc-fx-aura ${anim}`} style={{ '--fx': color } as CSSProperties} />
  switch (effect) {
    case 'power':
      return (
        <>
          {aura('#f2b84b')}
          {corner(Zap, 'tc-anim-flicker', '#f2b84b')}
        </>
      )
    case 'fan':
      return corner(Fan, 'tc-anim-spin', '#8fc3e6', { '--spin': `${(3 / Math.max(1, level)).toFixed(2)}s` } as CSSProperties)
    case 'heat':
      return (
        <>
          {aura('#ff8a3d', 'tc-anim-flicker')}
          {corner(Flame, 'tc-anim-flicker', '#ff8a3d')}
        </>
      )
    case 'water':
      return (
        <>
          <span className="tc-fx tc-fx-drip" style={{ '--fx': '#5fb4ff' } as CSSProperties} />
          <span className="tc-fx tc-fx-drip tc-fx-late" style={{ '--fx': '#5fb4ff' } as CSSProperties} />
        </>
      )
    case 'btc':
      return (
        <span className="tc-fx tc-fx-leds">
          {Array.from({ length: Math.max(3, max) }, (_, i) => (
            <i key={i} className={i < level ? 'on' : ''} />
          ))}
        </span>
      )
    case 'booze':
    case 'food':
      return (
        <span className={`tc-fx tc-fx-bubbles ${effect === 'food' ? 'tc-fx-steam' : ''}`} style={{ '--fx': effect === 'food' ? '#d9d4c7' : '#d7b56d' } as CSSProperties}>
          <i />
          <i />
          <i />
        </span>
      )
    case 'scan':
      return <span className="tc-fx tc-fx-scan" style={{ '--fx': '#3fc1c9' } as CSSProperties} />
    case 'ritual':
      return aura('#e0453a', 'tc-anim-breathe tc-slow')
    case 'med':
      return corner(HeartPulse, 'tc-anim-beat', '#ff6b6b')
    case 'cam':
      return <span className="tc-fx tc-fx-rec" />
    case 'light':
      return aura('#ffd27a', level < max ? 'tc-anim-flicker' : 'tc-anim-breathe tc-slow')
    case 'sun':
      return corner(Sun, 'tc-anim-spin tc-slow', '#ffc94d')
    case 'rest':
      return corner(Monitor, 'tc-anim-flicker', '#9db8ff')
    case 'tools':
      return corner(Wrench, 'tc-anim-wiggle', '#c7a66b')
    case 'range':
      return corner(Crosshair, 'tc-anim-pulse', '#ff6b5b')
    case 'gym':
      return corner(Dumbbell, 'tc-anim-bob', '#9ad07a')
    case 'trophy':
      return (
        <>
          <span className="tc-fx tc-fx-shine" />
          {corner(Trophy, '', '#ffd34d')}
        </>
      )
    default:
      return null
  }
}

interface Link {
  key: string
  d: string
  end: [number, number]
  kind: 'met' | 'unmet' | 'unlock'
}

const LINK_COLOR: Record<Link['kind'], string> = { met: 'var(--color-success)', unmet: 'var(--color-danger)', unlock: 'var(--color-accent)' }

/** Lines from what a station needs to it, and from it to what it opens. Measured from the tiles on screen. */
function LinkLayer({ sceneRef, focus, infos }: { sceneRef: RefObject<HTMLDivElement | null>; focus: string | null; infos: Map<string, StationInfo> }) {
  const [links, setLinks] = useState<{ focus: string; list: Link[] } | null>(null)
  useEffect(() => {
    const scene = sceneRef.current
    const info = focus ? infos.get(focus) : undefined
    if (!scene || !info) return
    const measure = () => {
      const box = scene.getBoundingClientRect()
      const at = (id: string) => {
        const el = scene.querySelector<HTMLElement>(`[data-station="${CSS.escape(id)}"] .tc-badge`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, r: r.width / 2 }
      }
      const me = at(info.station.id)
      const list: Link[] = []
      if (me) {
        for (const req of info.next?.stationLevelRequirements ?? []) {
          const from = at(req.stationId)
          if (from) list.push({ key: `in-${req.stationId}`, ...curve(from, me), kind: info.blockedBy.some((b) => b.stationId === req.stationId) ? 'unmet' : 'met' })
        }
        const seen = new Set<string>()
        for (const u of info.unlocks) {
          if (seen.has(u.stationId)) continue
          seen.add(u.stationId)
          const to = at(u.stationId)
          if (to) list.push({ key: `out-${u.stationId}`, ...curve(me, to), kind: 'unlock' })
        }
      }
      setLinks({ focus: info.station.id, list })
    }
    // Fires once right away (before paint) and again whenever the bunker changes size.
    const ro = new ResizeObserver(measure)
    ro.observe(scene)
    return () => ro.disconnect()
  }, [sceneRef, focus, infos])
  if (!focus || links?.focus !== focus) return null
  return (
    <svg className="tc-links" aria-hidden>
      {links.list.map((l) => (
        <g key={l.key} style={{ color: LINK_COLOR[l.kind] }}>
          {l.kind !== 'unlock' && <path d={l.d} className="tc-link-base" />}
          <path d={l.d} className={`tc-link-flow ${l.kind === 'unlock' ? 'is-out' : ''}`} />
        </g>
      ))}
    </svg>
  )
}

/** A gentle arc between two badges, stopping at their rims. */
function curve(a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }): { d: string; end: [number, number] } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const x1 = a.x + ux * (a.r + 4)
  const y1 = a.y + uy * (a.r + 4)
  const x2 = b.x - ux * (b.r + 6)
  const y2 = b.y - uy * (b.r + 6)
  const bend = Math.min(70, len * 0.22)
  const mx = (x1 + x2) / 2 + uy * bend
  const my = (y1 + y2) / 2 - ux * bend
  const f = (n: number) => Math.round(n * 10) / 10
  return { d: `M${f(x1)},${f(y1)} Q${f(mx)},${f(my)} ${f(x2)},${f(y2)}`, end: [f(x2), f(y2)] }
}
