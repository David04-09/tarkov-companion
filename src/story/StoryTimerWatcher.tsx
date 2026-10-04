import { useEffect } from 'react'
import { formatWait } from '../lib/storyTime'
import { useStoryStore } from '../store/story'

/**
 * Runs in the layout, whatever tab is open: when a story time gate's earliest time passes,
 * shows a system notification once ("Prapor may have news now").
 */
export function StoryTimerWatcher() {
  useEffect(() => {
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const { byMode, markNotified } = useStoryStore.getState()
      const now = Date.now()
      for (const mode of ['regular', 'pve'] as const) {
        for (const [chapter, progress] of Object.entries(byMode[mode])) {
          for (const [key, t] of Object.entries(progress.timers)) {
            if (t.notified || progress.done[key] || now < t.startedAt + t.minH * 3_600_000) continue
            markNotified(mode, chapter, key)
            new Notification('Story time gate open', {
              body: `${t.label}\nThe ${formatWait(t)} wait ${t.minH === t.maxH ? 'is over' : 'has reached its earliest time'}.`,
              tag: `story-${mode}-${chapter}-${key}`,
            })
          }
        }
      }
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [])
  return null
}
