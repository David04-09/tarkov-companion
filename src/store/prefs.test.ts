import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, cleanPrefs } from './prefs'
import { guarded } from './guarded'
import { parseImportJson } from '../lib/progressFile'

describe('saved preferences', () => {
  it('falls back to defaults for missing or invalid values', () => {
    const p = cleanPrefs({ theme: 'neon', uiScale: 999, density: 'compact', hiddenTabs: '/maps', soundVolume: 30, extra: 1 })
    expect(p.theme).toBe(DEFAULT_PREFS.theme)
    expect(p.uiScale).toBe(DEFAULT_PREFS.uiScale)
    expect(p.density).toBe('compact')
    expect(p.hiddenTabs).toEqual([])
    expect(p.soundVolume).toBe(30)
    expect('extra' in p).toBe(false)
  })

  it('survives garbage', () => {
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS)
    expect(cleanPrefs('x')).toEqual(DEFAULT_PREFS)
  })
})

describe('guarded stores', () => {
  const g = guarded<{ list: string[]; flag: boolean; n: number | null }>({ list: 'array', flag: 'boolean', n: 'number' })
  const current = { list: [], flag: false, n: null }
  it('takes well-shaped fields and keeps defaults for the rest', () => {
    expect(g.merge({ list: ['a'], flag: 'yes', n: 3 }, current)).toEqual({ list: ['a'], flag: false, n: 3 })
    expect(g.merge(null, current)).toEqual(current)
  })
})

describe('imported files', () => {
  it('drops keys that could tamper with objects', () => {
    const v = parseImportJson('{"a":1,"__proto__":{"polluted":true},"b":{"constructor":{"x":1},"c":2}}') as Record<string, unknown>
    expect(v).toEqual({ a: 1, b: { c: 2 } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('refuses huge files', () => {
    expect(() => parseImportJson(' '.repeat(21 * 1024 * 1024))).toThrow(/too large/)
  })
})
