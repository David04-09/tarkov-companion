/**
 * Key pages on the Escape from Tarkov Wiki (escapefromtarkov.fandom.com, CC BY-SA 3.0):
 * "Lock Location" (where the door is, with screenshots of the door and a marked map) and
 * "Behind the Lock" (the loot list and pictures of the room). Fetched through the public
 * MediaWiki API (`origin=*`) and turned into plain text and image links; no wiki HTML is
 * put into the page.
 */
import { useQuery } from '@tanstack/react-query'
import { WIKI_API, imageUrls, wikiTitle, type GuideImage } from './wikiGuide'

const DAY = 24 * 60 * 60 * 1000

export interface KeyWiki {
  pageUrl: string
  /** Where the lock is, as the wiki describes it. */
  lockText: string[]
  lockImages: GuideImage[]
  /** What is behind the lock, one line per entry ("1x Weapon box (6x2)"). */
  behind: string[]
  behindImages: GuideImage[]
  notes: string[]
}

const textOf = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

type Part = 'lock' | 'behind' | 'notes' | null
function partOf(heading: string): Part {
  if (/lock locations?/i.test(heading)) return 'lock'
  if (/behind the lock/i.test(heading)) return 'behind'
  if (/^notes?$/i.test(heading)) return 'notes'
  return null
}

export function parseKeyWiki(html: string, pageUrl: string): KeyWiki {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root') ?? doc.body
  const out: KeyWiki = { pageUrl, lockText: [], lockImages: [], behind: [], behindImages: [], notes: [] }
  const seen = new Set<string>()
  let part: Part = null

  const addImage = (img: Element, caption: string) => {
    const src = img.getAttribute('data-src') || img.getAttribute('src') || ''
    if (!/^https:\/\/static\.wikia\.nocookie\.net\//.test(src)) return
    const { full, thumb } = imageUrls(src)
    if (seen.has(full)) return
    seen.add(full)
    const image = { full, thumb, caption: caption || img.getAttribute('alt') || '', section: part === 'behind' ? 'Behind the lock' : 'Lock location' }
    if (part === 'behind') out.behindImages.push(image)
    else if (part === 'lock') out.lockImages.push(image)
  }
  const addText = (t: string) => {
    if (t.length < 3) return
    const list = part === 'lock' ? out.lockText : part === 'behind' ? out.behind : out.notes
    if (!list.includes(t)) list.push(t)
  }

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.nextNode() as Element | null; node; node = walker.nextNode() as Element | null) {
    if (node.tagName === 'H2') {
      part = partOf(textOf(node.querySelector('.mw-headline') ?? node).replace(/\[\s*\]$/, ''))
      continue
    }
    if (!part) continue
    // The "Keys & Keycards" navigation box at the bottom lists every key: not part of this one.
    if (node.closest('table, .navbox, aside, .va-navbox-border')) continue
    if (node.matches('li.gallerybox')) {
      const img = node.querySelector('img')
      if (img) addImage(img, textOf(node.querySelector('.gallerytext')))
      continue
    }
    if (node.matches('figure, .thumb')) {
      const img = node.querySelector('img')
      if (img) addImage(img, textOf(node.querySelector('figcaption, .thumbcaption')))
      continue
    }
    if (node.tagName === 'IMG' && !node.closest('li.gallerybox, figure, .thumb')) {
      const width = Number(node.getAttribute('width') || node.getAttribute('data-image-width') || 0)
      if (width >= 200) addImage(node, '')
      continue
    }
    if (node.closest('li.gallerybox, figure, .thumb')) continue
    if (node.tagName === 'LI') {
      // Only the line itself: nested lists become their own entries.
      const clone = node.cloneNode(true) as Element
      clone.querySelectorAll('ul, ol').forEach((l) => l.remove())
      addText(textOf(clone))
    } else if (node.tagName === 'P') {
      addText(textOf(node))
    }
  }
  return out
}

async function fetchKeyWiki(title: string, signal?: AbortSignal): Promise<KeyWiki> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&format=json&formatversion=2&origin=*`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Wiki responded ${res.status}`)
  const json = (await res.json()) as { parse?: { text?: string; title?: string }; error?: { info?: string } }
  if (!json.parse?.text) throw new Error(json.error?.info ?? 'No wiki page for this key')
  const pageTitle = (json.parse.title ?? title).replace(/ /g, '_')
  return parseKeyWiki(json.parse.text, `https://escapefromtarkov.fandom.com/wiki/${encodeURIComponent(pageTitle)}`)
}

/** Wiki details for a key (cached for a week, kept offline with the other data). */
export function useKeyWiki(wikiLink: string | null | undefined, enabled = true) {
  const title = wikiTitle(wikiLink)
  return useQuery({
    queryKey: ['keyWiki', title, 1] as const,
    queryFn: ({ signal }) => fetchKeyWiki(title as string, signal),
    enabled: enabled && Boolean(title),
    staleTime: 7 * DAY,
    gcTime: 30 * DAY,
    retry: 1,
  })
}
