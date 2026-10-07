/**
 * Events and patch notes from the Escape from Tarkov Wiki (escapefromtarkov.fandom.com,
 * CC BY-SA 3.0), read through the public MediaWiki API (`origin=*`). Only plain text and image
 * links are kept; no wiki HTML is put into the page.
 *
 * Events page: one <h2> per event, newest first. The wiki marks where past events begin with a
 * single "This section describes past events." banner: events above it are current. When the
 * banner is missing, nothing is called current (the page then only lists the latest events).
 *
 * Changelog page: one <h2> per patch ("1.2.0.0.47888 (6 October 2026)"), with <h3> parts such as
 * "Fixes". These are Battlestate's official patch notes as copied by the wiki.
 */
import { useQuery } from '@tanstack/react-query'
import { WIKI_API, imageUrls } from './wikiGuide'

const HOUR = 60 * 60 * 1000
const WIKI = 'https://escapefromtarkov.fandom.com/wiki/'

export interface NewsBlock {
  /** Sub-heading ("Gameplay Changes", "Fixes", …), or '' for text before any heading. */
  heading: string
  /** Paragraphs and list items, plain text. */
  lines: string[]
}

export interface WikiEvent {
  title: string
  /** Start date from the heading "(8 September 2026)", ms; null if it has none. */
  start: number | null
  current: boolean
  blocks: NewsBlock[]
  image: { full: string; thumb: string } | null
  url: string
}

export interface EventsDoc {
  events: WikiEvent[]
  /** False when the wiki's "past events" banner was not found: nothing can be called current. */
  knowsCurrent: boolean
}

export interface PatchNotes {
  version: string
  date: number | null
  blocks: NewsBlock[]
  url: string
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').replace(/\[\s*\]/g, '').trim()

/** "Shifting Balance (8 September 2026)" -> { name, date }. */
export function splitTitle(raw: string): { name: string; date: number | null } {
  const m = /^(.*?)\s*\(([^()]*\d{4})\)\s*$/.exec(raw)
  if (!m) return { name: raw, date: null }
  const t = Date.parse(m[2].replace(/^(\d+)-\d+\s/, '$1 '))
  return { name: m[1], date: Number.isFinite(t) ? t : null }
}

/** Collects paragraphs / list items under (sub)headings, from `nodes` in order. */
function collectBlocks(nodes: Element[]): NewsBlock[] {
  const blocks: NewsBlock[] = []
  let current: NewsBlock = { heading: '', lines: [] }
  // Heading path by level (h3, h4, h5…): "Customs · Fixes" instead of a bare "Fixes".
  const path: string[] = []
  const push = () => {
    if (current.lines.length || current.heading) blocks.push(current)
  }
  const visit = (el: Element) => {
    const tag = el.tagName
    if (/^H[3-6]$/.test(tag)) {
      push()
      const depth = Number(tag[1]) - 3
      path.length = depth
      path[depth] = textOf(el.querySelector('.mw-headline') ?? el)
      current = { heading: path.filter(Boolean).slice(-2).join(' · '), lines: [] }
      return
    }
    if (el.matches('table, .navbox, aside, figure, .gallery, li.gallerybox, script, style')) return
    if (tag === 'P') {
      // A paragraph that is only bold text works as a heading on the wiki ("Gameplay Changes").
      const bold = el.children.length === 1 && el.children[0].tagName === 'B' && textOf(el) === textOf(el.children[0])
      if (bold) {
        push()
        current = { heading: textOf(el), lines: [] }
      } else if (textOf(el)) current.lines.push(textOf(el))
      return
    }
    if (tag === 'UL' || tag === 'OL') {
      for (const li of Array.from(el.children)) {
        if (li.tagName !== 'LI' || li.matches('.gallerybox')) continue
        const clone = li.cloneNode(true) as Element
        clone.querySelectorAll('ul, ol').forEach((n) => n.remove())
        const t = textOf(clone)
        if (t) current.lines.push(t)
        li.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach((sub) => {
          const st = textOf(sub)
          if (st) current.lines.push(`– ${st}`)
        })
      }
      return
    }
    for (const child of Array.from(el.children)) visit(child)
  }
  for (const n of nodes) visit(n)
  push()
  return blocks
}

function firstImage(nodes: Element[]): { full: string; thumb: string } | null {
  for (const n of nodes) {
    for (const img of Array.from(n.querySelectorAll('img'))) {
      const src = img.getAttribute('data-src') || img.getAttribute('src') || ''
      const width = Number(img.getAttribute('width') || 0)
      if (/^https:\/\/static\.wikia\.nocookie\.net\//.test(src) && width >= 150 && !/icon/i.test(img.getAttribute('data-image-name') ?? '')) return imageUrls(src)
    }
  }
  return null
}

function rootOf(html: string): Element {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root') as Element
  return root.querySelector('.mw-parser-output') ?? root
}

const anchor = (title: string) => encodeURIComponent(title.replace(/ /g, '_'))

export function parseEvents(html: string): EventsDoc {
  const root = rootOf(html)
  const events: WikiEvent[] = []
  let past = false
  let knowsCurrent = false
  let open: { title: string; nodes: Element[]; past: boolean } | null = null
  const close = () => {
    if (!open) return
    const { name, date } = splitTitle(open.title)
    events.push({ title: name, start: date, current: !open.past, blocks: collectBlocks(open.nodes), image: firstImage(open.nodes), url: `${WIKI}Events#${anchor(open.title)}` })
    open = null
  }
  for (const node of Array.from(root.children)) {
    if (node.tagName === 'H2') {
      close()
      open = { title: textOf(node.querySelector('.mw-headline') ?? node), nodes: [], past }
      continue
    }
    if (/This section describes past events/i.test(node.textContent ?? '')) {
      // Everything after this banner is history.
      past = true
      knowsCurrent = true
      continue
    }
    open?.nodes.push(node)
  }
  close()
  if (!knowsCurrent) for (const e of events) e.current = false
  return { events, knowsCurrent }
}

export function parsePatch(html: string, sectionTitle: string): PatchNotes {
  const root = rootOf(html)
  const nodes = Array.from(root.children).filter((n) => n.tagName !== 'H2')
  const { name, date } = splitTitle(sectionTitle)
  return { version: name, date, blocks: collectBlocks(nodes), url: `${WIKI}Changelog#${anchor(sectionTitle)}` }
}

async function wikiJson<T>(params: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${WIKI_API}?${params}&format=json&formatversion=2&origin=*`, { signal })
  if (!res.ok) throw new Error(`Wiki responded ${res.status}`)
  return (await res.json()) as T
}

async function fetchEvents(signal?: AbortSignal): Promise<EventsDoc> {
  const json = await wikiJson<{ parse?: { text?: string } }>('action=parse&page=Events&prop=text&redirects=1', signal)
  if (!json.parse?.text) throw new Error('The wiki Events page could not be read')
  const doc = parseEvents(json.parse.text)
  // Current events plus the latest few past ones are plenty.
  const current = doc.events.filter((e) => e.current)
  const recent = doc.events.filter((e) => !e.current).slice(0, 6)
  return { events: [...current, ...recent], knowsCurrent: doc.knowsCurrent }
}

/** The newest `count` patches from the wiki Changelog (same-named duplicates merged). */
async function fetchPatches(count: number, signal?: AbortSignal): Promise<PatchNotes[]> {
  const toc = await wikiJson<{ parse?: { sections?: { index: string; level: string; line: string }[] } }>('action=parse&page=Changelog&prop=sections&redirects=1', signal)
  const patches = (toc.parse?.sections ?? []).filter((s) => s.level === '2')
  const picked: { index: string; line: string }[] = []
  for (const s of patches) {
    if (picked.length >= count + 2) break
    picked.push(s)
  }
  const notes = await Promise.all(
    picked.map(async (s) => {
      const json = await wikiJson<{ parse?: { text?: string } }>(`action=parse&page=Changelog&prop=text&section=${encodeURIComponent(s.index)}&redirects=1`, signal)
      return parsePatch(json.parse?.text ?? '', s.line.replace(/<[^>]+>/g, ''))
    }),
  )
  const merged: PatchNotes[] = []
  for (const n of notes) {
    const same = merged.find((m) => m.version === n.version && m.date === n.date)
    if (same) same.blocks.push(...n.blocks.filter((b) => !same.blocks.some((x) => x.heading === b.heading && x.lines.join() === b.lines.join())))
    else merged.push(n)
  }
  return merged.slice(0, count)
}

/** Current and recent events (refreshed every 3 hours). */
export function useWikiEvents() {
  return useQuery({ queryKey: ['wikiEvents', 1] as const, queryFn: ({ signal }) => fetchEvents(signal), staleTime: 3 * HOUR, refetchInterval: 3 * HOUR, retry: 1 })
}

/** Latest official patch notes (refreshed every 3 hours). */
export function usePatchNotes(count = 3) {
  return useQuery({ queryKey: ['patchNotes', count, 1] as const, queryFn: ({ signal }) => fetchPatches(count, signal), staleTime: 3 * HOUR, refetchInterval: 3 * HOUR, retry: 1 })
}
