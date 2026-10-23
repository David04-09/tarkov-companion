import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight, ExternalLink, Map as MapIcon, PanelRightOpen } from 'lucide-react'
import type { Item, Task } from '../api/types'
import { useKeyWiki } from '../api/wikiKey'
import { useWikiGuide, type GuideImage } from '../api/wikiGuide'
import { WikiImage } from '../components/WikiImage'
import { formatNumber, formatRoubles } from '../lib/format'
import { keyVerdict } from '../lib/keyVerdict'
import { remainingFor } from '../lib/needs'
import { STATUS_LABEL } from '../lib/taskStatus'
import { useDetails } from './detailsContext'

/** A fold-out part of a card. Its content (and any download it needs) only exists once opened. */
function Section({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-1.5 border-t border-white/10 pt-1">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1 text-left text-[11px] uppercase tracking-wide text-white/55 hover:text-white">
        <ChevronRight className={`h-3 w-3 shrink-0 ${open ? 'rotate-90' : ''}`} />
        {title}
        {count != null && <span className="text-white/35">({count})</span>}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

/** An item name that opens its details beside the card. */
function ItemLink({ id, children }: { id: string; children?: ReactNode }) {
  const c = useDetails()
  const it = c.items?.[id]
  if (!it) return <span className="text-white/70">{children ?? 'Unknown item'}</span>
  return (
    <button type="button" onClick={() => c.open({ kind: 'item', id })} title="Details beside this card" className="inline-flex min-w-0 items-center gap-1.5 text-left hover:text-white hover:underline">
      {it.iconLink && <img src={it.iconLink} alt="" loading="lazy" className="h-5 w-5 shrink-0 object-contain" />}
      <span className="min-w-0 truncate">{it.name}</span>
      {children}
    </button>
  )
}

function QuestLink({ task }: { task: Task }) {
  const c = useDetails()
  const done = c.completed.has(task.id)
  return (
    <button type="button" onClick={() => c.open({ kind: 'quest', id: task.id })} title="Details beside this card" className="inline-flex min-w-0 items-center gap-1 text-left hover:text-white hover:underline">
      {done ? <Check className="h-3 w-3 shrink-0 text-green-400" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/40" />}
      <span className={`min-w-0 truncate ${done ? 'text-white/55' : ''}`}>{task.name}</span>
      <span className="shrink-0 text-[11px] text-white/40">{task.trader.name}</span>
    </button>
  )
}

/** Wiki pictures as small tiles; a click shows one large beside the card. */
function Pictures({ images, title }: { images: GuideImage[]; title: string }) {
  const c = useDetails()
  if (!images.length) return null
  return (
    <div className="grid grid-cols-3 gap-1">
      {images.slice(0, 12).map((img) => (
        <button key={img.full} type="button" onClick={() => c.open({ kind: 'picture', image: img, title })} title={img.caption || 'Show it larger'} className="overflow-hidden rounded bg-white/5 hover:ring-1 hover:ring-white/40">
          <WikiImage src={img.thumb} alt={img.caption} loading="lazy" className="h-16 w-full object-cover" />
        </button>
      ))}
    </div>
  )
}

function WikiCredit({ url }: { url: string }) {
  return (
    <button type="button" onClick={() => void window.desktop?.openExternal(url)} className="mt-1 inline-flex items-center gap-1 text-[10px] text-white/40 hover:text-white">
      EFT Wiki (CC BY-SA) <ExternalLink className="h-2.5 w-2.5" />
    </button>
  )
}

function GuidePictures({ task }: { task: Task }) {
  const g = useWikiGuide(task.wikiLink)
  if (g.isPending) return <p className="text-xs text-white/55">Loading the wiki guide…</p>
  if (!g.data) return <p className="text-xs text-white/55">No wiki guide found for this quest.</p>
  return (
    <>
      <Pictures images={g.data.images} title={task.name} />
      {g.data.images.length === 0 && <p className="text-xs text-white/55">The wiki page has no pictures.</p>}
      {g.data.guideText.length > 0 && (
        <div className="mt-1.5 space-y-1 text-xs text-white/75">
          {g.data.guideText.slice(0, 8).map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </div>
      )}
      <WikiCredit url={g.data.pageUrl} />
    </>
  )
}

/** Hand-ins and things to place; "find" objectives repeat the hand-in, so they are left out. */
const ITEM_OBJECTIVES = new Set(['giveItem', 'plantItem', 'giveQuestItem', 'plantQuestItem'])

export function QuestDetails({ task }: { task: Task }) {
  const c = useDetails()
  const status = c.statuses[task.id] ?? 'locked'
  const keyIds = useMemo(() => [...new Set([...task.neededKeys.flatMap((k) => k.keyIds), ...task.objectives.flatMap((o) => o.requiredKeys.flat())])], [task])
  const itemRows = task.objectives.filter((o) => ITEM_OBJECTIVES.has(o.type) && (o.itemIds.length > 0 || o.questItem))
  const markers = task.objectives.filter((o) => o.markerItemId)
  const before = task.taskRequirements.map((r) => c.data.tasksById[r.taskId]).filter((t): t is Task => Boolean(t))
  const unlocks = useMemo(() => c.data.tasks.filter((t) => t.taskRequirements.some((r) => r.taskId === task.id)), [c.data.tasks, task.id])
  const maps = [...new Set(task.objectives.flatMap((o) => o.maps.map((m) => m.name)))]
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 font-medium leading-snug">{task.name}</div>
        <OnMapBox checked={c.onMap.includes(task.id)} onChange={(on) => c.tickQuest(task, on)} />
      </div>
      <div className="text-xs text-white/60">
        {task.trader.name} · {task.map?.name ?? (maps.length ? maps.join(', ') : 'any map')} ·{' '}
        <span className={status === 'available' ? 'text-green-400' : status === 'completed' ? 'text-white/45' : 'text-amber-300'}>{STATUS_LABEL[status]}</span>
        {task.minPlayerLevel > 1 ? ` · level ${task.minPlayerLevel}` : ''}
        {task.experience ? ` · ${formatNumber(task.experience)} XP` : ''}
        {task.kappaRequired ? ' · Kappa' : ''}
        {task.lightkeeperRequired ? ' · Lightkeeper' : ''}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-white/85">
        {task.objectives.map((o) => (
          <li key={o.id} className={`flex gap-1.5 ${o.optional ? 'text-white/50' : ''}`}>
            <span className="text-white/40">•</span>
            <span className="min-w-0">
              {o.description}
              {o.optional ? ' (optional)' : ''}
            </span>
          </li>
        ))}
      </ul>
      {keyIds.length > 0 && (
        <Section title="Keys needed" count={keyIds.length} defaultOpen>
          <ul className="space-y-0.5">
            {keyIds.map((id) => (
              <li key={id}>
                <ItemLink id={id} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(itemRows.length > 0 || markers.length > 0) && (
        <Section title="Items" count={itemRows.length + markers.length} defaultOpen>
          <ul className="space-y-0.5">
            {itemRows.map((o) => (
              <li key={o.id} className="flex items-center gap-1.5">
                <span className="shrink-0 tabular-nums text-white/55">{o.count ?? 1}×</span>
                {o.itemIds.length ? <ItemLink id={o.itemIds[0]} /> : <span>{o.questItem?.name}</span>}
                {o.foundInRaid && <span className="shrink-0 text-[10px] text-amber-300">FIR</span>}
                {o.itemIds.length > 1 && <span className="shrink-0 text-[10px] text-white/40">or {o.itemIds.length - 1} other{o.itemIds.length > 2 ? 's' : ''}</span>}
                <span className="shrink-0 text-[10px] text-white/40">{/plant/i.test(o.type) ? 'place' : 'hand in'}</span>
              </li>
            ))}
            {markers.map((o) => (
              <li key={`m${o.id}`} className="flex items-center gap-1.5">
                <span className="shrink-0 text-white/55">1×</span>
                <ItemLink id={o.markerItemId!} />
                <span className="shrink-0 text-[10px] text-white/40">to mark</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {(before.length > 0 || task.otherRequirements.length > 0) && (
        <Section title="Before this" count={before.length + task.otherRequirements.length}>
          <ul className="space-y-0.5">
            {before.map((t) => (
              <li key={t.id}>
                <QuestLink task={t} />
              </li>
            ))}
            {task.otherRequirements.map((r) => (
              <li key={r} className="text-xs text-white/60">
                Also: {r}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {unlocks.length > 0 && (
        <Section title="Unlocks" count={unlocks.length}>
          <ul className="space-y-0.5">
            {unlocks.map((t) => (
              <li key={t.id}>
                <QuestLink task={t} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {task.wikiLink && (
        <Section title="Guide and location pictures">
          <GuidePictures task={task} />
        </Section>
      )}
    </>
  )
}

function KeyWikiInfo({ item, questNames }: { item: Item; questNames: string[] }) {
  const w = useKeyWiki(item.wikiLink)
  if (w.isPending) return <p className="text-xs text-white/55">Loading the wiki page…</p>
  if (!w.data) return <p className="text-xs text-white/55">No wiki page found for this key.</p>
  const v = keyVerdict({ behind: w.data.behind, questNames })
  const verdict =
    v.kind === 'quest'
      ? `Needed for ${questNames.join(', ')}${v.lootWorth ? '; also good loot' : ''}.`
      : v.kind === 'yes'
        ? `Worth it: ${v.reasons.slice(0, 3).join(', ')}.`
        : v.kind === 'no'
          ? `Not much behind it${v.reasons.length ? ` (${v.reasons.slice(0, 2).join(', ')})` : ''}.`
          : 'The wiki does not say what is behind it.'
  return (
    <div className="space-y-1.5 text-xs">
      <p className={v.kind === 'no' ? 'text-white/60' : 'text-green-300'}>{verdict}</p>
      {w.data.lockText.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/45">Where the lock is</div>
          {w.data.lockText.slice(0, 5).map((t, i) => (
            <p key={i} className="text-white/80">{t}</p>
          ))}
        </div>
      )}
      <Pictures images={w.data.lockImages} title={`${item.shortName}: the lock`} />
      {w.data.behind.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/45">Behind the lock</div>
          <ul>
            {w.data.behind.slice(0, 12).map((t, i) => (
              <li key={i} className="text-white/80">• {t}</li>
            ))}
          </ul>
        </div>
      )}
      <Pictures images={w.data.behindImages} title={`${item.shortName}: behind the lock`} />
      <WikiCredit url={w.data.pageUrl} />
    </div>
  )
}

export function ItemDetails({ item }: { item: Item }) {
  const c = useDetails()
  const need = c.needs.get(item.id)
  const remaining = need ? remainingFor(need, c.collected[item.id] ?? 0) : 0
  const sell = [...item.sellToTrader].sort((a, b) => b.priceRUB - a.priceRUB)[0]
  const buy = item.buyFromTrader[0]
  const banned = item.types.includes('noFlea')
  const slots = Math.max(1, item.width * item.height)
  const isKey = item.types.includes('keys')
  const keyMaps = isKey ? c.keyMaps(item) : []
  const keyQuests = useMemo(
    () => (isKey ? c.data.tasks.filter((t) => !c.completed.has(t.id) && (t.neededKeys.some((k) => k.keyIds.includes(item.id)) || t.objectives.some((o) => o.requiredKeys.some((g) => g.includes(item.id))))) : []),
    [isKey, c.data.tasks, c.completed, item.id],
  )
  // Loose-loot spots per map (Night Factory is the same picture as Factory).
  const lootMaps = useMemo(() => {
    const out: { name: string; n: number }[] = []
    for (const m of c.data.maps) {
      if (/night/i.test(m.normalizedName)) continue
      const n = (c.data.mapDetails[m.id]?.lootLoose ?? []).filter((l) => l.itemIds.includes(item.id)).length
      if (n) out.push({ name: m.name, n })
    }
    return out.sort((a, b) => b.n - a.n)
  }, [c.data, item.id])
  return (
    <>
      <div className="flex gap-3">
        {item.iconLink && <img src={item.iconLink} alt="" className="h-14 w-14 shrink-0 object-contain" />}
        <div className="min-w-0">
          <div className="font-medium leading-snug">{item.name}</div>
          <div className="text-xs text-white/55">
            {item.shortName} · {item.width}×{item.height}
          </div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-white/50">Flea</dt>
        <dd className="tabular-nums">
          {banned ? "Can't be sold there" : item.avg24hPrice ? `${formatRoubles(item.avg24hPrice)}${item.lastLowPrice ? ` (lowest ${formatRoubles(item.lastLowPrice)})` : ''}` : '—'}
        </dd>
        {!banned && item.avg24hPrice != null && slots > 1 && (
          <>
            <dt className="text-white/50">Per slot</dt>
            <dd className="tabular-nums">{formatRoubles(Math.round(item.avg24hPrice / slots))}</dd>
          </>
        )}
        {sell && (
          <>
            <dt className="text-white/50">Sell to</dt>
            <dd className="tabular-nums">
              {formatRoubles(sell.priceRUB)} <span className="text-white/50">({c.traderName(sell.traderId)})</span>
            </dd>
          </>
        )}
        {buy && (
          <>
            <dt className="text-white/50">Buy from</dt>
            <dd className="tabular-nums">
              {formatRoubles(buy.priceRUB)}{' '}
              <span className="text-white/50">
                ({c.traderName(buy.traderId)}
                {buy.minTraderLevel ? ` LL${buy.minTraderLevel}` : ''})
              </span>
            </dd>
          </>
        )}
        {!banned && item.fleaLevel != null && (
          <>
            <dt className="text-white/50">Sell from</dt>
            <dd>level {item.fleaLevel}</dd>
          </>
        )}
        <dt className="text-white/50">Needed</dt>
        <dd>{remaining > 0 ? `${remaining} more${(need?.fir ?? 0) > 0 ? ' (found in raid)' : ''}` : 'nothing open needs it'}</dd>
      </dl>
      {keyMaps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {keyMaps.map((k) => (
            <button key={k.option.key} type="button" onClick={() => c.showKey(item, k)} className="inline-flex items-center gap-1 rounded border border-white/20 bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
              <MapIcon className="h-3 w-3" /> Show the lock on {k.option.name}
            </button>
          ))}
        </div>
      )}
      {need && need.sources.length > 0 && (
        <Section title="Needed for" count={need.sources.length} defaultOpen={remaining > 0}>
          <ul className="space-y-0.5">
            {need.sources.map((s, i) => (
              <li key={`${s.kind}:${s.id}:${i}`} className="flex items-center gap-1.5">
                <span className="shrink-0 tabular-nums text-white/55">{s.count}×</span>
                {s.kind === 'quest' && c.data.tasksById[s.id] ? <QuestLink task={c.data.tasksById[s.id]} /> : <span className="min-w-0 truncate">{s.kind === 'hideout' ? `${s.name} level ${s.level}` : s.name}</span>}
                {'fir' in s && s.fir && <span className="shrink-0 text-[10px] text-amber-300">FIR</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {keyQuests.length > 0 && (
        <Section title="Quests that need this key" count={keyQuests.length} defaultOpen>
          <ul className="space-y-0.5">
            {keyQuests.map((t) => (
              <li key={t.id}>
                <QuestLink task={t} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {lootMaps.length > 0 && (
        <Section title="Lies around on" count={lootMaps.length}>
          <ul className="text-xs text-white/80">
            {lootMaps.map((m) => (
              <li key={m.name}>
                {m.name} <span className="text-white/45">· {m.n} spot{m.n === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-0.5 text-[10px] text-white/40">Loose-loot spots from tarkov.dev; chances are not in the data.</p>
        </Section>
      )}
      {isKey && item.wikiLink && (
        <Section title="Worth it? Lock and loot pictures">
          <KeyWikiInfo item={item} questNames={keyQuests.map((t) => t.name)} />
        </Section>
      )}
    </>
  )
}

export function PictureDetails({ image }: { image: GuideImage }) {
  return (
    <>
      <WikiImage src={image.full} alt={image.caption} className="max-h-[60vh] w-full rounded object-contain" />
      {image.caption && <p className="mt-1 text-xs text-white/75">{image.caption}</p>}
      <button type="button" onClick={() => void window.desktop?.openExternal(image.full)} className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/50 hover:text-white">
        Full size in the browser <ExternalLink className="h-3 w-3" />
      </button>
    </>
  )
}

/** "On map": the quest's spots are drawn on its map, here and on the app's Maps tab. */
export function OnMapBox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1 px-2 text-[11px] text-white/60 hover:text-white" title="Show this quest's spots on its map, zoomed in (here and on the Maps tab)">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
      On map
    </label>
  )
}

/** The button that opens something in a side panel (keeps the main card as it is). */
export function SideButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="shrink-0 px-1.5 text-white/45 hover:text-white">
      <PanelRightOpen className="h-3.5 w-3.5" />
    </button>
  )
}
