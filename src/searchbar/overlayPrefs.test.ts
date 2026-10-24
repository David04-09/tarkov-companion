import { describe, expect, it } from 'vitest'
import { cleanOverlayPrefs, DEFAULT_PREFS } from './overlayPrefs'

describe('cleanOverlayPrefs', () => {
  it('fills everything from the defaults when nothing is saved', () => {
    expect(cleanOverlayPrefs(undefined)).toEqual(DEFAULT_PREFS)
    expect(cleanOverlayPrefs('garbage')).toEqual(DEFAULT_PREFS)
  })
  it('clamps numbers into their ranges and rounds them', () => {
    const p = cleanOverlayPrefs({ idle: 2, map: 500, scale: 133.4, mapW: 99999, mapH: -5, lootMin: Number.NaN, markerScale: 'big' })
    expect(p.idle).toBe(10)
    expect(p.map).toBe(100)
    expect(p.scale).toBe(133)
    expect(p.mapW).toBe(900)
    expect(p.mapH).toBe(180)
    expect(p.lootMin).toBe(DEFAULT_PREFS.lootMin)
    expect(p.markerScale).toBe(DEFAULT_PREFS.markerScale)
  })
  it('keeps known layers and tabs only', () => {
    const p = cleanOverlayPrefs({ layers: { bosses: true, nonsense: true, quests: 'yes' }, tab: 'hacker', extractSide: 'pmc' })
    expect(p.layers.bosses).toBe(true)
    expect(p.layers.quests).toBe(DEFAULT_PREFS.layers.quests)
    expect('nonsense' in p.layers).toBe(false)
    expect(p.tab).toBe('quests')
    expect(p.extractSide).toBe('pmc')
  })
  it('keeps well-formed starred and recent entries, trimmed', () => {
    const p = cleanOverlayPrefs({
      stars: [{ kind: 'item', id: 'a', label: 'GPU' }, { kind: 'evil', id: 'b', label: 'x' }, { kind: 'quest', id: 5, label: 'y' }, null],
      recent: Array.from({ length: 30 }, (_, i) => ({ kind: 'map', id: `m${i}`, label: 'Map' })),
      lastMapKey: '../../etc',
    })
    expect(p.stars).toEqual([{ kind: 'item', id: 'a', label: 'GPU' }])
    expect(p.recent).toHaveLength(10)
    expect(p.lastMapKey).toBeNull()
  })
})
