/**
 * The progress file: everything the app keeps about you, in one JSON document. Used by
 * Settings → Export/Import and by the daily automatic backups (desktop), so both always
 * contain the same things.
 */
import type { GameMode } from '../api/client'
import { useAssistantMemory } from '../store/assistantMemory'
import { parseDrawings, useDrawingsStore } from '../store/drawings'
import { useInventoryStore, type ModeInventory } from '../store/inventory'
import { useProgressStore } from '../store/progress'
import { useRaidLogStore, type ManualRaid, type RaidEntry } from '../store/raidLog'
import { parseStory, useStoryStore } from '../store/story'

export function buildProgressFile() {
  const raid = useRaidLogStore.getState()
  return {
    ...useProgressStore.getState().exportProgress(),
    inventory: useInventoryStore.getState().byMode,
    drawings: useDrawingsStore.getState().byKey,
    story: useStoryStore.getState().byMode,
    raidLog: raid.byMode,
    raidLogManual: raid.manual,
    raidLogHidden: raid.hidden,
    assistantMemory: assistantMemory(),
  }
}

/** What the assistant learned about you (notes, words, habits, answer style). */
function assistantMemory() {
  const m = useAssistantMemory.getState()
  return { learning: m.learning, notes: m.notes, words: m.words, habits: m.habits, style: m.style }
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Restores a progress file (export or backup). Returns what was restored, for the message. Throws on an invalid file. */
export function importProgressFile(parsed: unknown): string[] {
  useProgressStore.getState().importProgress(parsed)
  const p = parsed as Record<string, unknown>
  const restored = ['quests']
  if (isObj(p.inventory)) {
    const inv = p.inventory as Partial<Record<GameMode, Partial<ModeInventory>>>
    useInventoryStore.setState((s) => ({
      byMode: {
        regular: { ...s.byMode.regular, ...(isObj(inv.regular) ? inv.regular : {}) },
        pve: { ...s.byMode.pve, ...(isObj(inv.pve) ? inv.pve : {}) },
      },
    }))
    restored.push('item collection, keys and hideout')
  }
  const drawings = parseDrawings(p.drawings)
  if (drawings) {
    useDrawingsStore.getState().importAll(drawings)
    restored.push('map drawings')
  }
  const story = parseStory(p.story)
  if (story) {
    useStoryStore.getState().importAll(story)
    restored.push('story chapters')
  }
  if (isObj(p.raidLog)) {
    const r = p.raidLog as Partial<Record<GameMode, Record<string, RaidEntry>>>
    const m = (isObj(p.raidLogManual) ? p.raidLogManual : {}) as Partial<Record<GameMode, ManualRaid[]>>
    const h = (isObj(p.raidLogHidden) ? p.raidLogHidden : {}) as Partial<Record<GameMode, string[]>>
    useRaidLogStore.getState().importAll(
      { regular: r.regular ?? {}, pve: r.pve ?? {} },
      { regular: Array.isArray(m.regular) ? m.regular : [], pve: Array.isArray(m.pve) ? m.pve : [] },
      { regular: Array.isArray(h.regular) ? h.regular : [], pve: Array.isArray(h.pve) ? h.pve : [] },
    )
    restored.push('raid log')
  }
  if (isObj(p.assistantMemory)) {
    // Same checks as loading it from this PC: damaged parts are left out.
    const merge = useAssistantMemory.persist.getOptions().merge
    if (merge) useAssistantMemory.setState(merge(p.assistantMemory, useAssistantMemory.getState()))
    restored.push("the assistant's memory")
  }
  return restored
}

/** Files you import are untrusted: refuse huge ones and drop keys that could tamper with objects. */
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
export function parseImportJson(text: string): unknown {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('that file is too large')
  return JSON.parse(text, (key, value: unknown) => (BLOCKED_KEYS.has(key) ? undefined : value))
}
