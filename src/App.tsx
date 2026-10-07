import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { persistOptions } from './api/persist'
import { queryClient } from './api/queryClient'
import { Layout } from './components/Layout'
import { NAV_ITEMS } from './config/nav'
import { DesktopBridge, isDesktop } from './desktop/useDesktop'
import { lazy } from 'react'

const AlignPage = lazy(() => import('./pages/AlignPage').then((m) => ({ default: m.AlignPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export default function App() {
  // The packaged desktop app loads from file://, where only hash routing works.
  const Router = isDesktop() ? HashRouter : BrowserRouter
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions(queryClient)}>
      <Router>
        {isDesktop() && <DesktopBridge />}
        <Routes>
          <Route element={<Layout />}>
            {NAV_ITEMS.map((item) => {
              const Page = item.component
              return <Route key={item.path} path={item.path} element={<Page />} />
            })}
            <Route path="/settings" element={<SettingsPage />} />
            {/* Hidden developer tool: only served by the dev server, never linked from the sidebar. */}
            {import.meta.env.DEV && <Route path="/dev/align" element={<AlignPage />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </PersistQueryClientProvider>
  )
}
