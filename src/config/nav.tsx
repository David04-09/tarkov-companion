import { lazy, type ComponentType } from 'react'
import { BarChart3, BookOpen, Megaphone, Coins, Crosshair, Wrench, Hammer, House, KeyRound, LayoutDashboard, Map, Package, ScrollText, Store, type LucideIcon } from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  component: ComponentType
  /** Render edge-to-edge with no page padding (used by the map). */
  fullBleed?: boolean
}

/**
 * Pages load the first time they are opened (each is its own file in the build), so start-up
 * only parses the Dashboard plus the shell; the map, flea market and so on follow on demand.
 */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))

/**
 * The sidebar tabs, in display order. Each entry becomes a route automatically.
 * To add a tab: create a page component and add one line here.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, component: page(() => import('../pages/DashboardPage'), 'DashboardPage') },
  { path: '/quests', label: 'Quests', icon: ScrollText, component: page(() => import('../pages/QuestsPage'), 'QuestsPage') },
  { path: '/story', label: 'Story', icon: BookOpen, component: page(() => import('../pages/StoryPage'), 'StoryPage') },
  { path: '/events', label: 'Events & patches', icon: Megaphone, component: page(() => import('../pages/EventsPage'), 'EventsPage') },
  { path: '/maps', label: 'Maps', icon: Map, component: page(() => import('../pages/MapsPage'), 'MapsPage'), fullBleed: true },
  { path: '/items', label: 'Item Collection', icon: Package, component: page(() => import('../pages/ItemCollectionPage'), 'ItemCollectionPage') },
  { path: '/keys', label: 'Keys', icon: KeyRound, component: page(() => import('../pages/KeysPage'), 'KeysPage') },
  { path: '/hideout', label: 'Hideout', icon: House, component: page(() => import('../pages/HideoutPage'), 'HideoutPage') },
  { path: '/crafts', label: 'Crafts', icon: Hammer, component: page(() => import('../pages/CraftsPage'), 'CraftsPage') },
  { path: '/flea', label: 'Flea Market', icon: Store, component: page(() => import('../pages/FleaMarketPage'), 'FleaMarketPage'), fullBleed: true },
  { path: '/money', label: 'Money makers', icon: Coins, component: page(() => import('../pages/MoneyPage'), 'MoneyPage') },
  { path: '/ammo', label: 'Ammo', icon: Crosshair, component: page(() => import('../pages/AmmoPage'), 'AmmoPage') },
  { path: '/weapons', label: 'Weapon builder', icon: Wrench, component: page(() => import('../pages/WeaponsPage'), 'WeaponsPage') },
  { path: '/stats', label: 'My stats', icon: BarChart3, component: page(() => import('../pages/StatsPage'), 'StatsPage') },
]

/** Tabs shown in the sidebar (Settings → General can hide any except the Dashboard). */
export function visibleNav(hidden: string[]): NavItem[] {
  return NAV_ITEMS.filter((i) => i.path === '/' || !hidden.includes(i.path))
}
