import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { persistOptions } from './api/persist'
import { queryClient } from './api/queryClient'
import { Layout } from './components/Layout'
import { NAV_ITEMS } from './config/nav'
import { DesktopBridge, isDesktop } from './desktop/useDesktop'
import { AlignPage } from './pages/AlignPage'
import { OverlayPage } from './pages/OverlayPage'

export default function App() {
  // The packaged desktop app loads from file://, where only hash routing works.
  const Router = isDesktop() ? HashRouter : BrowserRouter
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions(queryClient)}>
      <Router>
        {isDesktop() && <DesktopBridge />}
        <Routes>
          {/* The always-on-top overlay window renders without the sidebar. */}
          {isDesktop() && <Route path="/overlay" element={<OverlayPage />} />}
          <Route element={<Layout />}>
            {NAV_ITEMS.map((item) => {
              const Page = item.component
              return <Route key={item.path} path={item.path} element={<Page />} />
            })}
            {/* Hidden developer tool: only served by the dev server, never linked from the sidebar. */}
            {import.meta.env.DEV && <Route path="/dev/align" element={<AlignPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </PersistQueryClientProvider>
  )
}
