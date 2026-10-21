import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Map as MapIcon, Radio, Volume2, X } from 'lucide-react'
import { gameDataKeys, itemKeys } from '../api/hooks'
import { fetchItems } from '../api/queries'
import type { GameData, ItemsById } from '../api/types'
import { speak, stopSpeaking, stopSpeakingQuietly } from '../assistant/speech'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { buildMapTasks } from '../maps/overlay/mapTasks'
import { useAssistantStore } from '../store/assistant'
import { useAssistantMemory } from '../store/assistantMemory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProgressStore } from '../store/progress'
import { useRaidBriefingStore } from '../store/raidBriefing'
import { useUiStore } from '../store/ui'
import { buildBriefing, isRepeat, type RaidBriefing } from './raidBriefing'

const SOURCE_TEXT: Record<RaidBriefing['source'], string> = {
  ticked: 'Quests you ticked for this map',
  started: 'Quests you started in the game',
  none: 'No ticked or started quests here',
}

function sayBriefing(b: RaidBriefing) {
  const v = useAssistantStore.getState()
  stopSpeakingQuietly()
  void speak(b.spoken, v)
}

/**
 * Desktop: when the game log says a map is loading, brief the raid. A card with the quests for this
 * map and what they need, read out loud, and the quests started in the game shown on the Maps tab.
 * Read-only like the rest of the log features: it reacts to log lines the app already reads.
 */
export function RaidBriefingHost() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const request = useRaidBriefingStore((s) => s.request)
  const current = useRaidBriefingStore((s) => s.current)

  // Game log: the map is known as soon as it loads (both lines of one raid brief once).
  useEffect(
    () =>
      window.desktop?.onEvent((e) => {
        if (e.historical) return
        const store = useRaidBriefingStore.getState()
        if (e.kind === 'raidEnded' || e.kind === 'matchingAborted') return store.raidEnded()
        if (e.kind !== 'mapLoading' && e.kind !== 'raidMatched') return
        const data = queryClient.getQueryData<GameData>(gameDataKeys.mode(useProgressStore.getState().gameMode))
        const map =
          e.kind === 'raidMatched'
            ? data?.maps.find((m) => m.nameId.toLowerCase() === e.location.toLowerCase())
            : data?.maps.find((m) => m.scenePath && m.scenePath.toLowerCase() === e.scenePath.toLowerCase())
        if (!map) return
        // Habits: which maps are played and when (assistant memory).
        useAssistantMemory.getState().raid(map.normalizedName, e.at)
        store.ask(map.normalizedName, e.at)
      }),
    [queryClient],
  )

  useEffect(() => {
    if (!request) return
    const assistant = useAssistantStore.getState()
    const store = useRaidBriefingStore.getState()
    if (!assistant.briefing || isRepeat(store.last, request.mapKey, request.at, store.ended)) return
    const progress = useProgressStore.getState()
    const gameMode = progress.gameMode
    const data = queryClient.getQueryData<GameData>(gameDataKeys.mode(gameMode))
    const map = data?.maps.find((m) => m.normalizedName === request.mapKey)
    const cfg = map && findMapConfig(map.normalizedName)
    if (!data || !map || !cfg) return
    let cancelled = false
    void (async () => {
      // Item names for keys and markers: usually already saved on this PC; fetched otherwise.
      let items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
      if (!items) {
        items = await queryClient
          .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
          .then((r) => r.items)
          .catch(() => undefined)
      }
      if (cancelled) return
      const profile = progress.profiles[gameMode]
      const tasks = data.tasks.filter((t) => isFactionEligible(t, profile.faction))
      const eligible = new Set(tasks.map((t) => t.id))
      const overlay = useMapOverlayStore.getState()
      const briefing = buildBriefing({
        map,
        mapTasks: buildMapTasks(data, map.id, resolveBaseLayer(cfg, undefined)).filter((mt) => eligible.has(mt.task.id)),
        statuses: computeTaskStatuses(tasks, profile),
        startedIds: profile.activeTaskIds,
        tickedIds: new Set(overlay.checkedTaskIds),
        itemName: (id) => items?.[id]?.name,
        itemShortName: (id) => items?.[id]?.shortName,
      })
      useRaidBriefingStore.getState().show(briefing, request.at)
      // Started quests go on the Maps tab, so the map opened for this raid shows them.
      if (briefing.source === 'started') overlay.setTasksChecked(briefing.quests.map((q) => q.id), true)
      if (useAssistantStore.getState().briefingVoice) sayBriefing(briefing)
    })()
    return () => {
      cancelled = true
    }
  }, [request, queryClient])

  if (!current) return null
  const showOnMap = () => {
    if (current.quests.length) useMapOverlayStore.getState().setTasksChecked(current.quests.map((q) => q.id), true)
    useUiStore.getState().setLastMapKey(current.mapKey)
    navigate('/maps')
  }
  return (
    <div role="status" aria-label="Raid briefing" className="fixed bottom-4 left-4 z-[65] w-80 rounded-lg border border-accent/50 bg-surface-2 p-3 text-sm shadow-xl">
      <div className="mb-1 flex items-center gap-2">
        <Radio className="h-4 w-4 text-accent" />
        <span className="flex-1 font-medium">Raid briefing: {current.mapName}</span>
        <button type="button" onClick={() => sayBriefing(current)} aria-label="Read it again" title="Read it again" className="text-ink-dim hover:text-ink"><Volume2 className="h-4 w-4" /></button>
        <button type="button" onClick={() => { stopSpeaking(); useRaidBriefingStore.getState().close() }} aria-label="Close" title="Close" className="text-ink-dim hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-[11px] text-ink-dim">{SOURCE_TEXT[current.source]}{current.source === 'none' && current.availableCount > 0 ? ` (${current.availableCount} available quest${current.availableCount === 1 ? ' has' : 's have'} objectives on this map)` : ''}</p>
      {current.quests.length > 0 && (
        <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto">
          {current.quests.map((q) => (
            <li key={q.id} className="truncate">• {q.name}</li>
          ))}
        </ul>
      )}
      {current.bring.length > 0 && (
        <div className="mt-2 border-t border-line pt-1.5">
          <div className="text-[11px] text-ink-dim">Needed</div>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs">
            {current.bring.map((e, i) => (
              <li key={i} title={`For: ${e.quests.join(', ')}`} className="truncate">
                {current.bringLabels[i]}
                {e.optional && <span className="text-ink-dim"> (optional)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={showOnMap} className="btn !px-2 !py-1 !text-xs"><MapIcon className="h-3.5 w-3.5" /> Show on the map</button>
        <span className="text-[11px] text-ink-dim">Closes when the raid ends.</span>
      </div>
    </div>
  )
}
