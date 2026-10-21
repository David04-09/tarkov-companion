import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { ImageOff, RotateCw } from 'lucide-react'
import { retryUrl } from '../lib/retryUrl'

/** Waits before each new try (ms). */
const RETRY_DELAYS = [800, 2000, 4000, 8000, 15000]

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string }

/**
 * A wiki picture that keeps trying when it fails to load. The wiki's image server sometimes
 * answers with a bot check or an error instead of the picture (Cloudflare does this to
 * requests without a referrer, so never set no-referrer here); each retry waits a bit longer. After the last
 * try a "Try again" button starts over.
 */
export function WikiImage(props: Props) {
  // A new picture starts over with a fresh count.
  return <RetryingImage key={props.src} {...props} />
}

function RetryingImage({ src, alt, className, ...rest }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!waiting) return
    const t = window.setTimeout(() => {
      setWaiting(false)
      setAttempt((a) => a + 1)
    }, RETRY_DELAYS[attempt] ?? 0)
    return () => window.clearTimeout(t)
  }, [waiting, attempt])

  if (failed) {
    return (
      <span
        role="button"
        tabIndex={0}
        title="The picture did not load. Click to try again."
        onClick={(e) => {
          e.stopPropagation()
          setFailed(false)
          setAttempt(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            e.preventDefault()
            setFailed(false)
            setAttempt(0)
          }
        }}
        className={`${className ?? ''} flex flex-col items-center justify-center gap-1 bg-surface-3 text-[11px] text-ink-dim hover:text-ink`}
      >
        <ImageOff className="h-5 w-5" />
        <span className="inline-flex items-center gap-1"><RotateCw className="h-3 w-3" /> Try again</span>
      </span>
    )
  }

  return (
    <img
      {...rest}
      key={attempt}
      src={retryUrl(src, attempt)}
      alt={alt}
      className={`${className ?? ''}${waiting ? ' invisible' : ''}`}
      onError={(e) => {
        rest.onError?.(e)
        if (attempt < RETRY_DELAYS.length) setWaiting(true)
        else setFailed(true)
      }}
    />
  )
}
