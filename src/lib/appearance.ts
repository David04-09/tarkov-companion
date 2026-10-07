/**
 * Puts the Appearance settings on <html>: theme and density as data attributes (index.css
 * has the matching rules), text size as the root font size (every rem-based size follows).
 * Runs before the first render and again on every change.
 */
import { usePrefs, type Prefs } from '../store/prefs'

function apply(p: Pick<Prefs, 'theme' | 'uiScale' | 'density' | 'reduceMotion' | 'markerScale'>) {
  const root = document.documentElement
  root.dataset.theme = p.theme
  root.dataset.density = p.density
  root.dataset.reduceMotion = String(p.reduceMotion)
  root.style.fontSize = p.uiScale === 100 ? '' : `${p.uiScale}%`
  root.classList.toggle('dark', p.theme !== 'daylight')
  root.style.setProperty('--tc-marker-scale', String(p.markerScale / 100))
}

let started = false
export function startAppearance() {
  if (started) return
  started = true
  apply(usePrefs.getState())
  usePrefs.subscribe((p, prev) => {
    if (p.theme !== prev.theme || p.uiScale !== prev.uiScale || p.density !== prev.density || p.reduceMotion !== prev.reduceMotion || p.markerScale !== prev.markerScale) apply(p)
  })
}
