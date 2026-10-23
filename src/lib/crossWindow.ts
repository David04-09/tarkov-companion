/** A saved (zustand persist) store: its storage key and a way to read it again. */
interface PersistedStore {
  persist: { getOptions: () => { name?: string }; rehydrate: () => unknown }
}

/**
 * Desktop: the app window and the search bar window share localStorage but not memory. When the
 * other window saves one of these stores (a quest ticked "On map", a level set), read it again here.
 * The browser only sends this event when the saved text really changed, so reading it back never
 * bounces between the windows.
 */
export function followOtherWindows(stores: PersistedStore[]): () => void {
  const onStorage = (e: StorageEvent) => {
    for (const s of stores) if (e.key && e.key === s.persist.getOptions().name) void s.persist.rehydrate()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
