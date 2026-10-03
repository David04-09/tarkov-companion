import { Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../config/nav'
import { FirstRunSetup } from '../desktop/FirstRunSetup'
import { UpdateBanner } from '../desktop/UpdateBanner'
import { hasAnyProgress, useLocalFlags } from '../desktop/localFlags'
import { isDesktop, useDesktopStore } from '../desktop/useDesktop'
import { useProgressStore } from '../store/progress'
import { WipeBanner } from '../desktop/WipeBanner'
import { ItemLookup } from './ItemLookup'
import { Sidebar } from './Sidebar'

export function Layout() {
  const { pathname } = useLocation()
  const settings = useDesktopStore((s) => s.settings)
  const localSetupDone = useLocalFlags((s) => s.setupDone)
  const hasProgress = useProgressStore((s) => hasAnyProgress(s.profiles))
  // Set up here before (this progress store), or set up in an earlier version and already has quests ticked.
  const showSetup = isDesktop() && settings !== null && !localSetupDone && !(settings.setupDone && hasProgress)
  const fullBleed =
    pathname.startsWith('/dev/') || NAV_ITEMS.some((i) => i.fullBleed && i.path === pathname)

  return (
    <div className="flex h-full bg-surface text-ink">
      <ItemLookup />
      {showSetup && <FirstRunSetup />}
      <Sidebar />
      <main className={`min-w-0 flex-1 ${fullBleed ? 'flex min-h-0 flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <UpdateBanner />
        <WipeBanner />
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
