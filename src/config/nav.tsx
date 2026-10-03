import type { ComponentType } from 'react'
import { Hammer, House, KeyRound, LayoutDashboard, Map, Package, ScrollText, Store, type LucideIcon } from 'lucide-react'
import { CraftsPage } from '../pages/CraftsPage'
import { DashboardPage } from '../pages/DashboardPage'
import { HideoutPage } from '../pages/HideoutPage'
import { ItemCollectionPage } from '../pages/ItemCollectionPage'
import { KeysPage } from '../pages/KeysPage'
import { MapsPage } from '../pages/MapsPage'
import { QuestsPage } from '../pages/QuestsPage'
import { FleaMarketPage } from '../pages/FleaMarketPage'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  component: ComponentType
  /** Render edge-to-edge with no page padding (used by the map). */
  fullBleed?: boolean
}

/**
 * The sidebar tabs, in display order. Each entry becomes a route automatically.
 * To add a tab: create a page component and add one line here.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, component: DashboardPage },
  { path: '/quests', label: 'Quests', icon: ScrollText, component: QuestsPage },
  { path: '/maps', label: 'Maps', icon: Map, component: MapsPage, fullBleed: true },
  { path: '/items', label: 'Item Collection', icon: Package, component: ItemCollectionPage },
  { path: '/keys', label: 'Keys', icon: KeyRound, component: KeysPage },
  { path: '/hideout', label: 'Hideout', icon: House, component: HideoutPage },
  { path: '/crafts', label: 'Crafts', icon: Hammer, component: CraftsPage },
  { path: '/flea', label: 'Flea Market', icon: Store, component: FleaMarketPage, fullBleed: true },
]
