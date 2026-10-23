import { createContext, useContext } from 'react'
import type { GameData, Item, ItemsById, Task } from '../api/types'
import type { GuideImage } from '../api/wikiGuide'
import type { ItemNeed } from '../lib/needs'
import type { TaskStatus } from '../lib/taskStatus'
import type { MapOption } from '../maps/useMapOptions'
import type { MapPin } from './SearchBarMap'

/** A side panel next to the main card. */
export type Panel = { kind: 'quest'; id: string } | { kind: 'item'; id: string } | { kind: 'picture'; image: GuideImage; title: string }

export const panelKey = (p: Panel) => (p.kind === 'picture' ? `picture:${p.image.full}` : `${p.kind}:${p.id}`)

export interface KeyMap {
  option: MapOption
  pins: MapPin[]
}

/** What the details need from the search bar (data, progress, and what clicks do). */
export interface DetailsCtx {
  data: GameData
  items: ItemsById | undefined
  statuses: Record<string, TaskStatus>
  completed: ReadonlySet<string>
  needs: Map<string, ItemNeed>
  collected: Record<string, number>
  onMap: string[]
  tickQuest: (task: Task, on: boolean) => void
  keyMaps: (item: Item) => KeyMap[]
  showKey: (item: Item, k: KeyMap) => void
  open: (p: Panel) => void
  traderName: (id: string) => string
}

export const DetailsContext = createContext<DetailsCtx | null>(null)

export function useDetails(): DetailsCtx {
  const c = useContext(DetailsContext)
  if (!c) throw new Error('DetailsContext missing')
  return c
}
