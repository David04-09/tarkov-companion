import { Suspense, lazy, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAssistantStore } from '../store/assistant'
import { useAssistantListenStore } from '../store/assistantListen'

const AssistantHost = lazy(() => import('./AssistantHost').then((m) => ({ default: m.AssistantHost })))

/**
 * Loads the assistant only once it is wanted (wake word on, its tab opened, or the hotkey
 * pressed), so app start stays as small as before; after that it stays for the session.
 */
export function AssistantGate() {
  const { pathname } = useLocation()
  const wakeWord = useAssistantStore((s) => s.wakeWord)
  const listenRequest = useAssistantListenStore((s) => s.request)
  const [wanted, setWanted] = useState(false)
  if (!wanted && (wakeWord || pathname === '/neural' || listenRequest)) setWanted(true)
  return wanted ? (
    <Suspense fallback={null}>
      <AssistantHost />
    </Suspense>
  ) : null
}
