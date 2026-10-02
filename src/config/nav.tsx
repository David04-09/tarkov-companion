import type { ComponentType } from 'react'
import {
  CalendarCheck,
  Hammer,
  LayoutDashboard,
  Map,
  Package,
  ScrollText,
  Store,
  type LucideIcon,
} from 'lucide-react'
import { DashboardPage } from '../pages/DashboardPage'
import { QuestsPage } from '../pages/QuestsPage'
import { CraftsPage, FleaMarketPage, ItemCollectionPage, MapsPage, PlanningPage } from '../pages/stubs'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  component: ComponentType
}

/**
 * The sidebar tabs, in display order. Each entry becomes a route automatically.
 * To add a tab: create a page component and add one line here.
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, component: DashboardPage },
  { path: '/quests', label: 'Quests', icon: ScrollText, component: QuestsPage },
  { path: '/maps', label: 'Maps', icon: Map, component: MapsPage },
  { path: '/planning', label: 'Planning', icon: CalendarCheck, component: PlanningPage },
  { path: '/items', label: 'Item Collection', icon: Package, component: ItemCollectionPage },
  { path: '/crafts', label: 'Crafts', icon: Hammer, component: CraftsPage },
  { path: '/flea', label: 'Flea Market', icon: Store, component: FleaMarketPage },
]
