/**
 * Weapon builder "Modding view", all on one page: the gun's picture, then every slot of the
 * build as square tiles, grouped by the part they belong to (the weapon's own slots first, each
 * fitted part's slots right under it). Clicking a tile opens a picture grid of the parts that
 * fit. Edits go through the same `onChoose` (setPart) as the List view, so both share one build.
 */
import { useMemo, useState } from 'react'
import { Crosshair, Search, X } from 'lucide-react'
import type { Item, ItemsById, ModSlot } from '../api/types'
import { acquireCost } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import {
  closestPreset,
  formatErgo,
  formatPercent,
  matchingPreset,
  missingRequired,
  partOptions,
  slotLabels,
  slotsOf,
  type BuildNode,
  type BuildParts,
  type PartSort,
  type SlotPath,
} from '../lib/weaponBuild'
import { gunLayers, layersBounds, type Layer } from './gunComposite'

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** localStorage: show the experimental parts layout instead of real pictures. */
const LAYOUT_KEY = 'tc-gun-layout'

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

/**
 * A modded gun drawn from its parts' pictures (see gunComposite.ts), fitted into the frame.
 * Positions are percentages of the combined box, so it scales with the frame.
 */
function GunPicture({ layers, className }: { layers: Layer[]; className: string }) {
  const b = layersBounds(layers)
  return (
    <div className={`${className} flex items-center justify-center`}>
      <div className="relative w-full" style={{ aspectRatio: `${b.w} / ${b.h}`, maxHeight: '100%', maxWidth: `calc(100% * ${b.w / b.h})` }}>
        {layers.map((l) => (
          <img
            key={l.id}
            src={l.src}
            alt=""
            draggable={false}
            loading="lazy"
            className="pointer-events-none absolute object-contain"
            style={{ left: `${((l.x - b.x) / b.w) * 100}%`, top: `${((l.y - b.y) / b.h) * 100}%`, width: `${(l.w / b.w) * 100}%`, height: `${(l.h / b.h) * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
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
  /** Path of the slot whose part picker is open (slot ids from the weapon down). */
  const [picker, setPicker] = useState<SlotPath | null>(null)

  const preset = useMemo(() => matchingPreset(weapon, parts, items), [weapon, parts, items])
  // No preset with exactly these parts: the real picture of the most similar ready-made build
  // (a rendered gun looks right; the parts layout is a rough sketch and opt-in).
  const closest = useMemo(() => (preset || !Object.keys(parts).length ? null : closestPreset(weapon, parts, items)), [preset, weapon, parts, items])
  const [layoutOn, setLayoutOn] = useState(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleLayout = () =>
    setLayoutOn((on) => {
      try {
        localStorage.setItem(LAYOUT_KEY, on ? '0' : '1')
      } catch {
        // per-viewer convenience only
      }
      return !on
    })
  const layers = useMemo(() => {
    if (!layoutOn || preset) return null
    const l = gunLayers(weapon, parts, items)
    return l && l.length > 1 ? l : null
  }, [layoutOn, preset, weapon, parts, items])
  const canLayout = !preset && Object.keys(parts).length > 0
  const centreSrc = picture(preset ?? closest?.preset ?? weapon, true)

  // Paths (joined) of empty required slots anywhere in the build.
  const missing = useMemo(() => missingRequired(weapon, parts, items).map((f) => f.path.join('/')), [weapon, parts, items])

  // Every part that has slots, on one page: the weapon first, then each fitted part (depth-first,
  // so a part's own slots follow right after the slot it sits in).
  const groups = useMemo(() => {
    const out: { path: SlotPath; owner: Item; slots: ModSlot[]; labels: Record<string, string>; level: BuildParts; depth: number; via: string | null }[] = []
    const walk = (owner: Item, path: SlotPath, level: BuildParts, depth: number, via: string | null) => {
      const slots = slotsOf(owner)
      if (!slots.length || depth > 8) return
      const labels = slotLabels(slots)
      out.push({ path, owner, slots, labels, level, depth, via })
      for (const s of slots) {
        const node = level[s.id]
        const it = node ? items[node.itemId] : undefined
        if (node && it) walk(it, [...path, s.id], node.slots, depth + 1, labels[s.id])
      }
    }
    walk(weapon, [], parts, 0, null)
    return out
  }, [weapon, parts, items])

  const pickerKey = picker?.join('/') ?? null
  const pickerGroup = picker ? groups.find((g) => g.path.join('/') === picker.slice(0, -1).join('/')) : undefined
  const pickerSlotObj = picker && pickerGroup ? pickerGroup.slots.find((s) => s.id === picker[picker.length - 1]) : undefined

  const renderTile = (g: (typeof groups)[number], slot: ModSlot) => {
    const node = g.level[slot.id]
    const item = node ? items[node.itemId] : undefined
    const slotPath = [...g.path, slot.id]
    const key = slotPath.join('/')
    return (
      <SlotTile
        key={key}
        label={g.labels[slot.id]}
        item={item}
        required={slot.required}
        warnBelow={missing.some((m) => m.startsWith(`${key}/`))}
        selected={pickerKey === key}
        onOpen={() => setPicker(pickerKey === key ? null : slotPath)}
      />
    )
  }

  return (
    <div className="p-3">
      <p className="text-xs text-ink-dim">Every slot of the gun is on this page: the weapon's own slots first, then the slots of each fitted part, right under it. Click a square to choose the part for that slot.</p>

      <div className="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center lg:sticky lg:top-3">
          <div className="flex h-44 w-full items-center justify-center rounded-lg border border-line bg-surface p-2 sm:h-56">
            {layers ? <GunPicture layers={layers} className="h-full w-full" /> : <Picture src={centreSrc} className="h-full w-full" />}
          </div>
          <div className="min-w-0 max-w-full">
            <p className="truncate text-sm font-semibold" title={weapon.name}>{weapon.name}</p>
            {preset && <p className="truncate text-xs text-ink-dim">Same parts as the ready-made build "{preset.name}"</p>}
            {layers && <p className="truncate text-xs text-ink-dim">Rough layout from the parts' pictures (experimental)</p>}
            {!layers && closest && (
              <div className="text-xs text-ink-dim">
                <p className="truncate">Picture of the closest ready-made build "{closest.preset.name}"</p>
                {(closest.added.length > 0 || closest.removed.length > 0) && (
                  <p className="truncate" title={[...closest.added.map((i) => `+ ${i.name}`), ...closest.removed.map((i) => `− ${i.name}`)].join('\n')}>
                    Yours differs: {[...closest.added.slice(0, 3).map((i) => `+ ${i.shortName}`), ...closest.removed.slice(0, 3).map((i) => `− ${i.shortName}`)].join(', ')}
                    {closest.added.length + closest.removed.length > 6 ? ' …' : ''}
                  </p>
                )}
              </div>
            )}
            {canLayout && (
              <button type="button" onClick={toggleLayout} className="mt-0.5 block w-full text-xs text-ink-muted underline hover:text-accent">
                {layers ? 'Show the ready-made picture' : 'Try the parts layout (experimental)'}
              </button>
            )}
            {(preset ?? weapon).pictureOf && <p className="text-xs text-ink-dim">Picture of the standard version: tarkov.dev has no picture of this one yet.</p>}
            {!centreSrc && <p className="text-xs text-ink-dim">tarkov.dev has no picture of this item yet.</p>}
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {groups.map((g) => (
            <section key={g.path.join('/') || 'weapon'} className={g.depth ? 'border-l-2 border-line pl-3' : ''} style={{ marginLeft: `${Math.min(g.depth, 4) * 0.75}rem` }}>
              <h3 className="mb-1.5 flex min-w-0 items-baseline gap-1.5 text-xs">
                {g.via && <span className="shrink-0 font-semibold uppercase tracking-wide text-ink-muted">{g.via}:</span>}
                <span className="truncate font-semibold" title={g.owner.name}>{g.depth ? g.owner.shortName : g.owner.name}</span>
                {g.owner.mod && <ModStatLine item={g.owner} className="shrink-0 text-[11px]" />}
              </h3>
              <div className="flex flex-wrap gap-2.5">{g.slots.map((s) => renderTile(g, s))}</div>
            </section>
          ))}
          {groups.length === 0 && <p className="text-xs text-ink-muted">This weapon has no slots.</p>}
        </div>
      </div>

      {pickerSlotObj && pickerGroup && picker && (
        <PartGridPicker
          key={pickerKey}
          slot={pickerSlotObj}
          label={pickerGroup.labels[pickerSlotObj.id]}
          node={pickerGroup.level[pickerSlotObj.id]}
          installed={installed}
          items={items}
          onChoose={(id) => {
            onChoose(picker, id)
            setPicker(null)
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One slot tile
// ---------------------------------------------------------------------------

function SlotTile({
  label,
  item,
  required,
  warnBelow,
  selected,
  onOpen,
}: {
  label: string
  item: Item | undefined
  required: boolean
  warnBelow: boolean
  selected: boolean
  onOpen: () => void
}) {
  const empty = !item
  const border = selected ? 'border-accent' : required && empty ? 'border-danger' : warnBelow ? 'border-danger/60' : 'border-line'
  const hint = item
    ? `${label}: ${item.name}\n${statText(item)}${warnBelow ? '\nA required slot on this part is empty' : ''}`
    : `${label}: empty${required ? ' (required: the weapon will not work without it)' : ''}`
  return (
    <div className="relative z-10 flex w-[5.5rem] flex-col items-stretch gap-1">
      <button
        type="button"
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
  const [sort, setSort] = useState<PartSort>('best')
  const rows = useMemo(
    () => partOptions(slot, node, installed, items, acquireCost, search, sort),
    [slot, node, installed, items, search, sort],
  )
  const current = node ? items[node.itemId] : undefined

  return (
    <div
      role="dialog"
      aria-label={`Choose a part: ${label}`}
      className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[28rem]"
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
          <option value="best">Best first</option>
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
