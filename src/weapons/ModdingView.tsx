/**
 * Weapon builder "Modding view": looks like the game's weapon modding screen.
 * The focused item (the weapon, or a part you chose to modify) is in the middle,
 * its slots are square tiles around it with thin lines to the picture, and
 * clicking a tile opens a picture grid of the parts that fit. Edits go through
 * the same `onChoose` (setPart) as the List view, so both views share one build.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Crosshair, Search, Wrench, X } from 'lucide-react'
import type { Item, ItemsById, ModSlot } from '../api/types'
import { acquireCost } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import {
  arrangeSlots,
  formatErgo,
  formatPercent,
  getNode,
  matchingPreset,
  missingRequired,
  partOptions,
  slotLabels,
  slotsOf,
  type BuildNode,
  type BuildParts,
  type PartSort,
  type SlotPath,
  type SlotSide,
} from '../lib/weaponBuild'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Below this width (px) of the view, tiles go in a plain grid under the picture. */
const WIDE_MIN = 640

const fieldClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'

function picture(item: Item | undefined, large: boolean): string | null {
  if (!item) return null
  return (large ? item.image512Link : undefined) ?? item.gridImageLink ?? item.iconLink ?? null
}

function tone(n: number, goodWhenNegative: boolean): string {
  if (n === 0) return 'text-ink-dim'
  return (n < 0) === goodWhenNegative ? 'text-success' : 'text-danger'
}

function ergoText(n: number): string {
  return `${n > 0 ? '+' : ''}${formatErgo(n)} ergo`
}

/** "+3 ergo, -5% recoil, 0.12 kg, 12,000 ₽" for tooltips. */
function statText(item: Item): string {
  const m = item.mod
  const price = acquireCost(item)
  const bits = m ? [ergoText(m.ergonomics), `${formatPercent(m.recoilModifier)} recoil`, `${m.weight.toFixed(2)} kg`] : []
  bits.push(price == null ? 'no price' : formatRoubles(price))
  return bits.join(', ')
}

function ModStatLine({ item, className = '' }: { item: Item; className?: string }) {
  const m = item.mod
  if (!m) return null
  return (
    <span className={`tabular-nums ${className}`}>
      <span className={tone(m.ergonomics, false)}>{ergoText(m.ergonomics)}</span>
      <span className="text-ink-dim"> · </span>
      <span className={tone(m.recoilModifier, true)}>{formatPercent(m.recoilModifier)}</span>
    </span>
  )
}

function Picture({ src, className }: { src: string | null; className: string }) {
  if (src) return <img src={src} alt="" className={`${className} object-contain`} loading="lazy" draggable={false} />
  return <Crosshair className={`${className} p-2 text-ink-dim`} aria-hidden />
}

interface Line {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  filled: boolean
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function ModdingView({
  weapon,
  items,
  parts,
  installed,
  onChoose,
}: {
  weapon: Item
  items: ItemsById
  parts: BuildParts
  /** Weapon id + every installed part id (for conflict checks). */
  installed: string[]
  onChoose: (path: SlotPath, itemId: string | null) => void
}) {
  const [focusPath, setFocusPath] = useState<SlotPath>([])
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)

  // The focused part may have been removed or the build replaced: go up to what still exists.
  const path = useMemo(() => {
    const p = [...focusPath]
    while (p.length && !getNode(parts, p)) p.pop()
    return p
  }, [focusPath, parts])
  const pathKey = path.join('/')

  const focusNode = path.length ? getNode(parts, path) : undefined
  const focusItem = focusNode ? items[focusNode.itemId] : weapon
  const level: BuildParts = focusNode ? focusNode.slots : parts
  const slots = useMemo(() => slotsOf(focusItem), [focusItem])
  const labels = useMemo(() => slotLabels(slots), [slots])
  const sides = useMemo(() => arrangeSlots(slots), [slots])

  const preset = useMemo(() => (path.length ? null : matchingPreset(weapon, parts, items)), [path.length, weapon, parts, items])
  const centreSrc = picture(preset ?? focusItem, true)

  // Paths (joined) of empty required slots anywhere in the build.
  const missing = useMemo(() => missingRequired(weapon, parts, items).map((f) => f.path.join('/')), [weapon, parts, items])

  // Breadcrumb: the weapon, then each part down to the focus.
  const crumbs = useMemo(() => {
    const out: { path: SlotPath; item: Item | undefined }[] = [{ path: [], item: weapon }]
    for (let i = 1; i <= path.length; i++) {
      const node = getNode(parts, path.slice(0, i))
      out.push({ path: path.slice(0, i), item: node ? items[node.itemId] : undefined })
    }
    return out
  }, [path, parts, items, weapon])

  const goTo = (p: SlotPath) => {
    setFocusPath(p)
    setPickerSlot(null)
  }

  // --- Layout measurement (wide/narrow and connector lines) ---------------
  const wrapRef = useRef<HTMLDivElement>(null)
  const centreRef = useRef<HTMLDivElement>(null)
  const tileRefs = useRef(new Map<string, HTMLElement>())
  const [wide, setWide] = useState(false)
  const [lines, setLines] = useState<Line[]>([])

  const measure = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const isWide = wrap.clientWidth >= WIDE_MIN
    setWide(isWide)
    const centre = centreRef.current
    if (!isWide || !centre) {
      setLines([])
      return
    }
    const base = wrap.getBoundingClientRect()
    const c = centre.getBoundingClientRect()
    const cl = c.left - base.left
    const ct = c.top - base.top
    const cr = cl + c.width
    const cb = ct + c.height
    const next: Line[] = []
    for (const [key, el] of tileRefs.current) {
      const r = el.getBoundingClientRect()
      const x1 = r.left - base.left + r.width / 2
      const y1 = r.top - base.top + r.height / 2
      // Nearest point of the picture box: straight lines for tiles beside it.
      const x2 = Math.min(Math.max(x1, cl + 12), cr - 12)
      const y2 = Math.min(Math.max(y1, ct + 12), cb - 12)
      next.push({ key, x1, y1, x2, y2, filled: el.dataset.filled === '1' })
    }
    setLines(next)
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, pathKey, slots, wide, level])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [measure])

  const tileRef = (key: string) => (el: HTMLElement | null) => {
    if (el) tileRefs.current.set(key, el)
    else tileRefs.current.delete(key)
  }

  // --- Tiles -------------------------------------------------------------
  const renderTile = (slot: ModSlot) => {
    const node = level[slot.id]
    const item = node ? items[node.itemId] : undefined
    const slotPath = [...path, slot.id]
    const key = slotPath.join('/')
    const warnBelow = missing.some((m) => m.startsWith(`${key}/`))
    return (
      <SlotTile
        key={key}
        tileRef={tileRef(key)}
        label={labels[slot.id]}
        item={item}
        required={slot.required}
        warnBelow={warnBelow}
        selected={pickerSlot === slot.id}
        onOpen={() => setPickerSlot(pickerSlot === slot.id ? null : slot.id)}
        onModify={item && slotsOf(item).length ? () => goTo(slotPath) : undefined}
      />
    )
  }

  const pickerSlotObj = pickerSlot ? slots.find((s) => s.id === pickerSlot) : undefined

  const centre = (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <div ref={centreRef} className="flex h-44 w-full max-w-[30rem] items-center justify-center rounded-lg border border-line bg-surface p-2 sm:h-56">
        <Picture src={centreSrc} className="h-full w-full" />
      </div>
      <div className="min-w-0 max-w-full">
        <p className="truncate text-sm font-semibold" title={focusItem?.name}>{focusItem?.name ?? 'Unknown part'}</p>
        {preset && <p className="truncate text-xs text-ink-dim">Same parts as the ready-made build "{preset.name}"</p>}
        {focusItem?.mod && <ModStatLine item={focusItem} className="text-xs" />}
        {path.length > 0 && (
          <button type="button" onClick={() => goTo(path.slice(0, -1))} className="mt-1 block w-full text-xs text-ink-muted hover:text-accent">
            Back to {crumbs[crumbs.length - 2]?.item?.shortName ?? 'the weapon'}
          </button>
        )}
        {slots.length === 0 && <p className="text-xs text-ink-muted">This part has no slots.</p>}
      </div>
    </div>
  )

  return (
    <div className="p-3">
      {/* Breadcrumb */}
      <nav aria-label="Modding path" className="flex flex-wrap items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          const slotId = c.path[c.path.length - 1]
          const owner = i > 0 ? crumbs[i - 1].item : undefined
          const slotName = slotId && owner ? slotLabels(slotsOf(owner))[slotId] : undefined
          return (
            <span key={c.path.join('/') || 'root'} className="inline-flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />}
              <button
                type="button"
                onClick={() => goTo(c.path)}
                disabled={last}
                title={slotName ? `${slotName}: ${c.item?.name ?? ''}` : c.item?.name}
                className={`max-w-[12rem] truncate rounded px-1.5 py-0.5 ${last ? 'bg-surface-3 font-semibold text-ink' : 'text-ink-muted hover:text-accent'}`}
              >
                {slotName ?? c.item?.shortName ?? '?'}
              </button>
            </span>
          )
        })}
      </nav>
      <p className="mt-1 text-xs text-ink-dim">
        Click a square to choose the part for that slot. Use "Modify" on a fitted part to work on the parts that go on it.
      </p>

      <div ref={wrapRef} className="relative mt-3 min-h-[30rem] overflow-hidden">
        {wide ? (
          <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {lines.map((l) => (
                <g key={l.key}>
                  <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.filled ? 'var(--color-accent-dim)' : 'var(--color-line)'} strokeWidth={1.5} />
                  <circle cx={l.x2} cy={l.y2} r={2.5} fill={l.filled ? 'var(--color-accent-dim)' : 'var(--color-line)'} />
                </g>
              ))}
            </svg>
            <div
              className="relative grid items-center gap-x-10 gap-y-8 py-2"
              style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto', gridTemplateAreas: '"top top top" "left centre right" "bottom bottom bottom"' }}
            >
              {(['top', 'left', 'right', 'bottom'] as SlotSide[]).map((side) => (
                <div
                  key={side}
                  style={{ gridArea: side }}
                  className={side === 'left' || side === 'right' ? 'flex flex-col justify-center gap-4' : 'flex flex-wrap justify-center gap-4'}
                >
                  {sides[side].map(renderTile)}
                </div>
              ))}
              <div style={{ gridArea: 'centre' }}>{centre}</div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {centre}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] justify-items-center gap-3">{slots.map(renderTile)}</div>
          </div>
        )}

        {pickerSlotObj && (
          <PartGridPicker
            key={`${pathKey}/${pickerSlotObj.id}`}
            slot={pickerSlotObj}
            label={labels[pickerSlotObj.id]}
            node={level[pickerSlotObj.id]}
            installed={installed}
            items={items}
            onChoose={(id) => {
              onChoose([...path, pickerSlotObj.id], id)
              setPickerSlot(null)
            }}
            onClose={() => setPickerSlot(null)}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One slot tile
// ---------------------------------------------------------------------------

function SlotTile({
  tileRef,
  label,
  item,
  required,
  warnBelow,
  selected,
  onOpen,
  onModify,
}: {
  tileRef: (el: HTMLElement | null) => void
  label: string
  item: Item | undefined
  required: boolean
  warnBelow: boolean
  selected: boolean
  onOpen: () => void
  onModify?: () => void
}) {
  const empty = !item
  const border = selected ? 'border-accent' : required && empty ? 'border-danger' : warnBelow ? 'border-danger/60' : 'border-line'
  const hint = item
    ? `${label}: ${item.name}\n${statText(item)}${warnBelow ? '\nA required slot on this part is empty' : ''}`
    : `${label}: empty${required ? ' (required: the weapon will not work without it)' : ''}`
  return (
    <div className="relative z-10 flex w-[5.5rem] flex-col items-stretch gap-1">
      <button
        ref={tileRef}
        type="button"
        data-filled={item ? '1' : '0'}
        onClick={onOpen}
        title={hint}
        aria-label={item ? `${label}: ${item.name}. Change part` : `${label}: empty. Choose a part`}
        aria-expanded={selected}
        className={`group flex h-[5.5rem] w-[5.5rem] flex-col overflow-hidden rounded border-2 bg-surface-3 text-left hover:border-accent ${border}`}
      >
        <span className={`truncate px-1 pt-0.5 text-[9px] font-semibold uppercase tracking-wider ${required && empty ? 'text-danger' : 'text-ink-muted'}`}>
          {label}
        </span>
        <span className="flex min-h-0 flex-1 items-center justify-center px-1">
          {item ? <Picture src={picture(item, false)} className="max-h-full max-w-full" /> : <span className="text-lg text-ink-dim">+</span>}
        </span>
        <span className="truncate bg-surface/70 px-1 py-0.5 text-[10px] leading-tight">
          {item ? (
            <>
              <span className="group-hover:hidden">{item.shortName}</span>
              <ModStatLine item={item} className="hidden group-hover:inline" />
            </>
          ) : (
            <span className={required ? 'text-danger' : 'text-ink-dim'}>{required ? 'Required' : 'Empty'}</span>
          )}
        </span>
      </button>
      {onModify && (
        <button
          type="button"
          onClick={onModify}
          title={`Work on the parts that go on ${item?.name ?? 'this part'}`}
          className={`inline-flex items-center justify-center gap-1 rounded border bg-surface-2 px-1 py-0.5 text-[10px] hover:border-accent hover:text-accent ${warnBelow ? 'border-danger/60 text-danger' : 'border-line text-ink-muted'}`}
        >
          <Wrench className="h-3 w-3" aria-hidden /> Modify
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Picture-grid part picker
// ---------------------------------------------------------------------------

function PartGridPicker({
  slot,
  label,
  node,
  installed,
  items,
  onChoose,
  onClose,
}: {
  slot: ModSlot
  label: string
  node: BuildNode | undefined
  installed: string[]
  items: ItemsById
  onChoose: (itemId: string | null) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<PartSort>('name')
  const rows = useMemo(
    () => partOptions(slot, node, installed, items, acquireCost, search, sort),
    [slot, node, installed, items, search, sort],
  )
  const current = node ? items[node.itemId] : undefined

  return (
    <div
      role="dialog"
      aria-label={`Choose a part: ${label}`}
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[28rem]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
          <p className="truncate text-sm" title={current?.name}>{current ? current.name : 'Empty slot'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-dim hover:text-accent">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts…"
            aria-label="Search parts"
            autoFocus
            className={`${fieldClass} w-full pl-8`}
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as PartSort)} aria-label="Sort parts" className={fieldClass}>
          <option value="name">By name</option>
          <option value="ergonomics">Best ergonomics</option>
          <option value="recoil">Least recoil</option>
          <option value="price">Cheapest</option>
        </select>
        {node && (
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="inline-flex items-center gap-1 rounded border border-line bg-surface-3 px-2 py-1.5 text-sm hover:border-danger hover:text-danger"
          >
            <X className="h-4 w-4" aria-hidden /> Remove part
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No parts match.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.25rem,1fr))] gap-2">
            {rows.map(({ item, price, conflict }) => {
              const isCurrent = node?.itemId === item.id
              const extra = item.mod?.slots.length ?? 0
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={conflict != null}
                    onClick={() => onChoose(item.id)}
                    title={`${item.name}\n${statText(item)}${extra ? `\n${extra} more slot${extra === 1 ? '' : 's'}` : ''}${conflict ? `\nCannot be used together with ${conflict.name}` : ''}`}
                    className={`flex h-full w-full flex-col overflow-hidden rounded border bg-surface-3 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line ${isCurrent ? 'border-accent' : 'border-line'}`}
                  >
                    <span className="flex h-16 items-center justify-center bg-surface-2 p-1">
                      <Picture src={picture(item, false)} className="max-h-full max-w-full" />
                    </span>
                    <span className="flex flex-col gap-0.5 px-1.5 py-1 text-[11px] leading-tight">
                      <span className="truncate font-medium">{item.shortName}</span>
                      <ModStatLine item={item} />
                      <span className="tabular-nums text-ink-muted">{price == null ? 'no price' : formatRoubles(price)}</span>
                      {conflict && <span className="truncate text-danger">Clashes with {conflict.shortName}</span>}
                      {isCurrent && <span className="text-accent">Fitted now</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
