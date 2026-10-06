/**
 * "Where am I": the latest position read from an in-game screenshot's file name (desktop),
 * tagged with the map you were on (the last raid's map from the game log, else the map open
 * in the app). Not persisted: a position is only useful during the raid.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { useGameData } from '../api/hooks'
import { useDesktopStore } from '../desktop/useDesktop'
import type { PlayerPosition } from '../shared/desktop-api'
import { useUiStore } from '../store/ui'

interface PositionState {
  pos: (PlayerPosition & { mapKey: string | null }) | null
  set: (pos: PositionState['pos']) => void
}

export const usePositionStore = create<PositionState>()((set) => ({
  pos: null,
  set: (pos) => set({ pos }),
}))

/** Desktop: listens for new in-game screenshots (and picks up a recent one at start). */
export function PositionListener() {
  const maps = useGameData().data?.maps
  useEffect(() => {
    const api = window.desktop
    if (!api?.onPosition) return
    const mapKeyNow = () => {
      const loc = useDesktopStore.getState().lastRaidLocation
      const fromRaid = loc ? maps?.find((m) => m.nameId.toLowerCase() === loc.toLowerCase())?.normalizedName : undefined
      return fromRaid ?? useUiStore.getState().lastMapKey ?? null
    }
    void api.getLatestPosition().then((p) => {
      if (p && !usePositionStore.getState().pos) usePositionStore.getState().set({ ...p, mapKey: mapKeyNow() })
    })
    return api.onPosition((p) => usePositionStore.getState().set({ ...p, mapKey: mapKeyNow() }))
  }, [maps])
  return null
}
