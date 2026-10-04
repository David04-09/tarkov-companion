/**
 * Story chapters (the 1.0 storyline: Tour, Falling Skies, The Ticket, …) and the four
 * endings, read from the Escape from Tarkov Wiki (CC BY-SA 3.0). tarkov.dev has no story
 * data: chapters are a separate system in the game, not tasks.
 *
 * Each chapter page is fetched rendered (MediaWiki `action=parse`, `origin=*`) and split into:
 * how it starts, the objective checklist (in page order, with the branch it belongs to and the
 * endings that branch leads to), the step-by-step guide (one section per `===heading===`),
 * waiting times read from the guide text, and rewards. Guide content is kept as HTML, rebuilt
 * from an allow-list of tags (no scripts, styles or event attributes survive), so tables of
 * quest items, map pictures and notes keep their full detail.
 */
import { useQuery } from '@tanstack/react-query'
import { matchObjectivesToSections, parseWait, type WaitRange } from '../lib/storyTime'
import { WIKI_API, imageUrls, type GuideImage } from './wikiGuide'

const DAY = 24 * 60 * 60 * 1000
/** Bump when the parsed shape or the sanitiser changes, so cached chapters are re-parsed. */
const PARSER_VERSION = 5
const WIKI = 'https://escapefromtarkov.fandom.com/wiki/'

export interface StoryObjective {
  /** Stable id for progress: slug of the text plus its occurrence number. */
  key: string
  text: string
  html: string
  optional: boolean
  /** A decision point ("Keep the case for yourself or hand it over to Prapor"). */
  choice: boolean
  /** 0 = main objective, 1+ = sub-objective. */
  depth: number
  /** Branch heading the objective sits under ("If you refuse Mr. Kerman's offer"), or null. */
  branch: string | null
  /** Endings that branch leads to (Savior, Debtor, Survivor, Fallen). */
  endings: string[]
  /** "Wait for …" step. */
  isWait: boolean
  /** Waiting time from the objective or its guide section, when the wiki gives one. */
  wait: WaitRange | null
  /** Per guide tab: index into that tab's `sections` for this step, or -1. */
  sections: number[]
  note: string | null
}

export interface StorySection {
  heading: string
  html: string
  /** Index range into the chapter's `images` (for the lightbox). */
  imageStart: number
  imageCount: number
  wait: WaitRange | null
  endings: string[]
  /** A branch heading ("If you accept Mr. Kerman's offer…") rather than a step. */
  isBranch: boolean
}

/** The guide; The Ticket has one full walkthrough per ending, other chapters a single tab. */
export interface StoryGuideTab {
  label: string
  ending: string | null
  sections: StorySection[]
}

export interface StoryChapter {
  title: string
  slug: string
  pageUrl: string
  icon: string | null
  banner: string | null
  description: string | null
  /** "Requirements" section: what starts the chapter. */
  startHtml: string | null
  objectives: StoryObjective[]
  guide: StoryGuideTab[]
  rewardsHtml: string | null
  previous: string[]
  leadsTo: string[]
  /** Other chapters this page links to (start conditions, branches). */
  linkedChapters: string[]
  images: GuideImage[]
}

export interface StoryEnding {
  name: string
  icon: string | null
  quote: string | null
  html: string
  rewardsHtml: string | null
}

export interface StoryEndings {
  pageUrl: string
  introHtml: string
  /** Flowchart and other overview pictures. */
  images: GuideImage[]
  endings: StoryEnding[]
}

export interface StoryChapterLink {
  title: string
  icon: string | null
  banner: string | null
}

export const ENDING_NAMES = ['Savior', 'Debtor', 'Survivor', 'Fallen'] as const

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchPageHtml(title: string, signal?: AbortSignal): Promise<{ html: string; title: string }> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&format=json&formatversion=2&origin=*`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Wiki responded ${res.status}`)
  const json = (await res.json()) as { parse?: { text?: string; title?: string }; error?: { info?: string } }
  if (!json.parse?.text) throw new Error(json.error?.info ?? `No wiki page "${title}"`)
  return { html: json.parse.text, title: json.parse.title ?? title }
}

const parseDoc = (html: string) => new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
const textOf = (el: Node | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
export const wikiPageUrl = (title: string) => `${WIKI}${encodeURIComponent(title.replace(/ /g, '_'))}`

function imgSrc(img: Element): string | null {
  const src = img.getAttribute('data-src') || img.getAttribute('src') || ''
  return /^https:\/\/static\.wikia\.nocookie\.net\//.test(src) ? src : null
}

/** "/wiki/The_Ticket#x" -> "The Ticket". */
function wikiTarget(href: string | null): string | null {
  const m = href ? /^\/wiki\/([^?#]+)/.exec(href) : null
  if (!m) return null
  const t = decodeURIComponent(m[1]).replace(/_/g, ' ')
  return /^(File|Category|Special|Template):/i.test(t) ? null : t
}

function endingsIn(el: Element): string[] {
  const found = new Set<string>()
  el.querySelectorAll('[title], img[alt]').forEach((n) => {
    const label = n.getAttribute('title') || n.getAttribute('alt') || ''
    const m = /^(Savior|Debtor|Survivor|Fallen) ending/i.exec(label)
    if (m) found.add(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase())
  })
  return ENDING_NAMES.filter((n) => found.has(n))
}

// ---------------------------------------------------------------------------
// Sanitising: rebuild allowed markup only
// ---------------------------------------------------------------------------

const KEEP = new Set(['P', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'BR', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'H4', 'H5', 'H6', 'DL', 'DD', 'DT', 'SPAN', 'SUP', 'SUB', 'BLOCKQUOTE', 'DIV', 'CODE', 'SMALL', 'CAPTION', 'FIGURE', 'FIGCAPTION', 'U', 'S'])
const DROP = 'script, style, noscript, .mw-editsection, sup.reference, .reference, .navbox, table.va-navbox, .toc, #toc, .mw-empty-elt, aside, table.va-infobox, .info-icon, svg, input, .printfooter, .mw-references-wrap, .references'

interface CleanCtx {
  out: Document
  images: GuideImage[]
  section: string
  seen: Map<string, number>
}

function addImage(ctx: CleanCtx, src: string, caption: string): number {
  const { full, thumb } = imageUrls(src)
  const known = ctx.seen.get(full)
  if (known !== undefined) return known
  ctx.images.push({ full, thumb, caption, section: ctx.section })
  ctx.seen.set(full, ctx.images.length - 1)
  return ctx.images.length - 1
}

function figure(ctx: CleanCtx, img: Element, caption: string): HTMLElement | null {
  const src = imgSrc(img)
  if (!src) return null
  const index = addImage(ctx, src, caption)
  const btn = ctx.out.createElement('button')
  btn.setAttribute('type', 'button')
  btn.setAttribute('class', 'wiki-figure')
  btn.setAttribute('data-img', String(index))
  const im = ctx.out.createElement('img')
  im.setAttribute('src', ctx.images[index].thumb)
  im.setAttribute('alt', caption)
  im.setAttribute('loading', 'lazy')
  btn.appendChild(im)
  if (caption) {
    const cap = ctx.out.createElement('span')
    cap.textContent = caption
    btn.appendChild(cap)
  }
  return btn
}

function cleanNode(node: Node, ctx: CleanCtx): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return ctx.out.createTextNode(node.textContent ?? '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const el = node as Element
  if (el.matches(DROP)) return null

  // Picture galleries and thumbnails become clickable figures (opened in the lightbox).
  if (el.matches('ul.gallery')) {
    const wrap = ctx.out.createElement('div')
    wrap.setAttribute('class', 'wiki-gallery')
    el.querySelectorAll('li.gallerybox').forEach((box) => {
      const img = box.querySelector('img')
      const fig = img && figure(ctx, img, textOf(box.querySelector('.gallerytext')))
      if (fig) wrap.appendChild(fig)
    })
    return wrap.childNodes.length ? wrap : null
  }
  if (el.matches('figure, .thumb')) {
    const img = el.querySelector('img')
    if (!img) return null
    const wrap = ctx.out.createElement('div')
    wrap.setAttribute('class', 'wiki-gallery')
    const fig = figure(ctx, img, textOf(el.querySelector('figcaption, .thumbcaption')) || img.getAttribute('alt') || '')
    if (!fig) return null
    wrap.appendChild(fig)
    return wrap
  }
  if (el.tagName === 'IMG') {
    const src = imgSrc(el)
    if (!src) return null
    const width = Number(el.getAttribute('width') || 0)
    const height = Number(el.getAttribute('height') || 0)
    const alt = el.getAttribute('alt') || ''
    // Screenshots and tall charts (the endings flowchart is 127x300) open in the lightbox.
    if (width >= 200 || height >= 200) {
      const wrap = ctx.out.createElement('div')
      wrap.setAttribute('class', 'wiki-gallery')
      const fig = figure(ctx, el, alt)
      if (fig) wrap.appendChild(fig)
      return wrap
    }
    // Item icons in "Related Quest Items" tables and ending badges.
    const im = ctx.out.createElement('img')
    im.setAttribute('src', imageUrls(src).thumb.replace(/scale-to-width-down\/\d+/, 'scale-to-width-down/96'))
    im.setAttribute('alt', alt)
    im.setAttribute('class', 'wiki-icon')
    im.setAttribute('loading', 'lazy')
    return im
  }
  if (el.tagName === 'A') {
    const target = wikiTarget(el.getAttribute('href'))
    const href = el.getAttribute('href') || ''
    if (!target && !/^https?:\/\//.test(href)) return cleanChildren(el, ctx, ctx.out.createElement('span'))
    if (/^https:\/\/static\.wikia\.nocookie\.net\//.test(href)) return cleanChildren(el, ctx, ctx.out.createElement('span'))
    const a = ctx.out.createElement('a')
    a.setAttribute('href', target ? wikiPageUrl(target) : href)
    if (target) a.setAttribute('data-wiki', target)
    return cleanChildren(el, ctx, a)
  }
  if (el.tagName === 'FONT') {
    const color = (el.getAttribute('color') || '').toLowerCase()
    const span = ctx.out.createElement('span')
    if (color === 'red') span.setAttribute('class', 'wiki-red')
    else if (color === 'green') span.setAttribute('class', 'wiki-green')
    return cleanChildren(el, ctx, span)
  }
  if (el.matches('.custom-quote-wrapper, .custom-quote')) {
    return cleanChildren(el, ctx, ctx.out.createElement('blockquote'))
  }
  // An <li> outside a list (the wiki wraps galleries in one): keep its content only.
  if (el.tagName === 'LI' && !el.parentElement?.matches('ul, ol')) return cleanChildren(el, ctx, ctx.out.createElement('div'))
  if (!KEEP.has(el.tagName)) return cleanChildren(el, ctx, ctx.out.createElement('span'))

  const copy = ctx.out.createElement(el.tagName.toLowerCase())
  for (const attr of ['colspan', 'rowspan']) {
    const v = el.getAttribute(attr)
    if (v && /^\d+$/.test(v)) copy.setAttribute(attr, v)
  }
  if (el.tagName === 'TABLE') {
    // Wide item tables scroll inside their own box instead of widening the page.
    copy.setAttribute('class', 'wiki-table')
    const wrap = ctx.out.createElement('div')
    wrap.setAttribute('class', 'wiki-scroll')
    wrap.appendChild(cleanChildren(el, ctx, copy))
    return wrap
  }
  return cleanChildren(el, ctx, copy)
}

function cleanChildren(from: Element, ctx: CleanCtx, into: HTMLElement): HTMLElement {
  for (const child of Array.from(from.childNodes)) {
    const c = cleanNode(child, ctx)
    if (c) into.appendChild(c)
  }
  return into
}

function cleanNodes(nodes: Node[], ctx: CleanCtx): string {
  const box = ctx.out.createElement('div')
  for (const n of nodes) {
    const c = cleanNode(n, ctx)
    if (c) box.appendChild(c)
  }
  return box.innerHTML.trim()
}

// ---------------------------------------------------------------------------
// Page structure
// ---------------------------------------------------------------------------

interface RawSection {
  title: string
  heading: Element | null
  nodes: Node[]
}

/** Splits the page's top-level nodes at <h2> headings. */
function h2Sections(root: Element): RawSection[] {
  const out: RawSection[] = [{ title: '', heading: null, nodes: [] }]
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'H2') {
      out.push({ title: textOf((node as Element).querySelector('.mw-headline') ?? node), heading: node as Element, nodes: [] })
    } else {
      out[out.length - 1].nodes.push(node)
    }
  }
  return out
}

/** Splits nodes at <h3> headings (the guide's steps). */
function h3Sections(nodes: Node[]): RawSection[] {
  const out: RawSection[] = [{ title: '', heading: null, nodes: [] }]
  for (const node of nodes) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'H3') {
      out.push({ title: textOf((node as Element).querySelector('.mw-headline') ?? node), heading: node as Element, nodes: [] })
    } else {
      out[out.length - 1].nodes.push(node)
    }
  }
  return out
}

function infoboxLinks(root: Element, label: RegExp): string[] {
  const out: string[] = []
  root.querySelectorAll('table.va-infobox td.va-infobox-content').forEach((td) => {
    if (!label.test(textOf(td))) return
    td.querySelectorAll('a[href]').forEach((a) => {
      const t = wikiTarget(a.getAttribute('href'))
      if (t) out.push(t)
    })
  })
  return out
}

function infoboxImage(root: Element, re: RegExp): string | null {
  for (const img of Array.from(root.querySelectorAll('table.va-infobox img'))) {
    const name = img.getAttribute('data-image-name') || img.getAttribute('alt') || ''
    const src = imgSrc(img)
    if (src && re.test(name)) return imageUrls(src).full
  }
  return null
}

/** Objective list in page order; bold paragraphs and <h3>s inside it are branch headings. */
function parseObjectives(nodes: Node[], ctx: CleanCtx): StoryObjective[] {
  const out: StoryObjective[] = []
  const holder = parseDoc('').getElementById('root') as Element
  for (const n of nodes) holder.appendChild(n.cloneNode(true))
  let branch: string | null = null
  let endings: string[] = []
  // Endings of the last <h3> branch: bold sub-branches under it lead to the same endings.
  let headingEndings: string[] = []
  const counts = new Map<string, number>()
  const walker = holder.ownerDocument.createTreeWalker(holder, NodeFilter.SHOW_ELEMENT)
  for (let el = walker.nextNode() as Element | null; el; el = walker.nextNode() as Element | null) {
    if (el.tagName === 'HR') {
      branch = null
      endings = []
      headingEndings = []
      continue
    }
    if (el.tagName === 'H3' || (el.tagName === 'P' && el.querySelector('b') && textOf(el.querySelector('b')).length >= textOf(el).length * 0.6)) {
      const label = textOf(el.querySelector('.mw-headline') ?? el)
      if (label) {
        branch = label
        const own = endingsIn(el)
        if (el.tagName === 'H3') headingEndings = own
        endings = own.length ? own : headingEndings
      }
      continue
    }
    if (el.tagName === 'DD' || el.tagName === 'DT') {
      const last = out[out.length - 1]
      if (last) last.note = [last.note, textOf(el)].filter(Boolean).join(' ')
      continue
    }
    if (el.tagName !== 'LI' || el.closest('.gallery')) continue
    const own = el.cloneNode(true) as Element
    own.querySelectorAll('ul, ol, p, dl, h3').forEach((c) => c.remove())
    const text = textOf(own)
    if (!text) continue
    let depth = 0
    for (let p = el.parentElement; p && p !== holder; p = p.parentElement) if (p.tagName === 'LI') depth++
    const optional = /^\(?optional\)?/i.test(text)
    const choice = Array.from(own.querySelectorAll('b')).some((b) => /^or$/i.test(textOf(b))) || /\bfor yourself or\b/i.test(text)
    const base = slugify(text)
    const nth = (counts.get(base) ?? 0) + 1
    counts.set(base, nth)
    out.push({
      key: nth > 1 ? `${base}#${nth}` : base,
      text,
      // The 'optional' badge says it already.
      html: cleanNodes(Array.from(own.childNodes), ctx).replace(/^\s*\(\s*(?:<i>)?\s*optional\s*(?:<\/i>)?\s*\)\s*/i, ''),
      optional,
      choice,
      depth: Math.min(depth, 2),
      branch,
      endings,
      isWait: /^wait\b/i.test(text),
      wait: parseWait(text),
      sections: [],
      note: null,
    })
  }
  return out
}

/**
 * The guide's nodes, split into tabs when the wiki uses a tabber (The Ticket: one walkthrough
 * per ending, each tab labelled with the ending's icon). Text before the tabber goes first.
 */
function guideTabs(nodes: Node[]): { label: string; ending: string | null; nodes: Node[] }[] {
  const tabberAt = nodes.findIndex((n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).matches('.wds-tabber'))
  if (tabberAt < 0) return nodes.length ? [{ label: '', ending: null, nodes }] : []
  const tabber = nodes[tabberAt] as Element
  const labels = Array.from(tabber.querySelectorAll(':scope > .wds-tabs__wrapper .wds-tabs__tab'))
  const contents = Array.from(tabber.querySelectorAll(':scope > .wds-tab__content'))
  const before = nodes.slice(0, tabberAt).filter((n) => textOf(n))
  const after = nodes.slice(tabberAt + 1)
  return contents.map((content, i) => {
    const ending = labels[i] ? (endingsIn(labels[i])[0] ?? null) : null
    const label = ending ? `${ending} ending` : textOf(labels[i]) || `Path ${i + 1}`
    // Drop the tab's own title table ("Savior ending").
    const body = Array.from(content.childNodes).filter((n) => !(n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'TABLE' && /^\w+ ending$/i.test(textOf(n))))
    return { label, ending, nodes: [...before, ...body, ...after] }
  })
}

/**
 * Fills gaps in the objective → guide-step mapping: a sub-objective without its own step uses its
 * parent's, and a main objective sitting between two objectives of the same or adjacent steps uses
 * the earlier one ("Tell Ragman what you found" belongs to the Ragman step).
 */
function inheritSections(objectives: StoryObjective[], map: number[]): number[] {
  const out = map.slice()
  for (let i = 0; i < out.length; i++) {
    if (out[i] >= 0 || objectives[i].depth === 0) continue
    for (let p = i - 1; p >= 0; p--) {
      if (objectives[p].depth < objectives[i].depth) {
        out[i] = out[p]
        break
      }
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (out[i] >= 0) continue
    let prev = -1
    for (let p = i - 1; p >= 0 && prev < 0; p--) prev = out[p]
    let next = -1
    for (let q = i + 1; q < out.length && next < 0; q++) next = out[q]
    if (prev >= 0 && (next === prev || next === prev + 1 || next < 0)) out[i] = prev
  }
  return out
}

export function parseChapter(html: string, title: string): StoryChapter {
  const doc = parseDoc(html)
  const root = doc.getElementById('root') as Element
  const parser = (root.querySelector('.mw-parser-output') as Element | null) ?? root
  const ctx: CleanCtx = { out: document.implementation.createHTMLDocument(''), images: [], section: '', seen: new Map() }
  const parts = h2Sections(parser)
  const find = (re: RegExp) => parts.find((p) => re.test(p.title))

  const desc = find(/^description$/i)
  const quote = desc && desc.nodes.map((n) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null)).find((e) => e?.matches('.custom-quote-wrapper, .custom-quote'))
  const req = find(/^requirements?$/i)
  ctx.section = 'How it starts'
  const startHtml = req ? cleanNodes(req.nodes, ctx) || null : null

  const objPart = find(/^objectives$/i)
  ctx.section = 'Objectives'
  const objectives = objPart ? parseObjectives(objPart.nodes, ctx) : []

  const guidePart = find(/^guide$/i)
  const guide: StoryGuideTab[] = []
  for (const tab of guideTabs(guidePart?.nodes ?? [])) {
    const sections: StorySection[] = []
    guide.push({ label: tab.label, ending: tab.ending, sections })
    for (const s of h3Sections(tab.nodes)) {
      if (!s.heading && !s.nodes.some((n) => textOf(n))) continue
      ctx.section = s.title || 'Guide'
      const imageStart = ctx.images.length
      const content = cleanNodes(s.nodes, ctx)
      const plain = s.nodes.map((n) => textOf(n)).join(' ')
      const isBranch = /^(if|only if|once|identical for)\b/i.test(s.title)
      sections.push({
        heading: s.title || 'Overview',
        html: content,
        imageStart,
        imageCount: ctx.images.length - imageStart,
        wait: /\bwait/i.test(`${s.title} ${plain}`) ? parseWait(/\bwait/i.test(plain) ? plain : `${s.title} ${plain}`) : null,
        endings: s.heading ? endingsIn(s.heading) : [],
        isBranch,
      })
    }
  }
  const rewards = find(/^rewards?$/i)
  ctx.section = 'Rewards'
  const rewardsHtml = rewards ? cleanNodes(rewards.nodes, ctx) || null : null

  // Which guide step explains each objective (per tab); waits come from there when the objective has none.
  for (const tab of guide) {
    const map = inheritSections(
      objectives,
      matchObjectivesToSections(
        objectives.map((o) => o.text),
        tab.sections.map((s) => (s.isBranch ? '' : s.heading)),
      ),
    )
    objectives.forEach((o, i) => {
      o.sections.push(map[i])
      const s = map[i] >= 0 ? tab.sections[map[i]] : null
      if (o.isWait && !o.wait && s?.wait) o.wait = s.wait
    })
  }

  const linked = new Set<string>()
  for (const p of [req, objPart]) {
    p?.nodes.forEach((n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) return
      ;(n as Element).querySelectorAll('a[href]').forEach((a) => {
        const t = wikiTarget(a.getAttribute('href'))
        if (t) linked.add(t)
      })
    })
  }

  return {
    title,
    slug: slugify(title.replace(/\s*\(story chapter\)/i, '')),
    pageUrl: wikiPageUrl(title),
    icon: infoboxImage(parser, /icon/i),
    banner: infoboxImage(parser, /banner/i),
    description: quote ? textOf(quote) : null,
    startHtml,
    objectives,
    guide,
    rewardsHtml,
    previous: infoboxLinks(parser, /^previous/i),
    leadsTo: infoboxLinks(parser, /^leads to/i),
    linkedChapters: [...linked],
    images: ctx.images,
  }
}

export function parseChapterList(html: string): StoryChapterLink[] {
  const doc = parseDoc(html)
  const out: StoryChapterLink[] = []
  doc.querySelectorAll('table.wikitable tr').forEach((tr) => {
    const cells = tr.querySelectorAll('td')
    if (cells.length < 2) return
    const link = cells[1].querySelector('a[href]')
    const title = wikiTarget(link?.getAttribute('href') ?? null)
    if (!title) return
    const icon = cells[0].querySelector('img')
    const banner = cells[2]?.querySelector('img')
    const iconSrc = icon && imgSrc(icon)
    const bannerSrc = banner && imgSrc(banner)
    out.push({ title, icon: iconSrc ? imageUrls(iconSrc).full : null, banner: bannerSrc ? imageUrls(bannerSrc).full : null })
  })
  return out
}

export function parseEndings(html: string): StoryEndings {
  const doc = parseDoc(html)
  const root = doc.getElementById('root') as Element
  const parser = (root.querySelector('.mw-parser-output') as Element | null) ?? root
  const ctx: CleanCtx = { out: document.implementation.createHTMLDocument(''), images: [], section: 'Endings', seen: new Map() }
  const parts = h2Sections(parser)
  const intro = parts.filter((p) => !ENDING_NAMES.some((n) => n.toLowerCase() === p.title.toLowerCase()))
  const introHtml = cleanNodes(intro.flatMap((p) => (p.heading ? [] : p.nodes)), ctx)
  // "Image Guides" and the like: overview pictures (flowchart).
  for (const p of intro.filter((x) => x.heading)) cleanNodes(p.nodes, { ...ctx, section: p.title })
  const endings: StoryEnding[] = []
  for (const name of ENDING_NAMES) {
    const p = parts.find((x) => x.title.toLowerCase() === name.toLowerCase())
    if (!p) continue
    ctx.section = name
    const sub = h3Sections(p.nodes)
    const iconImg = p.nodes
      .map((n) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element).querySelector('img') : null))
      .find((img) => img && /icon/i.test(img.getAttribute('alt') || ''))
    const quote = p.nodes.map((n) => (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : null)).find((e) => e?.matches('.custom-quote-wrapper, .custom-quote'))
    const bodyNodes = sub[0].nodes.filter((n) => !(n.nodeType === Node.ELEMENT_NODE && (n as Element).matches('figure, .custom-quote-wrapper')))
    const rewards = sub.find((s) => /rewards?/i.test(s.title))
    const iconSrc = iconImg ? imgSrc(iconImg) : null
    endings.push({
      name,
      icon: iconSrc ? imageUrls(iconSrc).full : null,
      quote: quote ? textOf(quote) : null,
      html: cleanNodes(bodyNodes, ctx),
      rewardsHtml: rewards ? cleanNodes(rewards.nodes, ctx) : null,
    })
  }
  return { pageUrl: wikiPageUrl('Endings'), introHtml, images: ctx.images, endings }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface StoryData {
  chapters: StoryChapter[]
  /** Chapters whose page failed to load (shown with a link instead). */
  missing: StoryChapterLink[]
  endings: StoryEndings | null
  fetchedAt: number
}

export async function fetchStory(signal?: AbortSignal): Promise<StoryData> {
  const list = parseChapterList((await fetchPageHtml('Story_chapters', signal)).html)
  if (!list.length) throw new Error('The wiki chapter list is empty')
  const results = await Promise.allSettled(list.map((c) => fetchPageHtml(c.title, signal)))
  const chapters: StoryChapter[] = []
  const missing: StoryChapterLink[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const ch = parseChapter(r.value.html, list[i].title)
      chapters.push({ ...ch, icon: ch.icon ?? list[i].icon, banner: ch.banner ?? list[i].banner })
    } else missing.push(list[i])
  })
  let endings: StoryEndings | null = null
  try {
    endings = parseEndings((await fetchPageHtml('Endings', signal)).html)
  } catch {
    endings = null
  }
  return { chapters, missing, endings, fetchedAt: Date.now() }
}

/** All chapters and the endings; cached for 3 days and kept offline by the query persister. */
export function useStory() {
  return useQuery({
    queryKey: ['story', PARSER_VERSION] as const,
    queryFn: ({ signal }) => fetchStory(signal),
    staleTime: 3 * DAY,
    gcTime: 30 * DAY,
    retry: 1,
  })
}
