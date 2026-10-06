import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BuildParts } from '../lib/weaponBuild'

export interface SavedBuild {
  id: string
  weaponId: string
  name: string
  parts: BuildParts
  createdAt: number
  updatedAt: number
}

export interface WeaponBuildsState {
  builds: SavedBuild[]
  /** Saves a new build and returns its id. */
  addBuild: (weaponId: string, name: string, parts: BuildParts) => string
  updateBuild: (id: string, parts: BuildParts) => void
  renameBuild: (id: string, name: string) => void
  deleteBuild: (id: string) => void
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Named weapon builds (Weapon builder), kept in localStorage. */
export const useWeaponBuildsStore = create<WeaponBuildsState>()(
  persist(
    (set) => ({
      builds: [],
      addBuild: (weaponId, name, parts) => {
        const id = newId()
        const now = Date.now()
        set((s) => ({ builds: [...s.builds, { id, weaponId, name: name.trim() || 'My build', parts, createdAt: now, updatedAt: now }] }))
        return id
      },
      updateBuild: (id, parts) =>
        set((s) => ({ builds: s.builds.map((b) => (b.id === id ? { ...b, parts, updatedAt: Date.now() } : b)) })),
      renameBuild: (id, name) =>
        set((s) => ({ builds: s.builds.map((b) => (b.id === id && name.trim() ? { ...b, name: name.trim(), updatedAt: Date.now() } : b)) })),
      deleteBuild: (id) => set((s) => ({ builds: s.builds.filter((b) => b.id !== id) })),
    }),
    { name: 'tarkov-companion-weapon-builds', version: 1 },
  ),
)
