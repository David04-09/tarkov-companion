import type { MouseEvent } from 'react'
import { openLink } from './storyUtils'

/**
 * Wiki content that `api/storyWiki.ts` already rebuilt from an allow-list of tags.
 * Clicking a picture opens the lightbox; a link to another chapter switches to it,
 * any other link opens in the browser.
 */
export function RichHtml({
  html,
  className = '',
  onImage,
  onChapter,
}: {
  html: string
  className?: string
  onImage?: (index: number) => void
  /** Returns true when the title was a chapter and was opened. */
  onChapter?: (title: string) => boolean
}) {
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const fig = target.closest<HTMLElement>('[data-img]')
    if (fig && onImage) {
      e.preventDefault()
      onImage(Number(fig.dataset.img))
      return
    }
    const a = target.closest<HTMLAnchorElement>('a[href]')
    if (!a) return
    e.preventDefault()
    const wiki = a.dataset.wiki
    if (wiki && onChapter?.(wiki)) return
    openLink(a.href)
  }
  // eslint-disable-next-line react/no-danger -- sanitised in storyWiki.ts (allow-list rebuild)
  return <div className={`wiki-content ${className}`} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
