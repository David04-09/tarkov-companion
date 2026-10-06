import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Eraser,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useItems } from '../api/hooks'
import type { Item, ItemsById } from '../api/types'
import { ErrorPanel, LoadingPanel } from '../components/DataState'
import { caliberLabel, groupCalibers } from '../lib/ammo'
import { acquireCost } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import {
  buildAsText,
  buildConflicts,
  buildTotals,
  findConflict,
  flattenBuild,
  formatErgo,
  formatPercent,
  installedIds,
  presetToBuild,
  setPart,
  slotCandidates,
  weaponPresets,
  type BuildParts,
  type FlatSlot,
} from '../lib/weaponBuild'
import { useProgressStore } from '../store/progress'
import { useWeaponBuildsStore, type SavedBuild } from '../store/weaponBuilds'

const selectClass =
  'rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none'
const buttonClass =
  'inline-flex items-center gap-1.5 rounded border border-line bg-surface-3 px-2.5 py-1.5 text-sm hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'

type WeaponItem = Item & { weapon: NonNullable<Item['weapon']> }

function ItemIcon({ item, size = 'h-8 w-8' }: { item: Item | undefined; size?: string }) {
  if (item?.iconLink) return <img src={item.iconLink} alt="" className={`${size} shrink-0 object-contain`} loading="lazy" />
  return <Crosshair className={`${size} shrink-0 p-1 text-ink-dim`} aria-hidden />
}

function signed(n: number): string {
  const v = formatErgo(n)
  return n > 0 ? `+${v}` : v
}

function toneFor(n: number, goodWhenNegative: boolean): string {
  if (n === 0) return 'text-ink-dim'
  return (n < 0) === goodWhenNegative ? 'text-success' : 'text-danger'
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function WeaponsPage() {
  const items = useItems()
  const [selected, setSelected] = useState<{ weaponId: string; buildId: string | null } | null>(null)

  if (items.isPending) return <LoadingPanel label="weapons" />
  if (items.isError && !items.data) return <ErrorPanel error={items.error} onRetry={() => void items.refetch()} />

  const all = items.data.items
  const weapon = selected ? all[selected.weaponId] : undefined
  if (selected && weapon?.weapon) {
    return (
      <Builder
        key={`${selected.weaponId}:${selected.buildId ?? ''}`}
        weapon={weapon as WeaponItem}
        items={all}
        initialBuildId={selected.buildId}
        onBack={() => setSelected(null)}
      />
    )
  }
  return (
    <WeaponList
      items={all}
      categoryNames={items.data.categoryNames}
      onOpen={(weaponId, buildId = null) => setSelected({ weaponId, buildId })}
    />
  )
}

// ---------------------------------------------------------------------------
// Weapon list
// ---------------------------------------------------------------------------

type ListSort = 'name' | 'ergonomics' | 'recoil' | 'fireRate' | 'price'

function WeaponList({
  items,
  categoryNames,
  onOpen,
}: {
  items: ItemsById
  categoryNames: Record<string, string>
  onOpen: (weaponId: string, buildId?: string | null) => void
}) {
  const gameMode = useProgressStore((s) => s.gameMode)
  const savedBuilds = useWeaponBuildsStore((s) => s.builds)
  const [search, setSearch] = useState('')
  const [caliber, setCaliber] = useState('all')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<ListSort>('name')

  const weapons = useMemo(
    () =>
      Object.values(items)
        // Flares and one-shot launchers have no slots: nothing to build.
        .filter((it): it is WeaponItem => it.weapon != null && it.weapon.slots.length > 0)
        .map((item) => ({ item, category: categoryNames[item.categories[0]] ?? 'Other', price: acquireCost(item) })),
    [items, categoryNames],
  )
  const caliberGroups = useMemo(() => groupCalibers(weapons.map((w) => w.item.weapon.caliber).filter(Boolean)), [weapons])
  const categories = useMemo(() => [...new Set(weapons.map((w) => w.category))].sort(), [weapons])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = weapons.filter((w) => {
      if (caliber !== 'all' && w.item.weapon.caliber !== caliber) return false
      if (category !== 'all' && w.category !== category) return false
      if (needle && !w.item.name.toLowerCase().includes(needle) && !w.item.shortName.toLowerCase().includes(needle)) return false
      return true
    })
    const by: Record<ListSort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      name: (a, b) => a.item.name.localeCompare(b.item.name),
      ergonomics: (a, b) => b.item.weapon.ergonomics - a.item.weapon.ergonomics,
      recoil: (a, b) => a.item.weapon.recoilVertical - b.item.weapon.recoilVertical,
      fireRate: (a, b) => b.item.weapon.fireRate - a.item.weapon.fireRate,
      price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    }
    return [...list].sort((a, b) => by[sort](a, b) || a.item.name.localeCompare(b.item.name))
  }, [weapons, search, caliber, category, sort])

  const saved = savedBuilds
    .filter((b) => items[b.weaponId]?.weapon)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div>
      <h1 className="text-2xl font-semibold">Weapon builder</h1>
      <p className="text-sm text-ink-muted">
        {weapons.length} weapons ({gameMode === 'pve' ? 'PvE' : 'PvP'} prices). Pick a weapon to put parts on it and see the ergonomics, recoil, weight and cost.
      </p>

      {saved.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <h2 className="text-sm font-semibold">Your saved builds</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {saved.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => onOpen(b.weaponId, b.id)} className={`${buttonClass} max-w-full`}>
                  <ItemIcon item={items[b.weaponId]} size="h-5 w-5" />
                  <span className="truncate">{b.name}</span>
                  <span className="truncate text-xs text-ink-dim">{items[b.weaponId]?.shortName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search weapons…" aria-label="Search weapons" className={`${selectClass} w-56 max-w-full pl-8`} />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Weapon type" className={selectClass}>
          <option value="all">All weapon types</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={caliber} onChange={(e) => setCaliber(e.target.value)} aria-label="Calibre" className={selectClass}>
          <option value="all">All calibres</option>
          {caliberGroups.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.calibers.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as ListSort)} aria-label="Sort by" className={selectClass}>
          <option value="name">Sort by name</option>
          <option value="ergonomics">Best ergonomics first</option>
          <option value="recoil">Lowest recoil first</option>
          <option value="fireRate">Fastest fire rate first</option>
          <option value="price">Cheapest first</option>
        </select>
        <span className="ml-auto text-xs text-ink-dim">{filtered.length} weapons</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface-2">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-2 py-2 font-medium">Weapon</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Calibre</th>
              <th className="px-2 py-2 text-right font-medium" title="Ergonomics of the bare weapon (higher is better)">Ergo</th>
              <th className="px-2 py-2 text-right font-medium" title="Vertical recoil of the bare weapon (lower is better)">Recoil ↕</th>
              <th className="px-2 py-2 text-right font-medium" title="Horizontal recoil of the bare weapon (lower is better)">Recoil ↔</th>
              <th className="px-2 py-2 text-right font-medium" title="Rounds per minute">Fire rate</th>
              <th className="px-2 py-2 text-right font-medium" title="Cheapest price of the bare weapon">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map(({ item, category: cat, price }) => (
              <tr key={item.id} className="cursor-pointer hover:bg-surface-3" onClick={() => onOpen(item.id)}>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(item.id) }} className="flex items-center gap-2 text-left hover:text-accent">
                    <ItemIcon item={item} size="h-7 w-12" />
                    <span>{item.name}</span>
                  </button>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{cat}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-ink-muted">{item.weapon.caliber ? caliberLabel(item.weapon.caliber) : '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{formatErgo(item.weapon.ergonomics)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.weapon.recoilVertical}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.weapon.recoilHorizontal}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.weapon.fireRate || '—'}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs tabular-nums">{price == null ? <span className="text-ink-dim">no price</span> : formatRoubles(price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-muted">No weapons match these filters.</p>}
      </div>
      <p className="mt-2 text-xs text-ink-dim">Stats from tarkov.dev. Base stats are for the bare weapon without any parts.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

function initialParts(weapon: WeaponItem, items: ItemsById, saved: SavedBuild | undefined): { parts: BuildParts; unplaced: Item[] } {
  if (saved) return { parts: saved.parts, unplaced: [] }
  const def = weapon.weapon.defaultPreset ? items[weapon.weapon.defaultPreset] : undefined
  return def?.preset ? presetToBuild(def, items) : { parts: {}, unplaced: [] }
}

function Builder({
  weapon,
  items,
  initialBuildId,
  onBack,
}: {
  weapon: WeaponItem
  items: ItemsById
  initialBuildId: string | null
  onBack: () => void
}) {
  const builds = useWeaponBuildsStore((s) => s.builds)
  const addBuild = useWeaponBuildsStore((s) => s.addBuild)
  const updateBuild = useWeaponBuildsStore((s) => s.updateBuild)
  const renameBuild = useWeaponBuildsStore((s) => s.renameBuild)
  const deleteBuild = useWeaponBuildsStore((s) => s.deleteBuild)

  const [activeId, setActiveId] = useState<string | null>(initialBuildId)
  const [start] = useState(() => initialParts(weapon, items, builds.find((b) => b.id === initialBuildId)))
  const [parts, setParts] = useState<BuildParts>(start.parts)
  const [unplaced, setUnplaced] = useState<Item[]>(start.unplaced)
  const [name, setName] = useState(() => builds.find((b) => b.id === initialBuildId)?.name ?? `My ${weapon.shortName}`)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const weaponBuilds = builds.filter((b) => b.weaponId === weapon.id)
  const active = weaponBuilds.find((b) => b.id === activeId)
  const presets = useMemo(() => weaponPresets(weapon, items), [weapon, items])

  const flat = useMemo(() => flattenBuild(weapon, parts, items), [weapon, parts, items])
  const totals = useMemo(() => buildTotals(weapon, parts, items, acquireCost), [weapon, parts, items])
  const conflicts = useMemo(() => buildConflicts(weapon, parts, items), [weapon, parts, items])
  const missing = flat.filter((f) => f.slot.required && !f.node)
  const installed = useMemo(() => [weapon.id, ...installedIds(parts)], [weapon.id, parts])
  const dirty = active ? JSON.stringify(active.parts) !== JSON.stringify(parts) || active.name !== name.trim() : countOf(parts) > 0

  const replace = (next: BuildParts, notPlaced: Item[] = []) => {
    setParts(next)
    setUnplaced(notPlaced)
    setOpenPath(null)
  }
  const loadPreset = (presetId: string) => {
    const p = items[presetId]
    if (!p) return
    const r = presetToBuild(p, items)
    replace(r.parts, r.unplaced)
  }
  const choose = (f: FlatSlot, itemId: string | null) => {
    setParts((prev) => setPart(prev, f.path, itemId, items))
    setOpenPath(null)
  }
  const save = () => {
    if (active) {
      updateBuild(active.id, parts)
      renameBuild(active.id, name)
    } else setActiveId(addBuild(weapon.id, name, parts))
  }
  const saveAsNew = () => setActiveId(addBuild(weapon.id, active && name.trim() === active.name ? `${name.trim()} (copy)` : name, parts))
  const loadSaved = (id: string) => {
    const b = weaponBuilds.find((x) => x.id === id)
    if (!b) {
      setActiveId(null)
      return
    }
    setActiveId(b.id)
    setName(b.name)
    replace(b.parts)
  }
  const remove = () => {
    if (!active || !window.confirm(`Delete the saved build "${active.name}"?`)) return
    deleteBuild(active.id)
    setActiveId(null)
  }
  const copy = async () => {
    const text = buildAsText(name.trim() || weapon.name, weapon, parts, items, totals, formatRoubles)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.alert('Could not copy to the clipboard.')
    }
  }

  const w = weapon.weapon
  const def = w.defaultPreset ? items[w.defaultPreset] : undefined

  return (
    <div>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All weapons
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ItemIcon item={weapon} size="h-12 w-24" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{weapon.name}</h1>
          <p className="text-sm text-ink-muted">
            {w.caliber ? caliberLabel(w.caliber) : 'No calibre'} · {w.fireRate ? `${w.fireRate} rounds/min` : 'single shots'} · bare weapon: ergonomics {formatErgo(w.ergonomics)}, recoil {w.recoilVertical} / {w.recoilHorizontal}
          </p>
        </div>
      </div>

      {/* Build actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {def?.preset && (
          <button type="button" className={buttonClass} onClick={() => loadPreset(def.id)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Load default build
          </button>
        )}
        {presets.length > 1 && (
          <select
            value=""
            onChange={(e) => e.target.value && loadPreset(e.target.value)}
            aria-label="Load a ready-made build"
            className={`${selectClass} max-w-full`}
          >
            <option value="">Load a ready-made build…</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.id === w.defaultPreset ? ' (default)' : ''}</option>
            ))}
          </select>
        )}
        <button type="button" className={buttonClass} onClick={() => replace({})} disabled={countOf(parts) === 0}>
          <Eraser className="h-4 w-4" aria-hidden /> Clear all
        </button>
        <button type="button" className={buttonClass} onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy as text'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 p-2">
        <select
          value={active?.id ?? ''}
          onChange={(e) => loadSaved(e.target.value)}
          aria-label="Saved builds for this weapon"
          className={`${selectClass} max-w-full`}
        >
          <option value="">{weaponBuilds.length ? 'New build (not saved)' : 'No saved builds yet'}</option>
          {weaponBuilds.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Build name"
          placeholder="Build name"
          className={`${selectClass} w-56 max-w-full`}
        />
        <button type="button" className={buttonClass} onClick={save} disabled={!name.trim() || (active != null && !dirty)}>
          <Save className="h-4 w-4" aria-hidden /> {active ? 'Save changes' : 'Save build'}
        </button>
        {active && (
          <>
            <button type="button" className={buttonClass} onClick={saveAsNew} disabled={!name.trim()}>
              Save as new
            </button>
            <button type="button" className={`${buttonClass} hover:border-danger hover:text-danger`} onClick={remove}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </button>
          </>
        )}
        <span className="text-xs text-ink-dim">
          {active ? (dirty ? 'Unsaved changes' : 'Saved') : 'Type a name and save to keep this build. Change the name and save to rename it.'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Slot tree */}
        <div className="min-w-0 rounded-lg border border-line bg-surface-2">
          <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Parts</h2>
          {flat.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">This weapon has no slots for parts.</p>
          ) : (
            <ul className="divide-y divide-line">
              {flat.map((f) => {
                const key = f.path.join('/')
                return (
                  <SlotRow
                    key={key}
                    flat={f}
                    items={items}
                    installed={installed}
                    open={openPath === key}
                    onToggle={() => setOpenPath(openPath === key ? null : key)}
                    onChoose={(id) => choose(f, id)}
                  />
                )
              })}
            </ul>
          )}
        </div>

        {/* Totals */}
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <h2 className="text-sm font-semibold">Totals</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Ergonomics" value={formatErgo(totals.ergonomics)} sub={signed(totals.ergonomics - w.ergonomics)} subTone={toneFor(totals.ergonomics - w.ergonomics, false)} hint="Higher is better" />
              <Stat label="Weight" value={`${totals.weight.toFixed(2)} kg`} sub={`${totals.partCount} parts`} />
              <Stat label="Vertical recoil" value={String(totals.recoilVertical)} sub={formatPercent(totals.recoilModifier)} subTone={toneFor(totals.recoilModifier, true)} hint="Lower is better" />
              <Stat label="Horizontal recoil" value={String(totals.recoilHorizontal)} sub={formatPercent(totals.recoilModifier)} subTone={toneFor(totals.recoilModifier, true)} hint="Lower is better" />
            </dl>
            <div className="mt-3 border-t border-line pt-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink-muted">Total cost</span>
                <span className="text-lg font-semibold tabular-nums">{formatRoubles(totals.cost)}</span>
              </div>
              <p className="text-xs text-ink-dim">Cheapest trader or flea price for the weapon and each part.</p>
              {totals.unpriced.length > 0 && (
                <p className="mt-1 text-xs text-accent">
                  Not counted (no trader or flea price, loot or barter only): {totals.unpriced.map((i) => i.shortName).join(', ')}
                </p>
              )}
            </div>
          </div>

          {(missing.length > 0 || conflicts.length > 0 || unplaced.length > 0) && (
            <div className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
              {missing.length > 0 && (
                <p className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  <span>
                    The weapon will not work without: {missing.map((m) => `${m.label}${m.depth > 0 ? ` (on ${m.owner.shortName})` : ''}`).join(', ')}.
                  </span>
                </p>
              )}
              {conflicts.map(([a, b]) => (
                <p key={`${a.id}/${b.id}`} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                  <span>{a.shortName} and {b.shortName} cannot be used together.</span>
                </p>
              ))}
              {unplaced.length > 0 && (
                <p className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  <span>These parts of the ready-made build could not be fitted: {unplaced.map((i) => i.shortName).join(', ')}.</span>
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <h2 className="text-sm font-semibold">Shopping list</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {[weapon, ...installedIds(parts).map((id) => items[id]).filter((it): it is Item => it != null)].map((it, i) => {
                const price = acquireCost(it)
                return (
                  <li key={`${it.id}-${i}`} className="flex items-center gap-2">
                    <ItemIcon item={it} size="h-5 w-5" />
                    <span className="min-w-0 flex-1 truncate" title={it.name}>{it.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted">{price == null ? 'no price' : formatRoubles(price)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </aside>
      </div>
      <p className="mt-2 text-xs text-ink-dim">
        Totals use the same maths as tarkov.dev (ergonomics add up, recoil changes add up as percentages). Skills, ammo and attachments' durability are not included.
      </p>
    </div>
  )
}

function countOf(parts: BuildParts): number {
  return installedIds(parts).length
}

function Stat({ label, value, sub, subTone = 'text-ink-dim', hint }: { label: string; value: string; sub?: string; subTone?: string; hint?: string }) {
  return (
    <div className="rounded border border-line bg-surface-3 px-2 py-1.5" title={hint}>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {sub && <span className={`text-xs tabular-nums ${subTone}`}>{sub}</span>}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One slot + its part picker
// ---------------------------------------------------------------------------

type PickerSort = 'name' | 'ergonomics' | 'recoil' | 'price'

function ModStatsInline({ item }: { item: Item }) {
  const m = item.mod
  if (!m) return null
  return (
    <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
      <span className={toneFor(m.ergonomics, false)} title="Ergonomics">{m.ergonomics ? `${signed(m.ergonomics)} ergo` : '0 ergo'}</span>
      <span className={toneFor(m.recoilModifier, true)} title="Recoil change">{formatPercent(m.recoilModifier)} recoil</span>
    </span>
  )
}

function SlotRow({
  flat,
  items,
  installed,
  open,
  onToggle,
  onChoose,
}: {
  flat: FlatSlot
  items: ItemsById
  installed: string[]
  open: boolean
  onToggle: () => void
  onChoose: (itemId: string | null) => void
}) {
  const { item, slot, label, depth } = flat
  const indent = Math.min(depth, 6) * 16
  const empty = !item
  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-1.5" style={{ paddingLeft: 12 + indent }}>
        <div className="w-28 shrink-0 text-xs text-ink-muted sm:w-36">
          <span className="block truncate" title={label}>{label}</span>
          {slot.required && <span className={`text-[10px] uppercase tracking-wide ${empty ? 'text-danger' : 'text-ink-dim'}`}>required</span>}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded border px-2 py-1 text-left text-sm hover:border-accent ${open ? 'border-accent' : slot.required && empty ? 'border-danger/60' : 'border-line'} bg-surface-3`}
        >
          {item ? (
            <>
              <ItemIcon item={item} size="h-7 w-7" />
              <span className="min-w-0 flex-1 truncate" title={item.name}>{item.name}</span>
              <span className="hidden sm:flex"><ModStatsInline item={item} /></span>
            </>
          ) : (
            <span className="flex-1 text-ink-dim">Empty: choose a part</span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 text-ink-dim transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {item && (
          <button type="button" onClick={() => onChoose(null)} title="Remove this part" aria-label={`Remove ${item.name}`} className="shrink-0 rounded p-1 text-ink-dim hover:text-danger">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {open && <PartPicker flat={flat} items={items} installed={installed} onChoose={onChoose} onClose={onToggle} indent={indent} />}
    </li>
  )
}

function PartPicker({
  flat,
  items,
  installed,
  onChoose,
  onClose,
  indent,
}: {
  flat: FlatSlot
  items: ItemsById
  installed: string[]
  onChoose: (itemId: string | null) => void
  onClose: () => void
  indent: number
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<PickerSort>('name')

  // Parts that would be removed by a swap do not block the new part.
  const ignore = useMemo(() => {
    const s = new Set<string>()
    if (flat.node) {
      s.add(flat.node.itemId)
      for (const id of installedIds(flat.node.slots)) s.add(id)
    }
    return s
  }, [flat.node])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list = slotCandidates(flat.slot, items)
      .filter((it) => !needle || it.name.toLowerCase().includes(needle) || it.shortName.toLowerCase().includes(needle))
      .map((it) => ({ item: it, price: acquireCost(it), conflict: findConflict(it.id, installed, items, ignore) }))
    const by: Record<PickerSort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      name: (a, b) => a.item.name.localeCompare(b.item.name),
      ergonomics: (a, b) => (b.item.mod?.ergonomics ?? 0) - (a.item.mod?.ergonomics ?? 0),
      recoil: (a, b) => (a.item.mod?.recoilModifier ?? 0) - (b.item.mod?.recoilModifier ?? 0),
      price: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
    }
    return list.sort((a, b) => Number(a.conflict != null) - Number(b.conflict != null) || by[sort](a, b) || a.item.name.localeCompare(b.item.name))
  }, [flat.slot, items, installed, ignore, search, sort])

  return (
    <div
      className="border-t border-line bg-surface px-3 py-2"
      style={{ paddingLeft: 12 + indent }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${flat.label.toLowerCase()} parts…`}
            aria-label="Search parts"
            autoFocus
            className={`${selectClass} w-full pl-8`}
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as PickerSort)} aria-label="Sort parts" className={selectClass}>
          <option value="name">By name</option>
          <option value="ergonomics">Best ergonomics</option>
          <option value="recoil">Least recoil</option>
          <option value="price">Cheapest</option>
        </select>
      </div>
      <ul className="mt-2 max-h-80 overflow-y-auto rounded border border-line bg-surface-2">
        {flat.node && (
          <li>
            <button type="button" onClick={() => onChoose(null)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-ink-muted hover:bg-surface-3">
              <X className="h-4 w-4" aria-hidden /> Leave this slot empty
            </button>
          </li>
        )}
        {rows.map(({ item, price, conflict }) => {
          const current = flat.node?.itemId === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={conflict != null}
                onClick={() => onChoose(item.id)}
                title={conflict ? `Cannot be used together with ${conflict.name}` : item.name}
                className={`flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 text-left text-sm hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 ${current ? 'bg-accent/10' : ''}`}
              >
                <ItemIcon item={item} size="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.name}</span>
                  {conflict && <span className="block truncate text-xs text-danger">Does not fit with {conflict.shortName}</span>}
                  {!conflict && slotCount(item) > 0 && <span className="block text-xs text-ink-dim">{slotCount(item)} more slot{slotCount(item) === 1 ? '' : 's'}</span>}
                </span>
                <ModStatsInline item={item} />
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-muted">{price == null ? 'no price' : formatRoubles(price)}</span>
              </button>
            </li>
          )
        })}
        {rows.length === 0 && <li className="px-2 py-4 text-center text-sm text-ink-muted">No parts match.</li>}
      </ul>
    </div>
  )
}

function slotCount(item: Item): number {
  return item.mod?.slots.length ?? 0
}
