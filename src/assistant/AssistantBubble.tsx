import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Brain, Mic } from 'lucide-react'
import { useAssistantChat } from '../store/assistantChat'

/** How long the last answer stays on other tabs once the conversation has ended. */
const SHOW_MS = 20_000

/**
 * On every tab but the Neural network one: a small strip with what the assistant heard and its
 * last answer, while you talk to it by wake word or hotkey (the full chat stays on its tab).
 */
export function AssistantBubble() {
  const { pathname } = useLocation()
  const talking = useAssistantChat((s) => s.talking)
  const listen = useAssistantChat((s) => s.listen)
  const lastAnswer = useAssistantChat((s) => [...s.messages].reverse().find((m) => m.from === 'assistant'))
  // The answer whose time on screen is over (one timer per answer, none while nothing is shown).
  const [expiredId, setExpiredId] = useState<number | null>(null)
  const recent = !!lastAnswer && expiredId !== lastAnswer.id
  useEffect(() => {
    if (!lastAnswer || talking) return
    const t = window.setTimeout(() => setExpiredId(lastAnswer.id), Math.max(0, lastAnswer.at + SHOW_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [lastAnswer, talking])

  const hearing = listen.state === 'listening'
  if (pathname === '/neural' || !(talking || hearing || recent)) return null
  return (
    <div role="status" aria-label="Assistant" className="fixed bottom-4 left-1/2 z-[64] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-accent/50 bg-surface-2/95 px-3 py-2 text-sm shadow-xl">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {hearing ? <Mic className="h-3.5 w-3.5 animate-pulse text-accent" /> : <Brain className="h-3.5 w-3.5 text-accent" />}
        <span className="min-w-0 flex-1 truncate">{hearing ? `Heard: ${listen.detail ?? '…'}` : talking ? 'Listening for your next question' : 'Assistant'}</span>
        <Link to="/neural" className="shrink-0 text-accent underline">Open</Link>
      </div>
      {lastAnswer && (talking || recent) && <p className="mt-1 line-clamp-3">{lastAnswer.text}</p>}
    </div>
  )
}
