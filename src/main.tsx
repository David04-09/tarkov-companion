import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SearchBarApp } from './searchbar/SearchBarApp'
import { startAppearance } from './lib/appearance'

// The search bar over the game (desktop) is its own small window: only the bar, no app, no game log.
const isSearchBar = window.desktop?.windowKind === 'searchbar'

// The assistant was removed in 2.8.0: drop what it kept on this PC (settings, memory, the cached
// speech model), once.
if (!isSearchBar) {
  try {
    if (!localStorage.getItem('tc-assistant-removed')) {
      for (const k of ['tarkov-companion-assistant', 'tarkov-companion-assistant-memory']) localStorage.removeItem(k)
      void indexedDB.databases?.().then((dbs) => dbs.forEach((d) => d.name && /vosk/i.test(d.name) && indexedDB.deleteDatabase(d.name)))
      localStorage.setItem('tc-assistant-removed', '1')
    }
  } catch {
    // Only tidying up.
  }
}

// Theme and text size before the first paint (no flash of the default theme).
if (!isSearchBar) startAppearance()

createRoot(document.getElementById('root')!).render(<StrictMode>{isSearchBar ? <SearchBarApp /> : <App />}</StrictMode>)
