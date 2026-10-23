import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Runs `apply` with a URL search parameter whenever it is given, also while the page is already
 * open ("show quest Debut" on the Quests tab). Voice commands add `t=<time>` so the same request
 * twice still applies.
 */
export function useLinkParam(name: string, apply: (value: string) => void): void {
  const [params] = useSearchParams()
  const value = params.get(name)
  const nonce = params.get('t')
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  })
  useEffect(() => {
    if (value !== null) applyRef.current(value)
  }, [value, nonce])
}
