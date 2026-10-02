import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { queryClient } from './api/queryClient'
import { Layout } from './components/Layout'
import { NAV_ITEMS } from './config/nav'
import { AlignPage } from './pages/AlignPage'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
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
      </BrowserRouter>
    </QueryClientProvider>
  )
}
