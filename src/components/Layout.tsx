import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../config/nav'
import { FirstRunSetup } from '../desktop/FirstRunSetup'
import { SyncReviewDialog, SyncToast } from '../desktop/SyncReview'
import { ScanDialog } from '../scan/ScanDialog'
import { useScanStore } from '../scan/scanStore'
import { UpdateBanner } from '../desktop/UpdateBanner'
import { hasAnyProgress, useLocalFlags } from '../desktop/localFlags'
import { isDesktop, useDesktopStore } from '../desktop/useDesktop'
import { useProgressStore } from '../store/progress'
import { WipeBanner } from '../desktop/WipeBanner'
import { ItemLookup } from './ItemLookup'
import { StoryTimerWatcher } from '../story/StoryTimerWatcher'
import { AutoUntickCompleted } from '../maps/AutoUntick'
import { RaidResultPrompt } from '../stats/RaidResultPrompt'
import { PositionListener } from '../maps/position'
import { AutoBackup } from '../desktop/HealthAndBackups'
import { Sidebar } from './Sidebar'

export function Layout() {
  const { pathname } = useLocation()
  // Desktop scan hotkey: the main process captured the game screen; open the scanner with it.
  useEffect(() => window.desktop?.onScanCapture((png) => useScanStore.getState().openWith(new Blob([png as BlobPart], { type: 'image/png' }))), [])
  const settings = useDesktopStore((s) => s.settings)
  const localSetupDone = useLocalFlags((s) => s.setupDone)
  const hasProgress = useProgressStore((s) => hasAnyProgress(s.profiles))
  // Set up here before (this progress store), or set up in an earlier version and already has quests ticked.
  const needsSetup = isDesktop() && settings !== null && !localSetupDone && !(settings.setupDone && hasProgress)
  // Once shown, keep the setup open until Done (ticking quests mid-way must not close it).
  const [setupShown, setSetupShown] = useState(false)
  if (needsSetup && !setupShown) setSetupShown(true)
  const showSetup = isDesktop() && !localSetupDone && (needsSetup || setupShown)
  const fullBleed =
    pathname.startsWith('/dev/') || NAV_ITEMS.some((i) => i.fullBleed && i.path === pathname)

  return (
    <div className="flex h-full bg-surface text-ink">
      <ItemLookup />
      <StoryTimerWatcher />
      <AutoUntickCompleted />
      {isDesktop() && <RaidResultPrompt />}
      {isDesktop() && <PositionListener />}
      {isDesktop() && <AutoBackup />}
      {showSetup && <FirstRunSetup />}
      {isDesktop() && <SyncReviewDialog />}
      {isDesktop() && <SyncToast />}
      <ScanDialog />
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
