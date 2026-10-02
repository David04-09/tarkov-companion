import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { queryClient } from './api/queryClient'
import { Layout } from './components/Layout'
import { NAV_ITEMS } from './config/nav'

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
