import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PopupView } from './desktop/PopupView'
import { startAppearance } from './lib/appearance'

// The assistant's pop-up window (desktop) shows only its card: no app, no game log, no stores.
const isPopup = window.desktop?.windowKind === 'popup'

// Theme and text size before the first paint (no flash of the default theme).
if (!isPopup) startAppearance()

createRoot(document.getElementById('root')!).render(<StrictMode>{isPopup ? <PopupView /> : <App />}</StrictMode>)
