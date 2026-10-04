import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Images, Loader2, Wrench, X } from 'lucide-react'
import { useItems } from '../api/hooks'
import type { Task, WeaponBuild } from '../api/types'
import { useWikiGuide, type GuideImage } from '../api/wikiGuide'
import { isDesktop } from '../desktop/useDesktop'

const STAT_LABEL: Record<string, { label: string; unit?: string; digits?: number }> = {
  ergonomics: { label: 'Ergonomics' },
  recoil: { label: 'Recoil (sum)' },
  weight: { label: 'Weight', unit: 'kg', digits: 2 },
  durability: { label: 'Durability', unit: '%' },
  effectiveDistance: { label: 'Effective distance', unit: 'm' },
  magazineCapacity: { label: 'Magazine capacity', unit: 'rounds' },
  accuracy: { label: 'Accuracy', unit: 'MOA', digits: 2 },
  muzzleVelocity: { label: 'Muzzle velocity', unit: 'm/s' },
  height: { label: 'Height', unit: 'cells' },
  width: { label: 'Length', unit: 'cells' },
}
const COMPARE_TEXT = { '>=': 'at least', '<=': 'at most', '=': 'exactly' } as const

function openLink(url: string) {
  if (isDesktop()) void window.desktop?.openExternal(url)
  else window.open(url, '_blank', 'noreferrer')
}

/** Gunsmith requirements: base weapon, required parts and categories, stat limits. */
export function BuildCard({ build }: { build: WeaponBuild }) {
  const itemsQuery = useItems()
  const items = itemsQuery.data?.items
  const categories = itemsQuery.data?.categoryNames ?? {}
  const weapon = build.weaponId ? items?.[build.weaponId] : undefined
  return (
    <div className="mt-2 rounded border border-line bg-surface-2 p-2.5 text-xs">
      <div className="mb-2 flex items-center gap-2">
        <Wrench className="h-4 w-4 shrink-0 text-accent" />
        <span className="font-semibold">Build requirements</span>
        {weapon && (
          <span className="ml-auto flex items-center gap-1.5 text-ink-muted">
            {weapon.iconLink && <img src={weapon.iconLink} alt="" className="h-6 max-w-16 object-contain" />}
            {weapon.name}
          </span>
        )}
      </div>
      {build.limits.length > 0 && (
        <table className="mb-2 w-full">
          <tbody>
            {build.limits.map((l) => {
              const meta = STAT_LABEL[l.stat] ?? { label: l.stat }
              return (
                <tr key={l.stat} className="border-t border-line/60 first:border-t-0">
                  <td className="py-0.5 pr-2 text-ink-muted">{meta.label}</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {COMPARE_TEXT[l.compare]} <span className="font-semibold text-ink">{meta.digits ? l.value.toFixed(meta.digits) : l.value}</span>
                    {meta.unit ? ` ${meta.unit}` : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {(build.partIds.length > 0 || build.categoryIds.length > 0) && (
        <div>
          <div className="mb-1 text-ink-muted">Must be fitted</div>
          <ul className="flex flex-wrap gap-1.5">
            {build.partIds.map((id) => {
              const part = items?.[id]
              return (
                <li key={id} className="flex items-center gap-1.5 rounded border border-line bg-surface px-1.5 py-1" title={part?.name}>
                  {part?.iconLink && <img src={part.iconLink} alt="" className="h-6 w-6 object-contain" />}
                  <span className="max-w-44 truncate">{part?.shortName ?? part?.name ?? (itemsQuery.isPending ? '…' : id)}</span>
                </li>
              )
            })}
            {build.categoryIds.map((id) => (
              <li key={id} className="rounded border border-dashed border-line px-1.5 py-1 text-ink-muted">any {categories[id] ?? 'part of this type'}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-dim">Any combination of parts works as long as every limit is met. Example builds with pictures are in the wiki images below.</p>
    </div>
  )
}

export function Lightbox({ images, index, onClose, onIndex }: { images: GuideImage[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const img = images[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onIndex])
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90" onClick={onClose} role="dialog" aria-modal="true" aria-label="Guide image">
      <div className="flex items-center gap-2 px-4 py-2 text-sm text-white/80">
        <span className="min-w-0 flex-1 truncate">{img.section ? `${img.section} · ` : ''}{img.caption || 'Image'}</span>
        <span className="tabular-nums">{index + 1} / {images.length}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-white/10"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-6" onClick={(e) => e.stopPropagation()}>
        <img src={img.full} alt={img.caption} className="max-h-full max-w-full object-contain" />
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => onIndex((index - 1 + images.length) % images.length)} aria-label="Previous" className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" onClick={() => onIndex((index + 1) % images.length)} aria-label="Next" className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/80"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Pictures and written guide for a quest from the EFT Wiki (rooms, item spawns,
 * stash locations, Gunsmith builds), plus tarkov.dev's build requirements.
 */
export function QuestGuide({ task, compact = false }: { task: Task; compact?: boolean }) {
  const guide = useWikiGuide(task.wikiLink)
  const [open, setOpen] = useState<number | null>(null)
  const [showText, setShowText] = useState(false)
  const builds = task.objectives.map((o) => o.build).filter((b): b is WeaponBuild => Boolean(b))
  const images = guide.data?.images ?? []

  return (
    <div className="space-y-2">
      {builds.map((b, i) => (
        <BuildCard key={i} build={b} />
      ))}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Images className="h-3.5 w-3.5 text-accent" />
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Guide images{images.length ? ` (${images.length})` : ''}</h4>
          {guide.data && (
            <button type="button" onClick={() => openLink(guide.data.pageUrl)} className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent underline">
              Wiki page <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
        {guide.isPending && task.wikiLink ? (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading pictures from the wiki…</p>
        ) : guide.isError || !task.wikiLink ? (
          <p className="text-xs text-ink-dim">No wiki pictures available{guide.isError ? ' right now (offline or the wiki is unreachable)' : ''}.</p>
        ) : images.length === 0 ? (
          <p className="text-xs text-ink-dim">The wiki page has no pictures for this quest.</p>
        ) : (
          <ul className={`grid gap-1.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'}`}>
            {images.map((img, i) => (
              <li key={img.full}>
                <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded border border-line bg-surface text-left hover:border-accent">
                  <img src={img.thumb} alt={img.caption} loading="lazy" className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="block truncate px-1.5 py-1 text-[11px] text-ink-muted" title={img.caption}>{img.caption || img.section || 'Picture'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {guide.data && guide.data.guideText.length > 0 && (
          <div className="mt-1.5">
            <button type="button" onClick={() => setShowText((v) => !v)} className="text-xs text-accent underline">{showText ? 'Hide written guide' : 'Read the written guide'}</button>
            {showText && (
              <div className="mt-1 max-h-64 space-y-1 overflow-y-auto rounded border border-line bg-surface p-2 text-xs leading-relaxed text-ink-muted">
                {guide.data.guideText.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
            )}
          </div>
        )}
        {guide.data && <p className="mt-1 text-[10px] text-ink-dim">Pictures and guide text from the Escape from Tarkov Wiki (CC BY-SA 3.0).</p>}
      </div>
      {open !== null && images[open] && <Lightbox images={images} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  )
}
