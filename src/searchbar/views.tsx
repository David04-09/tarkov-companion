import { useMemo, useState } from 'react'
import { Check, ExternalLink, Map as MapIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Task } from '../api/types'
import { useStory, type StoryData } from '../api/storyWiki'
import { bestArmorClass, caliberLabel, shotDamage } from '../lib/ammo'
import { formatDuration } from '../lib/economy'
import { formatRoubles } from '../lib/format'
import { isFactionEligible } from '../lib/taskStatus'
import { buildSpawnModel } from '../maps/overlay/spawns'
import { requiredClosure, topoOrder } from '../quests/questGraph'
import { useInventoryStore } from '../store/inventory'
import { useProfile } from '../store/progress'
import { useStoryStore } from '../store/story'
import { ActionButton, ItemLink, QuestLink, Section, StarButton, Stepper } from './details'
import { useDetails } from './detailsContext'
import { bossIndex, clock, questline } from './overlayLogic'
import { useNow } from './shell'
import { buildUnlocks } from '../quests/questGraph'

const Heading = ({ children }: { children: React.ReactNode }) => <div className="font-medium leading-snug">{children}</div>
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-white/55">{children}</p>

// ---------------------------------------------------------------------------

export function QuestlineView({ id }: { id: string }) {
  const c = useDetails()
  const task = c.data.tasksById[id]
  const unlocks = useMemo(() => buildUnlocks(c.data.tasks), [c.data.tasks])
  const line = useMemo(() => questline(id, c.data.tasksById, unlocks), [id, c.data.tasksById, unlocks])
  if (!task) return <Muted>Not in the data any more.</Muted>
  const todo = line.before.filter((s) => !c.completed.has(s.task.id)).length
  const before = [...line.before].sort((a, b) => b.depth - a.depth)
  return (
    <>
      <Heading>Questline: {task.name}</Heading>
      <Muted>{todo ? `${todo} quest${todo === 1 ? '' : 's'} still to do before it.` : line.before.length ? 'Everything before it is done.' : 'Nothing comes before it.'}</Muted>
      <ol className="mt-1.5 space-y-0.5">
        {before.map((s) => (
          <li key={s.task.id} style={{ paddingLeft: Math.min(4, s.depth - 1) * 6 }}>
            <QuestLink task={s.task} />
          </li>
        ))}
        <li className="rounded bg-white/10 px-1 py-0.5">
          <QuestLink task={task} note="this one" />
        </li>
        {line.after.map((s) => (
          <li key={s.task.id} style={{ paddingLeft: Math.min(4, s.depth) * 6 }}>
            <QuestLink task={s.task} note={s.depth === 1 ? 'opens next' : undefined} />
          </li>
        ))}
      </ol>
      {line.after.length === 0 && <Muted>It opens no further quests.</Muted>}
    </>
  )
}

// ---------------------------------------------------------------------------

export function TraderView({ id }: { id: string }) {
  const c = useDetails()
  const setLevel = useInventoryStore((s) => s.setTraderLevel)
  const now = useNow(1000)
  const trader = c.data.traders.find((t) => t.id === id)
  const tasks = useMemo(() => c.data.tasks.filter((t) => t.trader.id === id && c.statuses[t.id]), [c.data.tasks, c.statuses, id])
  if (!trader) return <Muted>Not in the data any more.</Muted>
  const by = (s: string) => tasks.filter((t) => c.statuses[t.id] === s)
  const available = by('available')
  const locked = by('locked')
  const done = by('completed')
  const level = c.traderLevels[id] ?? 1
  return (
    <>
      <div className="flex items-center gap-2">
        {trader.imageLink && <img src={trader.imageLink} alt="" className="h-10 w-10 rounded object-cover" />}
        <div className="min-w-0 flex-1">
          <Heading>{trader.name}</Heading>
          <Muted>{trader.resetTime ? `Restock in ${clock(Math.max(0, (trader.resetTime - now) / 1000))}` : 'No restock time in the data'}</Muted>
        </div>
        <StarButton r={{ kind: 'trader', id, label: trader.name }} />
      </div>
      {trader.maxLevel > 1 && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-white/55">Your loyalty level</span>
          <Stepper value={level} min={1} max={trader.maxLevel} label="Loyalty level" onChange={(n) => setLevel(c.mode, id, n)} />
        </div>
      )}
      <div className="mt-1.5 text-xs text-white/70">
        {available.length} available · {locked.length} locked · {done.length} done
      </div>
      <Section title="Available now" count={available.length} defaultOpen>
        <ul className="space-y-0.5">
          {available.map((t) => (
            <li key={t.id}>
              <QuestLink task={t} note={t.map?.name ?? ''} />
            </li>
          ))}
        </ul>
      </Section>
      {locked.length > 0 && (
        <Section title="Locked" count={locked.length}>
          <ul className="space-y-0.5">
            {locked.slice(0, 60).map((t) => (
              <li key={t.id}>
                <QuestLink task={t} note={t.minPlayerLevel > 1 ? `lvl ${t.minPlayerLevel}` : ''} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

export function TradersView() {
  const c = useDetails()
  const now = useNow(1000)
  const traders = [...c.data.traders].filter((t) => t.resetTime).sort((a, b) => (a.resetTime ?? 0) - (b.resetTime ?? 0))
  return (
    <>
      <Heading>Trader restocks</Heading>
      <ul className="mt-1.5 space-y-0.5">
        {traders.map((t) => {
          const left = Math.max(0, ((t.resetTime ?? 0) - now) / 1000)
          return (
            <li key={t.id}>
              <button type="button" onClick={() => c.open({ kind: 'trader', id: t.id })} className="flex w-full items-center gap-2 text-left hover:text-white">
                {t.imageLink && <img src={t.imageLink} alt="" className="h-6 w-6 rounded object-cover" />}
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className={`tabular-nums ${left < 600 ? 'text-green-300' : 'text-white/70'}`}>{clock(left)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <Muted>Restock times come with the game data (refreshed every few hours).</Muted>
    </>
  )
}

// ---------------------------------------------------------------------------

export function BossView({ id }: { id: string }) {
  const c = useDetails()
  const boss = useMemo(() => bossIndex(c.data).find((b) => b.key === id), [c.data, id])
  const detail = useMemo(() => (boss?.maps[0] ? buildSpawnModel(c.data, boss.maps[0].mapId).bosses.find((b) => b.key === id) : undefined), [c.data, boss, id])
  if (!boss) return <Muted>Not in the data any more.</Muted>
  const mapName = (mapId: string) => c.data.maps.find((m) => m.id === mapId)?.name ?? 'Map'
  const pointsOn = (mapId: string) => (c.data.mapDetails[mapId]?.bosses ?? []).filter((b) => (b.normalizedName || b.mobId) === id).flatMap((b) => b.locations.flatMap((l) => l.positions))
  return (
    <>
      <div className="flex items-center gap-2">
        {boss.portrait && <img src={boss.portrait} alt="" className="h-10 w-10 rounded-full object-cover" />}
        <Heading>{boss.name}</Heading>
        <span className="flex-1" />
        <StarButton r={{ kind: 'boss', id, label: boss.name }} />
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {boss.maps.map((m) => {
          const pts = pointsOn(m.mapId)
          return (
            <li key={m.mapId} className="flex items-center gap-2 text-xs">
              <span className="w-10 shrink-0 tabular-nums text-white/70">{Math.round(m.chance * 100)}%</span>
              <span className="min-w-0 flex-1 truncate">{mapName(m.mapId)}</span>
              {pts.length > 0 ? (
                <ActionButton onClick={() => c.openMap(m.mapId, { layers: ['bosses'], spot: { points: pts, label: boss.name }, title: `${boss.name} on ${mapName(m.mapId)}` })}>
                  <MapIcon className="h-3 w-3" /> Spawns
                </ActionButton>
              ) : (
                <span className="text-[10px] text-white/40">no spots in the data</span>
              )}
            </li>
          )
        })}
      </ul>
      {detail && detail.escorts.length > 0 && <p className="mt-1.5 text-xs text-white/70">Guards: {detail.escorts.map((x) => `${x.name} ×${x.counts.join('/') || '?'}`).join(', ')}</p>}
      {detail?.conditions.map((t) => (
        <p key={t} className="text-xs text-white/55">{t}</p>
      ))}
      <Muted>Chance and spots are tarkov.dev's game data.</Muted>
    </>
  )
}

// ---------------------------------------------------------------------------

export function StationView({ id }: { id: string }) {
  const c = useDetails()
  const setLevel = useInventoryStore((s) => s.setStationLevel)
  const station = c.stations.find((s) => s.id === id)
  if (!station) return <Muted>The hideout data is still loading.</Muted>
  const current = c.stationLevels[id] ?? 0
  const max = station.levels.length
  const next = station.levels.find((l) => l.level === current + 1)
  const stationName = (sid: string) => c.stations.find((s) => s.id === sid)?.name ?? 'Station'
  return (
    <>
      <div className="flex items-center gap-2">
        {station.imageLink && <img src={station.imageLink} alt="" className="h-9 w-9 object-contain" />}
        <Heading>{station.name}</Heading>
        <span className="flex-1" />
        <StarButton r={{ kind: 'station', id, label: station.name }} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className="text-white/55">Built level</span>
        <Stepper value={current} min={0} max={max} label="Station level" onChange={(n) => setLevel(c.mode, id, n)} />
        <span className="text-white/45">of {max}</span>
      </div>
      {!next ? (
        <p className="mt-1.5 text-xs text-green-300">Fully built.</p>
      ) : (
        <>
          <div className="mt-1.5 text-xs text-white/70">
            Level {next.level} · builds in {formatDuration(next.constructionTime)}
          </div>
          <ul className="mt-1 space-y-0.5">
            {next.itemRequirements.map((r) => {
              const have = c.collected[r.itemId] ?? 0
              return (
                <li key={r.itemId} className="flex items-center gap-1.5">
                  <span className={`w-14 shrink-0 tabular-nums text-xs ${have >= r.count ? 'text-green-300' : 'text-white/60'}`}>
                    {Math.min(have, r.count)}/{formatCount(r.count)}
                  </span>
                  <ItemLink id={r.itemId} />
                  {r.foundInRaid && <span className="shrink-0 text-[10px] text-amber-300">FIR</span>}
                </li>
              )
            })}
            {next.traderRequirements.map((r) => (
              <li key={r.traderId} className="text-xs text-white/70">
                {c.traderName(r.traderId)} loyalty {r.level} {(c.traderLevels[r.traderId] ?? 1) >= r.level ? '✓' : ''}
              </li>
            ))}
            {next.stationLevelRequirements.map((r) => (
              <li key={r.stationId} className="text-xs text-white/70">
                {stationName(r.stationId)} level {r.level} {(c.stationLevels[r.stationId] ?? 0) >= r.level ? '✓' : ''}
              </li>
            ))}
            {next.skillRequirements.map((r) => (
              <li key={r.skill} className="text-xs text-white/70">
                {r.skill} skill {r.level}
              </li>
            ))}
          </ul>
          {next.bonuses.length > 0 && <p className="mt-1 text-[11px] text-white/50">Gives: {next.bonuses.map((b) => b.name).join(', ')}</p>}
        </>
      )}
    </>
  )
}

const formatCount = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : String(n))

/** Every station: built level, and whether the next level can be built with what you have. */
export function HideoutView() {
  const c = useDetails()
  const rows = useMemo(
    () =>
      c.stations
        .map((s) => {
          const level = c.stationLevels[s.id] ?? 0
          const next = s.levels.find((l) => l.level === level + 1)
          const missing = next
            ? next.itemRequirements.filter((r) => (c.collected[r.itemId] ?? 0) < r.count).length +
              next.stationLevelRequirements.filter((r) => (c.stationLevels[r.stationId] ?? 0) < r.level).length +
              next.traderRequirements.filter((r) => (c.traderLevels[r.traderId] ?? 1) < r.level).length
            : 0
          return { s, level, max: s.levels.length, next, missing }
        })
        .sort((a, b) => Number(!a.next) - Number(!b.next) || a.missing - b.missing || a.s.name.localeCompare(b.s.name)),
    [c.stations, c.stationLevels, c.collected, c.traderLevels],
  )
  if (!c.stations.length) return <Muted>The hideout data is still loading.</Muted>
  return (
    <>
      <Heading>Hideout</Heading>
      <Muted>Levels and items as set in the app (Hideout tab, Item Collection). Skills are not counted.</Muted>
      <ul className="mt-1.5 space-y-0.5">
        {rows.map(({ s, level, max, next, missing }) => (
          <li key={s.id}>
            <button type="button" onClick={() => c.open({ kind: 'station', id: s.id })} className="flex w-full items-center gap-2 text-left hover:text-white">
              {s.imageLink ? <img src={s.imageLink} alt="" className="h-5 w-5 shrink-0 object-contain" /> : <span className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-white/50">
                {level}/{max}
              </span>
              <span className={`w-24 shrink-0 text-right text-[11px] ${!next ? 'text-white/40' : missing === 0 ? 'text-green-300' : 'text-white/55'}`}>{!next ? 'done' : missing === 0 ? 'can build now' : `${missing} thing${missing === 1 ? '' : 's'} missing`}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

// ---------------------------------------------------------------------------

export function AmmoView({ id }: { id: string }) {
  const c = useDetails()
  const rounds = useMemo(
    () =>
      Object.values(c.items ?? {})
        .filter((it) => it.ammo?.caliber === id)
        .sort((a, b) => (b.ammo!.penetrationPower - a.ammo!.penetrationPower) || shotDamage(b.ammo!) - shotDamage(a.ammo!)),
    [c.items, id],
  )
  return (
    <>
      <Heading>{caliberLabel(id)} rounds</Heading>
      <table className="mt-1.5 w-full text-[11px] tabular-nums">
        <thead className="text-white/45">
          <tr>
            <th className="text-left font-normal">Round</th>
            <th className="font-normal" title="Damage">Dmg</th>
            <th className="font-normal" title="Penetration">Pen</th>
            <th className="font-normal" title="Armour damage">Arm</th>
            <th className="font-normal" title="Armour class it handles well (rule of thumb)">Cls</th>
            <th className="text-right font-normal">Price</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((it) => {
            const a = it.ammo!
            const price = it.avg24hPrice ?? it.buyFromTrader[0]?.priceRUB ?? null
            return (
              <tr key={it.id} className="hover:bg-white/5">
                <td className="max-w-[9rem] truncate">
                  <button type="button" onClick={() => c.open({ kind: 'item', id: it.id })} className="hover:text-white hover:underline">
                    {it.shortName}
                  </button>
                </td>
                <td className="text-center">{a.projectileCount > 1 ? `${a.damage}×${a.projectileCount}` : a.damage}</td>
                <td className="text-center">{a.penetrationPower}</td>
                <td className="text-center">{a.armorDamage}%</td>
                <td className="text-center">{bestArmorClass(a.penetrationPower)}</td>
                <td className="text-right text-white/70">{price ? formatRoubles(price) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Muted>"Cls" is a rule of thumb (penetration ≥ 10 × armour class), not the game's exact formula.</Muted>
    </>
  )
}

// ---------------------------------------------------------------------------

export function PathView({ which }: { which: 'kappa' | 'lightkeeper' }) {
  const c = useDetails()
  const profile = useProfile()
  const { targets, todo } = useMemo(() => {
    const tasks = c.data.tasks.filter((t) => isFactionEligible(t, profile.faction))
    const targets = tasks.filter((t) => (which === 'kappa' ? t.kappaRequired : t.lightkeeperRequired || t.trader.normalizedName === 'lightkeeper'))
    const closure = requiredClosure(
      targets.map((t) => t.id),
      c.data.tasksById,
      c.completed,
      (t) => isFactionEligible(t as Task, profile.faction),
    )
    return { targets, todo: topoOrder(closure, c.data.tasksById).map((id) => c.data.tasksById[id]).filter((t): t is Task => Boolean(t)) }
  }, [c.data, c.completed, profile.faction, which])
  const done = targets.filter((t) => c.completed.has(t.id)).length
  const available = todo.filter((t) => c.statuses[t.id] === 'available')
  const label = which === 'kappa' ? 'Kappa' : 'Lightkeeper'
  return (
    <>
      <Heading>{label} path</Heading>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/10">
        <div className="h-full bg-amber-300" style={{ width: `${targets.length ? (done / targets.length) * 100 : 0}%` }} />
      </div>
      <Muted>
        {done} of {targets.length} quests the data marks as needed for {label} are done; {todo.length} quests still to do on the way.
      </Muted>
      <Section title="You can do now" count={available.length} defaultOpen>
        <ul className="space-y-0.5">
          {available.map((t) => (
            <li key={t.id}>
              <QuestLink task={t} />
            </li>
          ))}
        </ul>
      </Section>
      <Section title="All still to do, in order" count={todo.length}>
        <ol className="space-y-0.5">
          {todo.slice(0, 120).map((t) => (
            <li key={t.id}>
              <QuestLink task={t} />
            </li>
          ))}
        </ol>
      </Section>
      {which === 'kappa' && <Muted>tarkov.dev marks only a few quests as Kappa-required; the in-game list may be longer.</Muted>}
    </>
  )
}

// ---------------------------------------------------------------------------

export function StoryView({ id }: { id: string | null }) {
  const c = useDetails()
  const qc = useQueryClient()
  const cached = qc.getQueriesData<StoryData>({ queryKey: ['story'] }).find(([, d]) => d)?.[1]
  const [load, setLoad] = useState(Boolean(cached))
  if (!cached && !load)
    return (
      <>
        <Heading>Story chapters</Heading>
        <Muted>The chapters come from the EFT Wiki (about 15 pages). They load once and are kept.</Muted>
        <div className="mt-1.5">
          <ActionButton onClick={() => setLoad(true)}>Load the story chapters</ActionButton>
        </div>
      </>
    )
  return <StoryLoaded id={id} open={(slug) => c.open({ kind: 'story', id: slug })} />
}

function StoryLoaded({ id, open }: { id: string | null; open: (slug: string) => void }) {
  const story = useStory()
  const c = useDetails()
  const progress = useStoryStore((s) => s.byMode[c.mode])
  const setDone = useStoryStore((s) => s.setDone)
  if (story.isPending) return <Muted>Loading the chapters from the wiki…</Muted>
  if (!story.data) return <Muted>The wiki could not be reached.</Muted>
  const chapter = id ? story.data.chapters.find((ch) => ch.slug === id) : null
  const short = (t: string) => t.replace(/\s*\(story chapter\)/i, '')
  if (!chapter)
    return (
      <>
        <Heading>Story chapters</Heading>
        <ul className="mt-1.5 space-y-0.5">
          {story.data.chapters.map((ch) => {
            const done = Object.keys(progress?.[ch.slug]?.done ?? {}).length
            const total = ch.objectives.filter((o) => !o.optional).length
            return (
              <li key={ch.slug}>
                <button type="button" onClick={() => open(ch.slug)} className="flex w-full items-center gap-2 text-left hover:text-white">
                  {ch.icon && <img src={ch.icon} alt="" className="h-5 w-5 object-contain" />}
                  <span className="min-w-0 flex-1 truncate">{short(ch.title)}</span>
                  <span className="text-[11px] tabular-nums text-white/50">
                    {Math.min(done, total)}/{total}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )
  const done = progress?.[chapter.slug]?.done ?? {}
  return (
    <>
      <Heading>{short(chapter.title)}</Heading>
      {chapter.description && <p className="mt-0.5 text-xs italic text-white/55">{chapter.description}</p>}
      <ul className="mt-1.5 space-y-0.5">
        {chapter.objectives.map((o) => (
          <li key={o.key} style={{ paddingLeft: o.depth * 10 }}>
            {o.branch && o === chapter.objectives.find((x) => x.branch === o.branch) && <div className="mt-1 text-[10px] uppercase tracking-wide text-white/45">{o.branch}</div>}
            <label className={`flex cursor-pointer items-start gap-1.5 text-xs ${o.optional ? 'text-white/55' : 'text-white/85'}`}>
              <input type="checkbox" checked={Boolean(done[o.key])} onChange={(e) => setDone(c.mode, chapter.slug, o.key, e.target.checked)} className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]" />
              <span>
                {o.text}
                {o.optional ? ' (optional)' : ''}
                {o.wait ? ` · wait ${o.wait.minH === o.wait.maxH ? o.wait.minH : `${o.wait.minH}–${o.wait.maxH}`} h` : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex gap-1.5">
        <ActionButton onClick={() => open('')}>All chapters</ActionButton>
        <ActionButton onClick={() => void window.desktop?.openExternal(chapter.pageUrl)}>
          Wiki <ExternalLink className="h-3 w-3" />
        </ActionButton>
      </div>
      <Muted>Ticks are the same as on the Story tab. Wait timers start from the Story tab.</Muted>
    </>
  )
}

// ---------------------------------------------------------------------------

export function HelpView() {
  return (
    <>
      <Heading>What the search bar can do</Heading>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-white/80">
        <li>Type a map, item, key, quest, trader, boss, extract or hideout station. "kappa", "lightkeeper", "traders", "hideout", "story", "settings" and "help" open those pages. With the box empty: buttons for every map and page, the Goons' last map, your starred and recent picks.</li>
        <li>Cards: quests (keys, items, what comes before and after, wiki pictures, Mark done), items (prices, flea after fee, 7-day chart, what needs it, where it lies, copy the name), keys (locks on the map, worth it?), traders (restock, loyalty, quests), bosses (spawn spots per map), hideout (what you can build now), ammo (every round of a calibre).</li>
        <li>"Pin beside" or the panel button keeps up to 3 cards next to the search.</li>
        <li>Maps: the list on the right has quests, extracts, bosses, locked doors, loot and layers. Click anything to zoom there. Drag the corner to resize the map.</li>
        <li>Layers: bosses (exact spawn points), sniper scavs, PMC and scav spawns, locked doors with their keys, containers, valuable loose loot, loot you still need, hazards.</li>
        <li>Double-click a quest spot when you have done it. The ruler measures distances in metres.</li>
        <li>The pills next to the glass: time left in your raid (from the game log), Tarkov time (left and right side), your scav cooldown.</li>
        <li>Take an in-game screenshot (Print Screen) in a raid: an arrow shows where you were, and the quest and extract lists show how far each is (straight line), nearest first.</li>
        <li>The Quests list shows what to bring for the ticked quests; the Locks list filters keys you have or keys your quests need.</li>
        <li>Drag the glass anywhere. Hotkeys (set them in the app's Settings → Desktop app): show/hide, open the search box, lock (clicks go through).</li>
        <li>Starred things and your last searches show when the search box is empty.</li>
      </ul>
    </>
  )
}

export function CheckRow({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {on && <Check className="h-3 w-3 text-green-400" />}
      {children}
    </span>
  )
}
