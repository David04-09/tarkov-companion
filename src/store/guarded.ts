/**
 * Safety net for saved stores (localStorage): each saved field is only used when it has the
 * expected shape, otherwise the default stays. A damaged or hand-edited save then loses that
 * one field instead of crashing the app on start, and a future version bump keeps the data
 * (zustand drops saved state on a version change unless there is a migrate function).
 */
type Check = 'array' | 'object' | 'number' | 'boolean' | 'string' | ((value: unknown) => unknown)

function passes(check: Check, v: unknown): { ok: boolean; value?: unknown } {
  if (typeof check === 'function') {
    const value = check(v)
    return value === undefined || value === null ? { ok: false } : { ok: true, value }
  }
  if (check === 'array') return { ok: Array.isArray(v), value: v }
  if (check === 'object') return { ok: typeof v === 'object' && v !== null && !Array.isArray(v), value: v }
  if (check === 'number') return { ok: typeof v === 'number' && Number.isFinite(v), value: v }
  return { ok: typeof v === check, value: v }
}

export function guarded<S>(checks: Partial<Record<keyof S, Check>>) {
  return {
    migrate: (persisted: unknown) => persisted as S,
    merge: (persisted: unknown, current: S): S => {
      if (typeof persisted !== 'object' || persisted === null) return current
      const out = { ...current }
      for (const [key, check] of Object.entries(checks) as [keyof S, Check][]) {
        const v = (persisted as Record<string, unknown>)[key as string]
        if (v === undefined) continue
        const r = passes(check, v)
        if (r.ok) out[key] = r.value as S[keyof S]
      }
      return out
    },
  }
}
