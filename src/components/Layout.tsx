import { Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../config/nav'
import { ItemLookup } from './ItemLookup'
import { Sidebar } from './Sidebar'

export function Layout() {
  const { pathname } = useLocation()
  const fullBleed =
    pathname.startsWith('/dev/') || NAV_ITEMS.some((i) => i.fullBleed && i.path === pathname)

  return (
    <div className="flex h-full bg-surface text-ink">
      <ItemLookup />
      <Sidebar />
      <main className={`min-w-0 flex-1 ${fullBleed ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {fullBleed ? (
          <Outlet />
        ) : (
          <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  )
}
