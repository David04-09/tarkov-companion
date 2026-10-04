/**
 * Quest guide material from the Escape from Tarkov Wiki (escapefromtarkov.fandom.com,
 * content CC BY-SA 3.0): the captioned screenshots of rooms, item spawns and builds,
 * plus the written "Guide" section. Fetched through the public MediaWiki API, which
 * allows cross-origin reads with `origin=*`.
 */
import { useQuery } from '@tanstack/react-query'

const API = 'https://escapefromtarkov.fandom.com/api.php'
const DAY = 24 * 60 * 60 * 1000

export interface GuideImage {
  /** Full-size image. */
  full: string
  /** ~480 px wide thumbnail. */
  thumb: string
  caption: string
  /** Wiki section the image sits in ("Guide", "Builds", ...). */
  section: string
}

export interface WikiGuide {
  pageUrl: string
  images: GuideImage[]
  /** Paragraphs / bullet points from the "Guide" section, plain text. */
  guideText: string[]
}

/** "https://escapefromtarkov.fandom.com/wiki/Gunsmith_-_M4A1" -> "Gunsmith_-_M4A1". */
export function wikiTitle(wikiLink: string | null | undefined): string | null {
  if (!wikiLink) return null
  const m = /\/wiki\/([^?#]+)/.exec(wikiLink)
  return m ? decodeURIComponent(m[1]) : null
}

/** Fandom image URLs carry a size step; strip it for full size, set it for the thumbnail. */
export function imageUrls(src: string): { full: string; thumb: string } {
  const clean = src.replace(/\/scale-to-width-down\/\d+/, '').replace(/\/smart\/width\/\d+\/height\/\d+/, '')
  const [base, query] = clean.split('?')
  const thumb = base.endsWith('/revision/latest') ? `${base}/scale-to-width-down/480${query ? `?${query}` : ''}` : clean
  return { full: clean, thumb }
}

const SKIP_SECTIONS = /^(dialogue|rewards|requirements|contents|navigation|references|trivia)$/i
const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

export function parseWikiGuide(html: string, pageUrl: string): WikiGuide {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  const images: GuideImage[] = []
  const seen = new Set<string>()
  const guideText: string[] = []
  let section = ''

  const add = (img: HTMLImageElement, caption: string) => {
    const src = img.getAttribute('data-src') || img.getAttribute('src') || ''
    if (!/^https:\/\/static\.wikia\.nocookie\.net\//.test(src)) return
    const { full, thumb } = imageUrls(src)
    if (seen.has(full)) return
    // Quest banners and item icons are decoration, not guide pictures.
    const fileName = decodeURIComponent(full.split('/images/')[1] ?? '')
    if (/banner|icon/i.test(`${fileName} ${img.alt}`)) return
    seen.add(full)
    images.push({ full, thumb, caption: caption || textOf(img.closest('a')) || img.alt || '', section })
  }

  // Walk the page in order so every image knows its section.
  const walker = doc.createTreeWalker(root ?? doc.body, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
    if (node.tagName === 'H2' || node.tagName === 'H3') {
      if (node.tagName === 'H2') section = textOf(node.querySelector('.mw-headline') ?? node).replace(/\[\]$/, '')
      continue
    }
    if (SKIP_SECTIONS.test(section)) continue
    if (node.matches('li.gallerybox')) {
      const img = node.querySelector('img')
      if (img) add(img, textOf(node.querySelector('.gallerytext')))
      continue
    }
    if (node.matches('figure, .thumb')) {
      const img = node.querySelector('img')
      if (img) add(img, textOf(node.querySelector('figcaption, .thumbcaption')))
      continue
    }
    if (node.tagName === 'IMG' && !node.closest('li.gallerybox, figure, .thumb, table.va-navbox, .navbox, .infobox, aside')) {
      // Loose images: keep the big ones (screenshots), skip item icons.
      const width = Number(node.getAttribute('width') || node.getAttribute('data-image-width') || 0)
      if (width >= 250) add(node as HTMLImageElement, '')
      continue
    }
    if (/^guide$/i.test(section) && (node.tagName === 'P' || node.tagName === 'LI') && !node.closest('li.gallerybox, table')) {
      const t = textOf(node)
      if (t.length > 2) guideText.push(t)
    }
  }
  return { pageUrl, images, guideText }
}

export const WIKI_API = API

async function fetchWikiGuide(title: string, signal?: AbortSignal): Promise<WikiGuide> {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&format=json&formatversion=2&origin=*`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Wiki responded ${res.status}`)
  const json = (await res.json()) as { parse?: { text?: string; title?: string }; error?: { info?: string } }
  if (!json.parse?.text) throw new Error(json.error?.info ?? 'No wiki page for this quest')
  const pageTitle = (json.parse.title ?? title).replace(/ /g, '_')
  return parseWikiGuide(json.parse.text, `https://escapefromtarkov.fandom.com/wiki/${encodeURIComponent(pageTitle)}`)
}

/** Wiki guide for a quest; cached for a week (and kept offline by the query persister). */
export function useWikiGuide(wikiLink: string | null | undefined, enabled = true) {
  const title = wikiTitle(wikiLink)
  return useQuery({
    queryKey: ['wikiGuide', title] as const,
    queryFn: ({ signal }) => fetchWikiGuide(title as string, signal),
    enabled: enabled && Boolean(title),
    staleTime: 7 * DAY,
    gcTime: 30 * DAY,
    retry: 1,
  })
}
