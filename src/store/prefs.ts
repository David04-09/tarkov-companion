/**
 * App-wide preferences from the Settings page (appearance, general, prices, notifications,
 * maps, scanner). Desktop-only switches that the main process applies (start with Windows,
 * updates, backups kept, …) live in Electron's settings.json instead (see useDesktop).
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEMES = [
  { id: 'tarkov', label: 'Tarkov', note: 'Warm dark, the default', swatch: ['#0c0c0b', '#1c1c19', '#c7a66b'] },
  { id: 'midnight', label: 'Midnight', note: 'Cool blue-grey', swatch: ['#0b0f14', '#18202b', '#6fa8dc'] },
  { id: 'olive', label: 'Olive drab', note: 'Military green', swatch: ['#0d0f0a', '#1b2016', '#a3b86c'] },
  { id: 'oled', label: 'OLED black', note: 'Pure black, saves power on OLED screens', swatch: ['#000000', '#111111', '#d4b277'] },
  { id: 'crimson', label: 'Crimson', note: 'Dark with a red accent', swatch: ['#0f0b0b', '#201717', '#d0645a'] },
  { id: 'daylight', label: 'Daylight', note: 'Light theme for bright rooms', swatch: ['#f4f1ea', '#ffffff', '#8a6a2f'] },
  { id: 'contrast', label: 'High contrast', note: 'Strongest text contrast', swatch: ['#000000', '#141414', '#ffd34d'] },
] as const
export type ThemeId = (typeof THEMES)[number]['id']

export type Density = 'comfortable' | 'compact'
export type TimeFormat = 'system' | '24h' | '12h'
export type NumberStyle = 'comma' | 'space' | 'dot'
/** How an item's worth is judged (scanner keep/sell, crafts, money makers, needs). */
export type PriceSource = 'best' | 'trader' | 'flea'
export type FleaFeeDiscount = 'auto' | 'on' | 'off'
export type ScanTicking = 'needed' | 'sure' | 'none'

export interface Prefs {
  // Appearance
  theme: ThemeId
  /** Text and controls size, percent. */
  uiScale: number
  density: Density
  reduceMotion: boolean
  // General
  landingPage: string
  hiddenTabs: string[]
  sidebarCollapsed: boolean
  timeFormat: TimeFormat
  numberStyle: NumberStyle
  /** 1.2M instead of 1,200,000 in tight places (tables, tiles). */
  compactPrices: boolean
  confirmDangerous: boolean
  // Prices and data
  priceSource: PriceSource
  fleaFeeDiscount: FleaFeeDiscount
  /** Minutes between game data refreshes. */
  dataRefreshMinutes: number
  refreshOnFocus: boolean
  // Notifications
  notifications: boolean
  traderRestockLeadMinutes: number
  storyTimerAlerts: boolean
  raidResultPrompt: boolean
  liveTickToast: boolean
  soundVolume: number
  // Maps
  markerScale: number
  bringBoxOpen: boolean
  questPanelOpen: boolean
  showMapCredits: boolean
  // Scanner
  scanTicking: ScanTicking
  scanApplyMode: 'add' | 'replace'
  scanTint: boolean
  // Desktop behaviour handled in the renderer
  autoSwitchGameMode: boolean
  autoTickFromLogs: boolean
  autoBackup: boolean
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'tarkov',
  uiScale: 100,
  density: 'comfortable',
  reduceMotion: false,
  landingPage: '/',
  hiddenTabs: [],
  sidebarCollapsed: false,
  timeFormat: 'system',
  numberStyle: 'comma',
  compactPrices: false,
  confirmDangerous: true,
  priceSource: 'best',
  fleaFeeDiscount: 'auto',
  dataRefreshMinutes: 60,
  refreshOnFocus: true,
  notifications: true,
  traderRestockLeadMinutes: 2,
  storyTimerAlerts: true,
  raidResultPrompt: true,
  liveTickToast: true,
  soundVolume: 50,
  markerScale: 100,
  bringBoxOpen: true,
  questPanelOpen: true,
  showMapCredits: true,
  scanTicking: 'sure',
  scanApplyMode: 'add',
  scanTint: true,
  autoSwitchGameMode: true,
  autoTickFromLogs: true,
  autoBackup: true,
}

/** Allowed values per field: anything else in storage (old versions, hand edits) falls back to the default. */
const clampNum = (lo: number, hi: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
const oneOf = (...xs: readonly unknown[]) => (v: unknown) => xs.includes(v)
const isBool = (v: unknown) => typeof v === 'boolean'
const VALID: { [K in keyof Prefs]: (v: unknown) => boolean } = {
  theme: oneOf(...THEMES.map((t) => t.id)),
  uiScale: clampNum(80, 140),
  density: oneOf('comfortable', 'compact'),
  reduceMotion: isBool,
  landingPage: (v) => typeof v === 'string' && v.startsWith('/') && v.length < 40,
  hiddenTabs: (v) => Array.isArray(v) && v.length < 40 && v.every((x) => typeof x === 'string'),
  sidebarCollapsed: isBool,
  timeFormat: oneOf('system', '24h', '12h'),
  numberStyle: oneOf('comma', 'space', 'dot'),
  compactPrices: isBool,
  confirmDangerous: isBool,
  priceSource: oneOf('best', 'trader', 'flea'),
  fleaFeeDiscount: oneOf('auto', 'on', 'off'),
  dataRefreshMinutes: clampNum(15, 24 * 60),
  refreshOnFocus: isBool,
  notifications: isBool,
  traderRestockLeadMinutes: clampNum(0, 30),
  storyTimerAlerts: isBool,
  raidResultPrompt: isBool,
  liveTickToast: isBool,
  soundVolume: clampNum(0, 100),
  markerScale: clampNum(60, 200),
  bringBoxOpen: isBool,
  questPanelOpen: isBool,
  showMapCredits: isBool,
  scanTicking: oneOf('needed', 'sure', 'none'),
  scanApplyMode: oneOf('add', 'replace'),
  scanTint: isBool,
  autoSwitchGameMode: isBool,
  autoTickFromLogs: isBool,
  autoBackup: isBool,
}

/** Saved preferences with every invalid or missing field replaced by its default. */
export function cleanPrefs(raw: unknown): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS }
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = (raw as Record<string, unknown>)[key]
    if (v !== undefined && VALID[key](v)) (out as unknown as Record<string, unknown>)[key] = v
  }
  return out
}

interface PrefsState extends Prefs {
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  /** Puts every setting back to its default. */
  resetAll: () => void
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (key, value) => set(VALID[key](value) ? ({ [key]: value } as Partial<PrefsState>) : {}),
      resetAll: () => set({ ...DEFAULT_PREFS }),
    }),
    {
      name: 'tarkov-companion-prefs',
      version: 2,
      partialize: (s) => cleanPrefs(s),
      // v2: the scanner ticks only "Sure" matches by default (v1 also ticked "Likely" ones).
      migrate: (persisted, version) => {
        const p = cleanPrefs(persisted)
        if (version < 2 && p.scanTicking === 'needed') p.scanTicking = 'sure'
        return p
      },
      merge: (persisted, current) => ({ ...current, ...cleanPrefs(persisted) }),
    },
  ),
)

/** Current preferences outside React (formatters, query options). */
export const prefs = (): Prefs => usePrefs.getState()
