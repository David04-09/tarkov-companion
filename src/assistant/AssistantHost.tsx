import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { itemKeys, useGameData, useHideout } from '../api/hooks'
import { fetchItems } from '../api/queries'
import type { GameData, GameMap, ItemsById, Position } from '../api/types'
import { computeNeeds, type ItemNeed } from '../lib/needs'
import { computeTaskStatus, computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { useAssistantStore } from '../store/assistant'
import { useAssistantMemory } from '../store/assistantMemory'
import { useRaidLogStore } from '../store/raidLog'
import { useTimersStore } from '../desktop/timers'
import { useSyncHistory } from '../desktop/syncHistory'
import { usePositionStore } from '../maps/position'
import { useAssistantChat, type ChatMessage } from '../store/assistantChat'
import { useAssistantListenStore } from '../store/assistantListen'
import { useAssistantRouteStore } from '../store/assistantRoute'
import { useInventoryStore, useModeInventory } from '../store/inventory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProfile, useProgressStore } from '../store/progress'
import { useRaidBriefingStore } from '../store/raidBriefing'
import { useUiStore } from '../store/ui'
import { answer, nameSlots, type AssistantAction, type AssistantContext, type MapCard, type MapPoint, type Reply } from './engine'
import { nluLoaded, understandQuestion, warmNlu } from './nlu'
import { followUp, type Slotted } from './followUp'
import { headingOnMap } from './heading'
import { confirmWord, expandNicknames, findItem, keyWorthText } from './items'
import { parseChange, planAvailable, type Change, type ChangeContext } from './changes'
import { commandText, commandWords, NEEDS_TRANSCRIBING, parseCommand, type CommandContext, type CommandTarget } from './commands'
import { NAV_ITEMS } from '../config/nav'
import { useFleaStore } from '../store/flea'
import { fetchKeyWiki } from '../api/wikiKey'
import { wikiTitle } from '../api/wikiGuide'
import { keyVerdict } from '../lib/keyVerdict'
import { listenOnce, type ListenState } from './listen'
import { ALL_PLACES, type Place } from './places'
import { addressed } from './humanize'
import type { PopupData } from '../shared/desktop-api'
import { STATUS_LABEL } from '../lib/taskStatus'
import { areaCorners, cellCorners, cellOf, parseMapView, type MapView } from '../maps/grid'
import { fetchWikiGuide, wikiTitle as guideTitle } from '../api/wikiGuide'

/**
 * In a hands-free conversation: does it sound like something asked of the assistant? A question
 * word, a request, a game-word question ("price", "extract"), or its name. Chatter has none.
 */
const ASKED = /\b(what|whats|where|wheres|how|hows|which|who|whos|when|why|is|are|am|can|could|should|would|will|do|does|did|tell|show|give|find|take|guide|route|path|draw|price|cost|costs|worth|value|much|many|extract|extracts|exit|close|hide|open|add|added|collected|used|sold|remove|mark|remember|forget|call|help|need|needs|best|closest|nearest|list|read|say|repeat|again|keep|sell|loot|boss|bosses|goons|goon|spawn|key|keys|quest|quests|ammo|unlock|unlocks|restock|scav|time|left|stats|progress|means|meant|mean)\b/
function looksAsked(said: string, name: string): boolean {
  return ASKED.test(said) || said.split(' ').includes(name)
}

/** A route asked to be drawn on the Maps tab, not only shown in the chat. */
const DRAW_ON_MAP = /\b(draw|on the map|on my map|to the map|show it on|put it on|mark it)\b/

/** Phrases that close the pop-up over the game, and that show it again. */
const CLOSE_POPUP = /^(?:ok |okay |thanks )?(?:close|close it|close that|close this|close the window|close the pop up|close the popup|hide|hide it|hide that|hide this|hide the window|get rid of (?:it|that)|dismiss|dismiss that|clear (?:it|that|the screen)|go away|thats enough|got it close it)$/
/** Extra words the always-on listener needs for the pop-up: close, pause, and the map grid. */
const POPUP_WORDS = ['close', 'hide', 'pause', 'timer', 'keep', 'open', 'zoom', 'in', 'out', 'top', 'bottom', 'left', 'right', 'corner', 'middle', 'whole', 'map', 'a', 'b', 'c', 'd', 'e', 'f', 'one', 'two', 'three', 'four', 'five', 'six', 'square']

/** "Pause": the pop-up's countdown stops; it stays until "close". */
const PAUSE_POPUP = /^(?:ok |okay )?(?:pause|pause it|pause that|pause the timer|pause timer|stop the timer|stop the countdown|keep it open|keep that open|keep it up|hold on|hold it|wait)$/
const SHOW_POPUP_AGAIN = /^(?:show (?:that|it) again|show me again|open (?:that|it) again|bring (?:that|it) back|pop (?:that|it) up again)$/
import { GOOD_ANSWER, kindWords, parseAddress, TELL_MORE, TOO_LONG } from './memory'
import { applyWords, askKind, asksAboutOwn, findNote, FORGET_ALL, FORGET_LAST, greetingText, isLearnedChatter, NOT_FOR_YOU, parseMeant, parseRemember, parseStyle, parseTeach, subjectOf, WAS_FOR_YOU, WHAT_YOU_KNOW } from './memory'
import { greetingFacts, habitsFromLogs, knowReply, noteReply, RECOMMEND, recommendReply, resolveName } from './memoryAnswers'
import { compact, words } from './text'
import { buildSoundNames, isEverydayWord, snapToNames, type SoundName } from './phonetic'
import { applyHeard, REPEAT_WINDOW_MS, repeatFix } from './pronunciation'
import { acronymize, voiceVocabulary } from './spoken'
import { startWakeListening, type WakeListener } from './wake'
import { withWalk } from './withWalk'

/** Objective positions per map and faction, worked out once per data load and only for maps that are asked about. */
const mapTaskCache = new WeakMap<GameData, Map<string, MapTask[]>>()
function tasksOnMapFor(data: GameData, map: GameMap, eligible: Set<string>, faction: string): MapTask[] {
  let perData = mapTaskCache.get(data)
  if (!perData) mapTaskCache.set(data, (perData = new Map()))
  const key = `${map.id}:${faction}`
  let list = perData.get(key)
  if (!list) {
    const cfg = findMapConfig(map.normalizedName)
    list = cfg ? buildMapTasks(data, map.id, resolveBaseLayer(cfg, undefined)).filter((m) => eligible.has(m.task.id)) : []
    perData.set(key, list)
  }
  return list
}

const chat = () => useAssistantChat.getState()
const setMessages = (f: (m: ChatMessage[]) => ChatMessage[]) => chat().set({ messages: f(chat().messages) })
const setListen = (listen: { state: ListenState; detail?: string }) => chat().set({ listen })
const clearPending = (id: number) => {
  if (chat().pending === id) chat().set({ pending: null })
}

/**
 * The assistant's brain, mounted once in Layout so the wake word ("Hey Ranger") works on every
 * tab, also on the Maps tab a raid opens. Answers go into the shared chat (shown on the Neural
 * network tab, and as a small bubble elsewhere) and are read out loud. Still light: nothing runs
 * until a question is asked or the wake word is switched on, and the item list loads only then.
 */
export function AssistantHost() {
  const gameData = useGameData()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const gameMode = useProgressStore((s) => s.gameMode)
  const voice = useAssistantStore()
  const lastMapId = useRef<string | null>(null)
  const lastPlace = useRef<Place | null>(null)
  const pendingConfirm = useRef<Reply['confirm'] | null>(null)
  /** "Forget everything?" asked, waiting for yes. */
  const pendingForget = useRef(false)
  /** In a conversation: the last line answered (for "not you") and the last one ignored (for "that was for you"). */
  const lastAnswered = useRef<string | null>(null)
  const lastIgnored = useRef<string | null>(null)
  /** The names of the last question (masked + values), for follow-ups ("how much is it", "and on Woods"). */
  const lastSlotted = useRef<Slotted | null>(null)
  /** The last question as asked, for "no, I meant …". */
  const lastQuestion = useRef<string | null>(null)
  /** The word of the last question it did not understand, for "that means …". */
  const lastUnknown = useRef<string | null>(null)
  const nextId = useRef(1)
  const navigate = useNavigate()

  /** Runs an offered action (only ever from a click on its button). */
  // Undo for changes made by voice or text ("mark Debut done" → Undo button, or "undo that").
  const undos = useRef(new Map<string, () => void>())
  const lastUndo = useRef<string | null>(null)
  const undoAction = (undo: () => void): AssistantAction => {
    const undoId = `${Date.now()}-${undos.current.size}`
    undos.current.set(undoId, undo)
    lastUndo.current = undoId
    return { kind: 'undo', undoId, label: 'Undo' }
  }
  const runUndo = (undoId: string | null): boolean => {
    const undo = undoId ? undos.current.get(undoId) : undefined
    if (!undo || !undoId) return false
    undos.current.delete(undoId)
    if (lastUndo.current === undoId) lastUndo.current = null
    undo()
    return true
  }

  const run = (key: string, a: AssistantAction) => {
    chat().set({ done: [...chat().done, key] })
    if (a.kind === 'undo') {
      runUndo(a.undoId)
      return
    }
    if (a.kind === 'setCollected') {
      useInventoryStore.getState().setCollected(useProgressStore.getState().gameMode, a.itemId, a.count)
      pendingConfirm.current = null
      return
    }
    if (a.kind === 'complete') {
      useProgressStore.getState().setTaskCompleted(a.taskId, a.done)
      return
    }
    if (a.kind === 'showOnMap') useMapOverlayStore.getState().setTasksChecked([a.taskId], true)
    if (a.kind === 'routeOnMap') useAssistantRouteStore.getState().set({ mapKey: a.mapKey, path: a.path, fromLabel: a.fromLabel, toLabel: a.toLabel })
    useUiStore.getState().setLastMapKey(a.mapKey)
    navigate('/maps')
  }

  const tasks = useMemo(() => (gameData.data?.tasks ?? []).filter((t) => isFactionEligible(t, profile.faction)), [gameData.data, profile.faction])

  // Voice commands ("Maps", "show quest Debut", "search GPU on the flea"): what can be opened.
  const keyItems = useRef<{ items: ItemsById; keys: ItemsById } | null>(null)
  const commandContext = (data: GameData): CommandContext => ({
    tabs: [...NAV_ITEMS.map((n) => ({ path: n.path, label: n.label })), { path: '/settings', label: 'Settings' }, { path: '/features', label: 'Features & patches' }],
    maps: data.maps,
    quests: tasks,
    findItem: (said, keysOnly) => {
      const items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
      if (!items) return null
      if (keysOnly && keyItems.current?.items !== items) keyItems.current = { items, keys: Object.fromEntries(Object.entries(items).filter(([, it]) => it.types.includes('keys'))) }
      const hit = findItem(expandNicknames(said), keysOnly ? keyItems.current!.keys : items)
      return hit ? { id: hit.item.id, name: hit.item.name } : null
    },
  })
  const runCommand = (cmd: CommandTarget) => {
    if (cmd.to === 'back') return navigate(-1)
    if (cmd.mapKey) useUiStore.getState().setLastMapKey(cmd.mapKey)
    if (cmd.flea !== undefined) useFleaStore.getState().setFilters({ search: cmd.flea })
    // t= makes the same request twice still apply on a page that is already open.
    navigate(cmd.params ? `${cmd.to}?${new URLSearchParams({ ...cmd.params, t: String(Date.now()) })}` : cmd.to)
  }
  // Changes by voice or text: quests, level, faction, mode, hideout and trader levels.
  const changeContext = (data: GameData): ChangeContext => {
    const p = useProgressStore.getState()
    const inv = useInventoryStore.getState().byMode[p.gameMode]
    return {
      quests: tasks,
      stations: (hideout.data ?? []).map((s) => ({ id: s.id, name: s.name, maxLevel: s.levels.length })),
      traders: data.traders.map((t) => ({ id: t.id, name: t.name, maxLevel: t.maxLevel })),
      stationLevel: (id) => inv?.stationLevels[id] ?? 0,
    }
  }
  const applyChange = (change: Change): Reply => {
    const progress = useProgressStore.getState()
    const mode = progress.gameMode
    const prof = progress.profiles[mode]
    const inventory = useInventoryStore.getState()
    switch (change.kind) {
      case 'undo':
        return { text: runUndo(lastUndo.current) ? 'Undone.' : 'There is nothing to undo.' }
      case 'questDone': {
        const t = change.task
        const was = prof.completedTaskIds.has(t.id)
        if (was === change.done) return { text: change.done ? `${t.name} is already marked done.` : `${t.name} isn't marked done.` }
        progress.setTaskCompleted(t.id, change.done)
        return { text: change.done ? `Marked ${t.name} done.` : `Unticked ${t.name}.`, actions: [undoAction(() => useProgressStore.getState().setTaskCompletedFor(mode, t.id, was))] }
      }
      case 'questAvailable': {
        const t = change.task
        const status = computeTaskStatus(t, prof)
        if (status === 'completed') return { text: `${t.name} is marked done. Say "untick ${t.name}" to open it again.` }
        if (status === 'available') return { text: `${t.name} is already available.` }
        const plan = planAvailable(t, tasks, prof.completedTaskIds, prof.playerLevel)
        const before = prof.playerLevel
        progress.addCompletedFor(mode, plan.complete.map((x) => x.id))
        if (plan.level !== null) progress.setPlayerLevel(plan.level)
        const lines = [
          ...(plan.complete.length ? [`Marked done first (${plan.complete.length}): ${plan.complete.map((x) => x.name).join(', ')}`] : []),
          ...(plan.level !== null ? [`Your level is now ${plan.level} (it needs ${plan.level}; you had ${before}).`] : []),
        ]
        return {
          text: `${t.name} is available now.`,
          lines,
          actions: [
            undoAction(() => {
              const p = useProgressStore.getState()
              for (const x of plan.complete) p.setTaskCompletedFor(mode, x.id, false)
              if (plan.level !== null) p.setPlayerLevel(before)
            }),
          ],
        }
      }
      case 'zoomQuest': {
        const t = change.task
        const map = t.map ?? t.objectives.flatMap((o) => o.maps)[0]
        if (!map) return { text: `${t.name} has no spot on a map in the data.` }
        const overlay = useMapOverlayStore.getState()
        overlay.setTasksChecked([t.id], true)
        useUiStore.getState().setLastMapKey(map.normalizedName)
        overlay.requestFocus(t.id)
        navigate('/maps')
        return { text: `Showing ${t.name} on ${map.name}.`, quiet: true }
      }
      case 'playerLevel': {
        const was = prof.playerLevel
        if (was === change.level) return { text: `You're already level ${was}.` }
        progress.setPlayerLevel(change.level)
        return { text: `Your level is now ${change.level}.`, actions: [undoAction(() => useProgressStore.getState().setPlayerLevel(was))] }
      }
      case 'faction': {
        const was = prof.faction
        if (was === change.faction) return { text: `You're already ${was}.` }
        progress.setFaction(change.faction)
        return { text: `Faction set to ${change.faction}.`, actions: [undoAction(() => useProgressStore.getState().setFaction(was))] }
      }
      case 'gameMode': {
        const label = change.mode === 'pve' ? 'PvE' : 'PvP'
        if (mode === change.mode) return { text: `You're already on ${label}.` }
        progress.setGameMode(change.mode)
        return { text: `Switched to ${label}.`, actions: [undoAction(() => useProgressStore.getState().setGameMode(mode))] }
      }
      case 'station': {
        const was = inventory.byMode[mode]?.stationLevels[change.id] ?? 0
        inventory.setStationLevel(mode, change.id, change.level)
        return {
          text: `${change.name} is level ${change.level} now.`,
          lines: change.level === change.maxLevel ? [`That's its highest level (${change.maxLevel}).`] : undefined,
          actions: [undoAction(() => useInventoryStore.getState().setStationLevel(mode, change.id, was))],
        }
      }
      case 'trader': {
        const was = inventory.byMode[mode]?.traderLevels[change.id] ?? 1
        inventory.setTraderLevel(mode, change.id, change.level)
        return { text: `${change.name} is loyalty level ${change.level} now.`, actions: [undoAction(() => useInventoryStore.getState().setTraderLevel(mode, change.id, was))] }
      }
    }
  }
  /** "close", "pause", "zoom in on D3" … while a pop-up (or map card) is up: these work without the name too. */
  const popupControl = (t: string) => {
    const w = words(t).join(' ')
    return (popupOpen() && (CLOSE_POPUP.test(w) || PAUSE_POPUP.test(w))) || (!!viewBase.current && (popupOpen() || !!chat().card) && parseMapView(w) !== null)
  }
  const commandRef = useRef({ context: commandContext, run: runCommand, changes: changeContext, apply: applyChange, popupControl })
  useEffect(() => {
    commandRef.current = { context: commandContext, run: runCommand, changes: changeContext, apply: applyChange, popupControl }
  })
  const statuses = useMemo(() => computeTaskStatuses(tasks, profile), [tasks, profile])
  const faction = profile.faction

  // Item Collection: the same "still needed" numbers as the Item Collection page.
  const inventory = useModeInventory()
  const hideout = useHideout()
  const needsCache = useRef<{ inputs: unknown[]; list: ItemNeed[] } | null>(null)
  const needsFor = (data: GameData, items: ItemsById | undefined): ItemNeed[] => {
    const inputs = [data, items, profile.completedTaskIds, profile.faction, hideout.data, inventory.stationLevels]
    const c = needsCache.current
    if (c && c.inputs.every((v, i) => v === inputs[i])) return c.list
    const list = [
      ...computeNeeds({ tasks: data.tasks, completedTaskIds: profile.completedTaskIds, faction: profile.faction, stations: hideout.data ?? [], stationLevels: inventory.stationLevels, crafts: [], favoriteCraftIds: [], items }).values(),
    ]
    needsCache.current = { inputs, list }
    return list
  }

  /** The map you are on: the raid's (briefing or raid clock, from the game log), else a screenshot from the last 30 minutes. */
  const currentMapId = (data: GameData, timers: { raidMapNameId: string | null }, pos: { mapKey: string | null; at: number } | null): string | null => {
    const briefed = useRaidBriefingStore.getState().current?.mapId
    if (briefed) return briefed
    const byNameId = timers.raidMapNameId ? data.maps.find((m) => m.nameId.toLowerCase() === timers.raidMapNameId!.toLowerCase()) : undefined
    if (byNameId) return byNameId.id
    if (pos?.mapKey && Date.now() - pos.at < 30 * 60_000) return data.maps.find((m) => m.normalizedName === pos.mapKey)?.id ?? null
    return null
  }

  /** What is happening right now: the raid clock, the last screenshot position, hand-ins and habits. */
  const liveInfo = (data: GameData, items: ItemsById | undefined) => {
    const timers = useTimersStore.getState()
    const pos = usePositionStore.getState().pos
    const mode = useProgressStore.getState().gameMode
    return {
      now: Date.now(),
      raid: timers.raidStartedAt ? { startedAt: timers.raidStartedAt, durationS: timers.raidDurationSeconds, mapNameId: timers.raidMapNameId } : null,
      position: pos ? { x: pos.x, z: pos.z, mapKey: pos.mapKey, at: pos.at } : null,
      scavCooldownEndsAt: timers.scavCooldownEndsAt,
      handIns: useSyncHistory.getState().entries.filter((e) => e.mode === mode && !e.undone).map((e) => ({ taskId: e.taskId, at: e.at })),
      habits: useAssistantMemory.getState().habits,
      currentMapId: currentMapId(data, timers, pos),
      needs: () => needsFor(data, items),
      isDesktop: !!window.desktop,
    }
  }

  /** Everything an answer may use; the item list only if it is already loaded (it is large). */
  const context = (data: GameData, items: ItemsById | undefined): AssistantContext => {
    const eligible = new Set(tasks.map((t) => t.id))
    return {
      data,
      statuses,
      tasks,
      items,
      playerLevel: profile.playerLevel,
      // Before anything was asked, follow-ups ("extracts?") are about the map being raided.
      lastMapId: lastMapId.current ?? useRaidBriefingStore.getState().current?.mapId ?? null,
      lastPlace: lastPlace.current,
      collected: inventory.collected,
      needFor: (itemId) => needsFor(data, items).find((n) => n.itemId === itemId || n.alternatives.includes(itemId)),
      tasksOnMap: (map: GameMap) => tasksOnMapFor(data, map, eligible, faction),
      heading: (map, from, to) => headingOnMap(map.normalizedName, from, to),
      live: liveInfo(data, items),
    }
  }

  const onMap = (data: GameData) => {
    const eligible = new Set(tasks.map((t) => t.id))
    return (map: GameMap) => tasksOnMapFor(data, map, eligible, faction)
  }

  /** "Evening, sir. 6 quests left on the way to Kappa …", once a day; null when already greeted today. */
  const greetingToday = (): string | null => {
    const data = gameData.data
    const mem = useAssistantMemory.getState()
    const today = new Date().toLocaleDateString('en-CA')
    if (!data || mem.lastGreetDay === today) return null
    mem.greeted(today)
    return greetingText({ hour: new Date().getHours(), ...greetingFacts(data, tasks, profile.completedTaskIds, statuses, onMap(data), mem.habits) })
  }
  const greetingRef = useRef(greetingToday)
  useEffect(() => {
    greetingRef.current = greetingToday
  })

  /** The topic of the question being answered (askKind), and the last answer, for "too long" / "tell me more". */
  const currentKind = useRef('other')
  /** The question being answered (the pop-up's title) and the last pop-up shown (for "show that again"). */
  const currentQuestion = useRef('')
  const lastPopup = useRef<PopupData | null>(null)
  const lastReply = useRef<{ reply: Reply; kind: string } | null>(null)

  /** What the pop-up shows besides the text: the item's or quest's card and a mini-map of the answer's spots. */
  const popupExtras = (reply: Reply): Pick<PopupData, 'item' | 'quest' | 'map'> => {
    const data = gameData.data
    if (!data) return {}
    const out: Pick<PopupData, 'item' | 'quest' | 'map'> = {}
    if (reply.about?.itemId) {
      const items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
      const it = items?.[reply.about.itemId]
      if (it) {
        const banned = it.types.includes('noFlea')
        const sell = [...it.sellToTrader].sort((x, y) => y.priceRUB - x.priceRUB)[0]
        const ctx = context(data, items)
        const need = ctx.needFor?.(it.id)
        const have = need ? (ctx.collected?.[need.itemId] ?? 0) : 0
        out.item = {
          name: it.name,
          iconLink: it.iconLink,
          flea: banned ? null : it.avg24hPrice,
          trader: sell ? { name: data.traders.find((t) => t.id === sell.traderId)?.name ?? 'Trader', price: sell.priceRUB } : null,
          fleaLevel: it.fleaLevel ?? null,
          banned,
          needed: need ? Math.max(0, need.total - have) : 0,
          fir: (need?.fir ?? 0) > 0,
        }
      }
    }
    if (reply.about?.questId) {
      const t = tasks.find((x) => x.id === reply.about!.questId)
      if (t) out.quest = { trader: t.trader.name, map: t.map?.name ?? null, status: STATUS_LABEL[statuses[t.id] ?? 'locked'], level: t.minPlayerLevel, objectives: t.objectives.filter((o) => !o.optional).map((o) => o.description).slice(0, 6) }
    }
    if (reply.map) {
      const m = reply.map
      out.map = {
        mapKey: m.map.normalizedName,
        mapName: m.map.name,
        points: m.points.slice(0, 40).map((p) => ({ ...p.position, label: p.label, kind: p.kind })),
        path: m.path ?? m.route ?? undefined,
        ...(m.view?.focus ? { focus: m.view.focus } : {}),
        ...(m.view?.zoomDelta ? { zoomDelta: m.view.zoomDelta } : {}),
      }
    }
    return out
  }

  /** The pop-up over the game: until when it shows (Infinity = until "close"), and what it last showed. */
  const popupUntil = useRef(0)
  const popupOpen = () => popupUntil.current > Date.now()
  const showPopupData = (data: PopupData) => {
    lastPopup.current = data
    popupUntil.current = data.autoCloseSeconds ? Date.now() + data.autoCloseSeconds * 1000 : Infinity
    void window.desktop?.showPopup(data)
  }
  /** A quest's guide pictures from the wiki, added under the pop-up's map once they have loaded. */
  const addQuestPictures = (data: PopupData, questId: string) => {
    const t = tasks.find((x) => x.id === questId)
    const title = guideTitle(t?.wikiLink)
    if (!title) return
    void queryClient
      .fetchQuery({ queryKey: ['wikiGuide', title] as const, queryFn: ({ signal }) => fetchWikiGuide(title, signal), staleTime: 7 * 24 * 3_600_000 })
      .then((g) => {
        const images = g.images.slice(0, 3).map((im) => ({ thumb: im.thumb, caption: im.caption }))
        // Still the same pop-up, still open: add the pictures, keeping the time it had left.
        if (!images.length || lastPopup.current !== data || !popupOpen()) return
        const left = popupUntil.current === Infinity ? 0 : Math.max(1, Math.ceil((popupUntil.current - Date.now()) / 1000))
        showPopupData({ ...data, images, autoCloseSeconds: data.paused ? 0 : left })
      })
      .catch(() => undefined)
  }

  /** The map the player is looking at ("zoom in on D3" works on it): the answer's own card, and the view on it. */
  const viewBase = useRef<MapCard | null>(null)
  const viewState = useRef<{ focus?: Position[]; zoomDelta: number; extra?: MapPoint[] }>({ zoomDelta: 0 })
  const mapViewReply = (view: MapView): Reply | null => {
    const base = viewBase.current
    const data = gameData.data
    const cfg = base && findMapConfig(base.map.normalizedName)
    if (!base || !data || !cfg) return null
    const layer = resolveBaseLayer(cfg, useUiStore.getState().baseLayerByMap[cfg.key])
    const st = viewState.current
    let text: string
    let lines: string[] | undefined
    let extra: MapPoint[] = []
    if (view.kind === 'all') {
      viewState.current = { zoomDelta: 0 }
      text = `The whole of ${base.map.name}.`
    } else if (view.kind === 'zoom') {
      viewState.current = { focus: st.focus, extra: st.extra, zoomDelta: Math.max(-3, Math.min(4, st.zoomDelta + view.delta)) }
      extra = st.extra ?? []
      text = view.delta > 0 ? 'Zoomed in.' : 'Zoomed out.'
    } else if (view.kind === 'area') {
      viewState.current = { focus: areaCorners(layer.affine, layer.bounds, view.fx0, view.fy0, view.fx1, view.fy1).map((p) => ({ x: p.x, y: 0, z: p.z })), zoomDelta: 0 }
      text = `Zoomed in on ${view.label} of ${base.map.name}.`
    } else {
      const corners = cellCorners(layer.affine, layer.bounds, view.cell)
      if (!corners) return null
      viewState.current = { focus: corners.map((p) => ({ x: p.x, y: 0, z: p.z })), zoomDelta: 0 }
      // Quests with something to do in that square.
      const map = data.maps.find((m) => m.normalizedName === base.map.normalizedName)
      const here = map
        ? buildMapTasks(data, map.id, layer)
            .filter((mt) => statuses[mt.task.id] === 'available' && isFactionEligible(mt.task, faction))
            .map((mt) => ({ task: mt.task, spots: mt.placements.filter((p) => cellOf(layer.affine, layer.bounds, p.position) === view.cell) }))
            .filter((x) => x.spots.length)
        : []
      extra = here.flatMap((x) => x.spots.slice(0, 3).map((p, i) => ({ id: `cq-${x.task.id}-${i}`, position: p.position, label: x.task.name, kind: 'quest' as const }))).slice(0, 15)
      viewState.current.extra = extra
      text = `Zoomed in on ${view.cell}.`
      lines = here.length ? [`Quests here: ${here.slice(0, 5).map((x) => x.task.name).join(', ')}${here.length > 5 ? ` +${here.length - 5}` : ''}`, 'Say a quest name for its details and pictures.'] : ['No quests you can do have anything in this square.']
    }
    const v = viewState.current
    return { text, lines, map: { ...base, points: [...base.points, ...extra], view: { focus: v.focus, zoomDelta: v.zoomDelta } }, mapId: base.map.id }
  }

    const popupExtrasRef = useRef(popupExtras)
  const popupShowRef = useRef(showPopupData)
  const popupOpenRef = useRef(popupOpen)
  const popupPicturesRef = useRef(addQuestPictures)
  useEffect(() => {
    popupExtrasRef.current = popupExtras
    popupShowRef.current = showPopupData
    popupOpenRef.current = popupOpen
    popupPicturesRef.current = addQuestPictures
  })

  const present = useCallback(
    (id: number, given: Reply) => {
      // How the player wants to be called ("sir", their name, nothing).
      const style = useAssistantMemory.getState().style
      let reply = { ...given, text: addressed(given.text, style.address ?? 'sir') }
      // "Collected 2 GPUs": done at once, with Undo (a guess still asks first).
      if (reply.confirm && !reply.weak) {
        const c = reply.confirm
        const mode = useProgressStore.getState().gameMode
        useInventoryStore.getState().setCollected(mode, c.itemId, c.to)
        reply = { ...reply, text: c.doneText, lines: (reply.lines ?? []).filter((l) => !l.startsWith('Say "yes"')), confirm: undefined, actions: [undoAction(() => useInventoryStore.getState().setCollected(mode, c.itemId, c.from))] }
      }
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text, reply } : x)))
      if (reply.mapId) lastMapId.current = reply.mapId
      if (reply.youAt) lastPlace.current = reply.youAt
      // "Add 1 GPU": asked first; kept until the next message ("yes" applies it).
      pendingConfirm.current = reply.confirm ?? null
      chat().set({ card: reply.map ?? null })
      // A new map answer is the one "zoom in on D3" works on (view changes keep it).
      if (reply.map && !reply.map.view) {
        viewBase.current = reply.map
        viewState.current = { zoomDelta: 0 }
      }
      // Desktop: answers with details also go in the pop-up over the game (closed by "close that").
      const details = (reply.lines ?? []).filter((l) => !l.startsWith('I took that as'))
      if (window.desktop && useAssistantStore.getState().popup && !reply.quiet && (details.length > 0 || reply.map || reply.about || reply.text.length > 90)) {
        const { popupSeconds } = useAssistantStore.getState()
        // An item or quest gets its card, a place or route a mini-map; the lines the card already shows are left out.
        const extras = popupExtrasRef.current(reply)
        const lines = extras.item ? details.filter((l) => !/^(Flea|No flea|Best trader|Sold by|Still needed|Cannot be sold|Traders sell)/.test(l)).slice(0, 3) : extras.quest ? details.filter((l) => !extras.quest!.objectives.includes(l)).slice(0, 3) : details.slice(0, extras.map ? 4 : 8)
        // With a countdown the pop-up shows the time left and "say pause"; without one, how to close it.
        const stayPaused = !!reply.map?.view && !!lastPopup.current?.paused && popupOpenRef.current()
        const data: PopupData = { title: currentQuestion.current, text: reply.text, lines, hint: popupSeconds ? '' : 'Say "close" to hide this.', autoCloseSeconds: stayPaused ? 0 : popupSeconds, ...(stayPaused ? { paused: true } : {}), ...extras }
        popupShowRef.current(data)
        if (reply.about?.questId) popupPicturesRef.current(data, reply.about.questId)
      }
    },
    [],
  )

  /** Answers with a line on the map get a walking route over the terrain first (built only now, in a few ms). */
  const show = useCallback(
    (id: number, reply: Reply) => {
      if (!reply.map?.route) return present(id, reply)
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'Working out the route…' } : x)))
      chat().set({ pending: id })
      void withWalk(reply)
        .then((r) => {
          present(id, r)
          // "Draw the route on the map": put it on the Maps tab straight away.
          const route = r.actions?.find((a) => a.kind === 'routeOnMap')
          if (route && DRAW_ON_MAP.test(words(currentQuestion.current).join(' '))) runRef.current(`${id}:${r.actions!.indexOf(route)}`, route)
        })
        .finally(() => clearPending(id))
    },
    [present],
  )

  /**
   * `conversation`: heard after the wake word, where the player may be talking to someone else.
   * Then only what is clearly for the assistant is answered; the rest is shown greyed out, not said.
   */
  const ask = (input: string, opts: { conversation?: boolean; itemsTried?: boolean } = {}) => {
    const text = input.trim()
    if (!text) return
    // The item names first (only the very first time; kept offline afterwards): follow-ups ("how much
    // is it") and a bare item name ("LEDX") need them to know what was meant.
    if (!opts.itemsTried && gameData.data && !queryClient.getQueryData(itemKeys.mode(gameMode))) {
      void loadItems().finally(() => askRef.current(input, { ...opts, itemsTried: true }))
      return
    }
    const conversation = !!opts.conversation
    const you = nextId.current++
    const id = nextId.current++
    const at = Date.now()
    setMessages((m) => [...m, { id: you, from: 'you', text, at }, { id, from: 'assistant', text: '…', at }])
    const ignore = () => {
      setMessages((m) => m.filter((x) => x.id !== id).map((x) => (x.id === you ? { ...x, ignored: true } : x)))
      clearPending(id)
      lastIgnored.current = text
    }
    // "Not you": the last thing it answered was said to someone else; such lines are ignored from now on.
    if (NOT_FOR_YOU.test(words(text).join(' '))) {
      const was = lastAnswered.current
      if (was) useAssistantMemory.getState().notForMe(was)
      lastAnswered.current = null
      show(id, { text: was ? "Sorry, sir. I'll stay out of it." : 'Understood, sir.' })
      return
    }
    // "That was for you": answer what it stayed quiet about, and stop ignoring that kind of line.
    if (WAS_FOR_YOU.test(words(text).join(' ')) && lastIgnored.current) {
      const again = lastIgnored.current
      lastIgnored.current = null
      useAssistantMemory.getState().forMe(again)
      setMessages((m) => m.filter((x) => x.id !== you && x.id !== id).map((x) => (x.from === 'you' && x.text === again ? { ...x, ignored: false } : x)))
      askRef.current(again)
      return
    }
    if (conversation && isLearnedChatter(text, useAssistantMemory.getState().chatter)) return ignore()
    // An answer to "Add 1 Graphics card to your Item Collection?"
    const pending = pendingConfirm.current
    pendingConfirm.current = null
    const yesNo = pending ? confirmWord(text) : null
    if (pending && yesNo === 'yes') {
      useInventoryStore.getState().setCollected(useProgressStore.getState().gameMode, pending.itemId, pending.to)
      show(id, { text: pending.doneText, actions: [{ kind: 'setCollected', itemId: pending.itemId, count: pending.from, label: 'Undo' }] })
      return
    }
    if (pending && yesNo === 'no') {
      show(id, { text: 'Okay, nothing changed.' })
      return
    }
    // Answer etiquette, learned from the player: how to call them, "too long", "tell me more", "perfect".
    currentKind.current = 'other'
    const plain = words(text).join(' ')
    currentQuestion.current = text
    // The pop-up over the game: "close that" hides it, "show that again" brings it back.
    // "Maps", "open the flea market", "show quest Debut": go there.
    const command = gameData.data ? parseCommand(text, commandContext(gameData.data)) : null
    if (command) {
      runCommand(command)
      show(id, { text: commandText(command), quiet: true })
      return
    }
    // "Mark Debut done", "Debut should be available", "workbench level 2", "undo that": done at once, with Undo.
    const change = gameData.data ? parseChange(text, changeContext(gameData.data)) : null
    if (change) {
      show(id, applyChange(change))
      return
    }
    if (PAUSE_POPUP.test(plain)) {
      if (window.desktop && lastPopup.current && popupOpen()) {
        showPopupData({ ...lastPopup.current, autoCloseSeconds: 0, paused: true })
        show(id, { text: 'Paused. Say "close" when you are done.', quiet: true })
      } else show(id, { text: 'There is nothing to pause.', quiet: true })
      return
    }
    // "Zoom in on D3", "bottom left corner", "zoom out", "whole map": on the map just shown.
    const view = viewBase.current && (popupOpen() || chat().card) ? parseMapView(text) : null
    const viewReply = view ? mapViewReply(view) : null
    if (viewReply) {
      show(id, viewReply)
      return
    }
    if (CLOSE_POPUP.test(plain)) {
      popupUntil.current = 0
      void window.desktop?.hidePopup()
      show(id, { text: 'Closed.', quiet: true })
      return
    }
    if (SHOW_POPUP_AGAIN.test(plain) && lastPopup.current && window.desktop) {
      showPopupData(lastPopup.current)
      show(id, { text: 'Here it is again.', quiet: true })
      return
    }
    const mem0 = useAssistantMemory.getState()
    const address = parseAddress(text)
    if (address !== null) {
      mem0.setAddress(address)
      show(id, { text: address === 'sir' ? 'Very good, sir.' : address ? `Got it, I'll call you ${address}.` : 'Alright, no more "sir".' })
      return
    }
    const prev = lastReply.current
    if (prev && TOO_LONG.test(plain)) {
      mem0.setKindStyle(prev.kind, 'short')
      show(id, { text: `Got it, I'll keep ${kindWords(prev.kind)} short from now on.` })
      return
    }
    if (prev && TELL_MORE.test(plain)) {
      const rest = (prev.reply.lines ?? []).filter((l) => !l.startsWith('I took that as'))
      const full = mem0.askedMore(prev.kind)
      currentKind.current = prev.kind
      show(id, {
        text: rest.length ? rest.slice(0, 4).map((l) => l.replace(/[.:]$/, '')).join('. ') + '.' : "That's everything I've got on that.",
        lines: [...rest.slice(4), ...(full ? [`From now on I'll give you the full answer for ${kindWords(prev.kind)}.`] : [])],
      })
      return
    }
    if (prev && GOOD_ANSWER.test(plain)) {
      show(id, { text: 'Glad that helped, sir.' })
      return
    }
    // "Forget everything I learned about you?" → yes / no.
    if (pendingForget.current) {
      pendingForget.current = false
      const yn = confirmWord(text)
      if (yn === 'yes') {
        useAssistantMemory.getState().forgetAll()
        show(id, { text: 'Done, sir. Everything I learned about you is forgotten.' })
        return
      }
      if (yn === 'no') {
        show(id, { text: 'Very well, nothing forgotten.' })
        return
      }
    }
    // Memory: what it is told, what words mean, how long answers should be (memory.ts).
    const said = words(text).join(' ')
    const mem = useAssistantMemory.getState()
    const style = parseStyle(text)
    if (style) {
      mem.setStyle(style)
      show(id, { text: style === 'short' ? "Understood, sir. I'll keep it short." : style === 'full' ? 'Very well, sir. I will read everything out.' : 'Back to normal answers, sir.' })
      return
    }
    // "Remember that leddy means LEDX" teaches a word (below), it is not a note.
    const note = parseTeach(text) ? null : parseRemember(text)
    if (note) {
      mem.remember(note)
      show(id, { text: `Noted, sir: ${note}` })
      return
    }
    if (FORGET_LAST.test(said)) {
      const last = mem.notes.at(-1)
      if (last) mem.forgetNote(last.id)
      show(id, { text: last ? `Forgotten: ${last.text}` : 'There is nothing to forget, sir.' })
      return
    }
    if (FORGET_ALL.test(said)) {
      pendingForget.current = true
      show(id, { text: 'Forget every note, word and habit I have learned about you? Say yes to confirm.' })
      return
    }
    // Teaching a word ("xeno means xenomorph sealing foam", "that means …", "no, I meant …"): the
    // meaning must be a real item, quest, place or map, so the item list is loaded first.
    const teachRaw = parseTeach(text)
    const meant = parseMeant(text)
    const cachedForTeach = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    if ((teachRaw || meant) && !cachedForTeach && gameData.data) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'Loading the item list…' } : x)))
      void queryClient
        .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
        .then(() => {
          setMessages((m) => m.filter((x) => x.id !== you && x.id !== id))
          askRef.current(text)
        })
        .catch(() => show(id, { text: 'The item list could not be loaded. Check the internet connection and say it again.' }))
      return
    }
    const realName = (means: string) => (gameData.data ? resolveName(means, gameData.data, cachedForTeach) : null)
    if (teachRaw) {
      // "That means …" / "it means …": the word it did not know a moment ago.
      // After a wrong guess too ("the blue thing" taken for the blue keycard): the last question's word.
      const phrase = /^(that|it|this|those|they)$/.test(teachRaw.phrase) ? (lastUnknown.current ?? (lastQuestion.current ? subjectOf(lastQuestion.current) : null)) : teachRaw.phrase
      if (!phrase) {
        show(id, { text: 'Which word? Say it like "xeno means xenomorph sealing foam".' })
        return
      }
      const name = realName(teachRaw.means)
      if (!name) {
        show(id, { text: `I don't know "${teachRaw.means}" either, sir. Say the name as it is in the game, like "${phrase} means xenomorph sealing foam".` })
        return
      }
      mem.learn(phrase, name)
      lastUnknown.current = null
      show(id, { text: `Got it: "${phrase}" means ${name}. Anything that sounds like it counts too, and you can teach more names for it.` })
      return
    }
    // "No, I meant the Hand drill": learn what the last question's word meant and answer that.
    let question = text
    let prefix = ''
    if (meant) {
      const prev = lastQuestion.current
      const subject = lastUnknown.current ?? (prev ? subjectOf(prev) : null)
      const name = realName(meant) ?? meant
      if (prev && subject && compact(subject) !== compact(name)) {
        if (mem.learning && realName(meant)) {
          mem.learn(subject, name)
          prefix = `Got it, "${subject}" means ${name} from now on. `
        }
        question = applyWords(prev, [{ phrase: subject, means: name, at: 0, uses: 0 }]).text
      } else question = name
      lastUnknown.current = null
    }
    lastQuestion.current = question
    const learned = applyWords(question, useAssistantMemory.getState().words)
    if (learned.used.length) {
      mem.usedWords(learned.used)
      question = learned.text
    }
    const finish = (r: Reply): void => {
      // A key: whether its room is worth it comes from the wiki (cached for a week); wait at most 2.5 s.
      if (r.keyCheck) {
        const check = r.keyCheck
        const base: Reply = { ...r, keyCheck: undefined }
        const title = wikiTitle(check.wikiLink)
        if (!title) return finish(base)
        chat().set({ pending: id })
        const wiki = queryClient.fetchQuery({ queryKey: ['keyWiki', title, 2] as const, queryFn: ({ signal }) => fetchKeyWiki(title, signal), staleTime: 7 * 24 * 3_600_000 })
        const late = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 2_500))
        void Promise.race([wiki, late])
          .then((w) => {
            const worth = w ? keyWorthText(keyVerdict({ behind: w.behind, questNames: check.questNames })) : null
            finish(worth ? { ...base, text: `${base.text} ${worth}` } : base)
          })
          .catch(() => finish(base))
          .finally(() => clearPending(id))
        return
      }
      if (conversation) lastAnswered.current = text
      lastReply.current = { reply: r, kind: currentKind.current }
      show(id, prefix ? { ...r, text: prefix + r.text } : r)
    }

    const data = gameData.data
    if (!data) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'The game data is still loading. Ask again in a moment.' } : x)))
      return
    }
    // In a hands-free conversation, only clear questions and requests are answered; talk to
    // friends ("push left", "nice one") is left alone without even trying.
    // Follow-ups: "how much is it worth" after the LEDX, "and on Woods?" after Customs' extracts.
    const cachedNow = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const slotted = nameSlots(question, context(data, cachedNow))
    // An item's name on its own ("LEDX", "dorms marked key") is asking about it, also mid-conversation.
    const onlyItem = !!slotted.slots.item && words(slotted.masked).every((w) => ['item', 'the', 'a', 'an'].includes(w))
    if (conversation && !onlyItem && !looksAsked(said, useAssistantStore.getState().wakeName)) return ignore()
    const again = followUp(question, slotted, lastSlotted.current)
    if (again) question = again
    lastSlotted.current = again ? nameSlots(again, context(data, cachedNow)) : Object.keys(slotted.slots).length ? slotted : lastSlotted.current
    if (WHAT_YOU_KNOW.test(said)) return show(id, knowReply(data, mem))
    if (RECOMMEND.test(said)) return finish(recommendReply(data, statuses, onMap(data), mem.habits))
    // "Where's MY 314 key?": the player's own note first.
    const own = asksAboutOwn(question) ? findNote(mem.notes, question) : null
    if (own) return finish(noteReply(own))
    mem.ask(askKind(question))
    currentKind.current = askKind(question)
    const cachedItems = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    // Not understood: offer to learn the word ("xeno means …").
    const teachHint = (r: Reply): Reply => {
      if (!/^Sorry, I did not (get that|find that item)/.test(r.text)) {
        lastUnknown.current = null
        return r
      }
      const word = subjectOf(question)
      lastUnknown.current = word
      return word ? { ...r, text: `Sorry, I don't know "${word}". If it is a nickname, say "${word} means" and the full name.`, lines: undefined } : r
    }
    // Not understood by the rules: the small paraphrase model finds which known question it means
    // ("yo what's a LEDX going for" → "how much is LEDX worth"), asked instead; else offer teaching.
    const notUnderstood = (r: Reply) => /^Sorry, I did not (get that|find that item)/.test(r.text)
    // When the rules guessed (weak) or did not understand, the helper decides; when they were sure,
    // only a near-certain match that covers every name in the question changes the answer, and only
    // if the helper is loaded already (it is never loaded just to double-check).
    const plainEnglish = (r: Reply, items: ItemsById | undefined) => {
      const unsure = notUnderstood(r) || r.weak
      if (!unsure && !nluLoaded()) return finish(r)
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'Thinking…' } : x)))
      chat().set({ pending: id })
      // In a conversation the helper must be surer: a near match there is more likely chatter.
      const need = notUnderstood(r) ? (conversation ? 0.72 : 0.62) : r.weak ? (conversation ? 0.78 : 0.7) : 0.88
      const status = (msg: string) => setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: msg } : x)))
      // Item names must be known to be swapped for "item" ("is a GPU expensive"): the item list first.
      const withItems = items ? Promise.resolve(items) : queryClient.fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) }).then((x) => x.items)
      let all: ItemsById | undefined
      let names = 0
      void withItems
        .then((loaded) => {
          all = loaded
          const slotted = nameSlots(question, context(data, loaded))
          names = slotted.names
          return understandQuestion(slotted.masked, slotted.slots, question, status, need)
        })
        .then((hit) => {
          // A sure answer is only replaced when the helper's question uses every name that was said.
          const covers = hit && (unsure || hit.slots === names)
          const again = hit && covers ? answer(hit.ask, context(data, all)) : null
          // The same answer the rules gave: no "I took that as" note.
          if (hit && again && again.text === r.text) finish(r)
          else if (hit && again && !again.needsItems && !notUnderstood(again) && words(hit.ask).join(' ') !== words(question).join(' ')) finish({ ...again, lines: [`I took that as: "${hit.ask}"`, ...(again.lines ?? [])] })
          // In a conversation, what is not understood (or only guessed) was most likely said to someone else.
          else if (conversation && unsure) ignore()
          else finish(notUnderstood(r) ? teachHint(r) : r)
        })
        .catch(() => (conversation && unsure ? ignore() : finish(notUnderstood(r) ? teachHint(r) : r)))
        .finally(() => clearPending(id))
    }
    const reply = answer(question, context(data, cachedItems))
    if (!reply.needsItems) {
      // Not understood, but it matches something the player told me: say that instead.
      const fromNote = reply.text.startsWith('Sorry, I did not get that') ? findNote(mem.notes, question) : null
      if (fromNote) finish(noteReply(fromNote))
      else plainEnglish(reply, cachedItems)
      return
    }
    // A question about an item: load the item list once (shared with the other tabs), then answer.
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text } : x)))
    chat().set({ pending: id })
    queryClient
      .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
      .then((r) => {
        const again = answer(question, context(data, r.items))
        plainEnglish(again.needsItems ? { text: 'Sorry, I did not find that item.' } : again, r.items)
      })
      .catch(() => show(id, { text: 'The item list could not be loaded. Check the internet connection and ask again.' }))
      .finally(() => clearPending(id))
  }

  // Voice input: the words it may hear are the app's own names plus question words.
  const names = useMemo(() => {
    const data = gameData.data
    if (!data) return []
    const extracts = Object.values(data.mapDetails).flatMap((d) => (d?.extracts ?? []).map((e) => e.name))
    return [...data.maps.map((m) => m.name), ...ALL_PLACES.map((p) => p.name), ...extracts, ...tasks.map((t) => t.name)]
  }, [gameData.data, tasks])
  // Item names too ("battery", "LEDX", "dorm 303 key"), worked out once per item list.
  const vocabCache = useRef<{ names: string[]; items: ItemsById | undefined; words: string[] } | null>(null)
  const vocabularyFor = (items: ItemsById | undefined) => {
    const c = vocabCache.current
    if (c && c.names === names && c.items === items) return c.words
    const itemNames = items ? Object.values(items).flatMap((it) => [it.name, it.shortName]) : []
    const result = voiceVocabulary([...names, ...itemNames])
    vocabCache.current = { names, items, words: result }
    return result
  }
  const loadItems = async () =>
    queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items ??
    queryClient
      .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
      .then((r) => r.items)
      .catch(() => undefined)

  // Spoken questions: game names put back where the speech model wrote English ("pox a ram" →
  // Poxeram, phonetic.ts), and Vosk's version used when Moonshine's cannot be understood.
  const soundCache = useRef<{ names: string[]; items: ItemsById | undefined; list: SoundName[] } | null>(null)
  const soundNamesFor = (items: ItemsById | undefined) => {
    const c = soundCache.current
    if (c && c.names === names && c.items === items) return c.list
    const data = gameData.data
    const extra = data ? [...data.traders.map((t) => t.name), ...Object.values(data.mobNames)] : []
    const itemNames = items ? Object.values(items).flatMap((it) => [it.name, it.shortName]) : []
    const list = buildSoundNames([...names, ...extra, ...itemNames])
    soundCache.current = { names, items, list }
    return list
  }
  const understood = (text: string) => {
    const data = gameData.data
    if (!data) return true
    const items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const r = answer(text, context(data, items))
    return !/^(Sorry, I did not|Which item\?|I could not find|I did not find)/.test(r.text)
  }
  /** The game's abbreviations (item short names in capitals: GPU, CPU, LEDX, SSD …), lower case. */
  const acronymCache = useRef<{ items: ItemsById | undefined; set: Set<string> } | null>(null)
  const acronymsFor = (items: ItemsById | undefined): Set<string> => {
    const cached = acronymCache.current
    if (cached && cached.items === items) return cached.set
    const set = new Set(['gpu', 'cpu', 'ledx', 'fir', 'pmc', 'btr', 'sas'])
    for (const it of Object.values(items ?? {})) if (/^[A-Z]{2,6}$/.test(it.shortName)) set.add(it.shortName.toLowerCase())
    acronymCache.current = { items, set }
    return set
  }
  const heard = (said: string, saidAlt?: string): string => {
    const items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const list = soundNamesFor(items)
    // Spelled-out abbreviations ("gee pee you", "see pee you") back to the game's short names.
    const acronyms = acronymsFor(items)
    const raw = acronymize(said, acronyms)
    const alt = saidAlt && acronymize(saidAlt, acronyms)
    // Teaching a nickname: keep the nickname as it was heard (it is not a game name yet).
    if (parseTeach(raw)) return raw
    // How this player's words come out of the speech model, learned in the background (pronunciation.ts).
    const mem = useAssistantMemory.getState()
    const known = knownWordsFor(list)
    const text = applyHeard(raw, mem.heard, (w) => known.has(w) || isEverydayWord(w)).text
    const snapped = snapToNames(text, list)
    const main = snapped.text
    // A name fixed by sound, in a question that was then understood: remember how it was said.
    const learn = (fixed: { heard: string; name: string }[]) => {
      for (const f of fixed) mem.heardAs(f.heard, f.name)
    }
    // Memory commands ("remember that …") are kept as Moonshine heard them: Vosk only knows game words.
    if (!alt || alt === main || /^(remember|note to self|forget|no i meant|i meant|when i say|keep it short|more detail|what do you know)/.test(words(main).join(' ')) || parseTeach(main)) {
      if (understood(main)) {
        learn(snapped.fixed)
        fromRepeat(main)
      } else lastHeard.current = { raw, at: Date.now() }
      return main
    }
    if (understood(main)) {
      learn(snapped.fixed)
      fromRepeat(main)
      return main
    }
    const second = snapToNames(alt, list)
    if (!understood(second.text)) {
      lastHeard.current = { raw, at: Date.now() }
      return main
    }
    learn(second.fixed)
    // Moonshine's words that Vosk heard as a name: remember those too when the sentence lines up.
    const mw = words(main)
    const aw = words(second.text)
    if (mw.length === aw.length) for (let i = 0; i < mw.length; i++) if (mw[i] !== aw[i] && !isEverydayWord(mw[i]) && known.has(aw[i])) mem.heardAs(mw[i], aw[i])
    fromRepeat(second.text)
    return second.text
  }
  /** The last spoken question it did not understand, for learning from the player saying it again. */
  const lastHeard = useRef<{ raw: string; at: number } | null>(null)
  /** Said again and understood this time: what changed is what the first try meant (used from now on). */
  const fromRepeat = (understoodText: string) => {
    const prev = lastHeard.current
    lastHeard.current = null
    if (!prev || Date.now() - prev.at > REPEAT_WINDOW_MS) return
    const fix = repeatFix(prev.raw, understoodText)
    if (fix) useAssistantMemory.getState().heardAs(fix.heard, fix.meant, 2)
  }
  /** Every word of every game name, for the learned letter swaps (built once per name list). */
  const knownCache = useRef<{ list: SoundName[]; set: Set<string> } | null>(null)
  const knownWordsFor = (list: SoundName[]): Set<string> => {
    const c = knownCache.current
    if (c && c.list === list) return c.set
    const set = new Set<string>()
    for (const n of list) for (const w of words(n.name)) set.add(w)
    knownCache.current = { list, set }
    return set
  }
  const heardRef = useRef(heard)
  useEffect(() => {
    heardRef.current = heard
  })

  const stopListening = useRef<(() => void) | null>(null)
  const askRef = useRef(ask)
  const runRef = useRef(run)
  useEffect(() => {
    askRef.current = ask
    runRef.current = run
  })
  // Wake word ("Hey Ranger"): while it is on, the mic button and hotkey start a conversation instead.
  const wakeRef = useRef<WakeListener | null>(null)
  const startListening = useCallback(async () => {
    if (wakeRef.current) {
      wakeRef.current.wake()
      return
    }
    if (stopListening.current || !names.length) return
    let cancelled = false
    stopListening.current = () => {
      cancelled = true
    }
    if (!queryClient.getQueryData(itemKeys.mode(gameMode))) setListen({ state: 'loading', detail: 'Loading item names (first time)…' })
    const items = await loadItems()
    if (cancelled) {
      stopListening.current = null
      setListen({ state: 'idle' })
      return
    }
    stopListening.current = listenOnce(vocabularyFor(items), {
      onState: (state, detail) => {
        setListen({ state, detail })
        if (state === 'idle') stopListening.current = null
      },
      onPartial: (text) => setListen({ state: 'listening', detail: text }),
      onResult: (text, alt) => {
        stopListening.current = null
        if (text) askRef.current(heardRef.current(text, alt))
        else setListen({ state: 'idle', detail: 'I did not catch that. Try again.' })
      },
      onError: (message) => {
        stopListening.current = null
        setListen({ state: 'idle', detail: message })
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vocabularyFor/loadItems read refs and the query cache; names covers their inputs
  }, [names, queryClient, gameMode])
  useEffect(() => () => stopListening.current?.(), [])

  // What the Neural network tab's buttons call.
  useEffect(() => {
    chat().set({
      ask: (text, opts) => askRef.current(text, opts),
      run: (key, action) => runRef.current(key, action),
      toggleListening: () => (stopListening.current ? stopListening.current() : void startListening()),
    })
  }, [startListening])

  const wakeOn = voice.wakeWord
  const commandsOn = voice.commands
  const wakeName = voice.wakeName
  useEffect(() => {
    if (!wakeOn || !names.length) return
    let cancelled = false
    let listener: WakeListener | null = null
    const called = wakeName[0].toUpperCase() + wakeName.slice(1)
    const waitingText = `Say "Hey ${called}" to talk to the assistant.`
    void (async () => {
      if (!queryClient.getQueryData(itemKeys.mode(gameMode))) setListen({ state: 'loading', detail: 'Loading item names (first time)…' })
      const items = await loadItems()
      if (cancelled) return
      const data = gameData.data
      listener = startWakeListening(wakeName, vocabularyFor(items), {
        // Without the name: "Maps", "flea market", "show quest Debut" … said on their own.
        commands:
          commandsOn && data
            ? {
                words: [...commandWords(commandRef.current.context(data)), ...POPUP_WORDS],
                isCommand: (t) => parseCommand(t, commandRef.current.context(data)) !== null || commandRef.current.popupControl(t),
                needsTranscribing: (t) => NEEDS_TRANSCRIBING.test(t),
                run: (text, alt) => {
                  const said = heardRef.current(text, alt)
                  const ctx = commandRef.current.context(data)
                  const cmd = parseCommand(said, ctx) ?? parseCommand(alt, ctx)
                  const at = Date.now()
                  if (!cmd && commandRef.current.popupControl(said)) {
                    askRef.current(said)
                    return
                  }
                  if (!cmd) {
                    // "Zoom to Debut" also works without the name (it only moves the map).
                    const change = parseChange(said, commandRef.current.changes(data))
                    if (change?.kind !== 'zoomQuest') return
                    const r = commandRef.current.apply(change)
                    setMessages((m) => [...m, { id: nextId.current++, from: 'you', text: said, at }, { id: nextId.current++, from: 'assistant', text: r.text, at }])
                    return
                  }
                  commandRef.current.run(cmd)
                  setMessages((m) => [...m, { id: nextId.current++, from: 'you', text: said, at }, { id: nextId.current++, from: 'assistant', text: commandText(cmd), at }])
                },
              }
            : undefined,
        onState: (state, detail) => setListen({ state: state === 'waiting' ? 'idle' : state, detail: state === 'waiting' ? waitingText : detail }),
        onWake: () => {
          warmNlu()
          chat().set({ talking: true })
          setListen({ state: 'listening', detail: `Listening. Say "thanks, that's all" when you are done.` })
          const greeting = greetingRef.current()
          if (greeting) setMessages((m) => [...m, { id: nextId.current++, from: 'assistant', text: greeting, at: Date.now() }])
        },
        onQuestion: (text, alt) => askRef.current(heardRef.current(text, alt), { conversation: true }),
        onEnd: () => {
          chat().set({ talking: false })
          setListen({ state: 'idle', detail: waitingText })
        },
        onPartial: (text) => setListen({ state: 'listening', detail: text }),
        onError: (message) => setListen({ state: 'idle', detail: message }),
      })
      wakeRef.current = listener
    })()
    return () => {
      cancelled = true
      listener?.stop()
      wakeRef.current = null
      chat().set({ talking: false })
      setListen({ state: 'idle' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vocabularyFor/loadItems read refs and the query cache; names covers their inputs
  }, [wakeOn, wakeName, commandsOn, names, queryClient, gameMode])

  // Opening the assistant's tab: the day's greeting, once.
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/neural' || chat().messages.length) return
    const greeting = greetingRef.current()
    if (!greeting) return
    setMessages((m) => [...m, { id: nextId.current++, from: 'assistant', text: greeting, at: Date.now() }])
  }, [pathname, gameData.data])

  // Habits: every raid in the old game logs, read once (later raids are counted live).
  const learning = useAssistantMemory((m) => m.learning)
  const seededAt = useAssistantMemory((m) => m.seededAt)
  useEffect(() => {
    const maps = gameData.data?.maps
    if (!window.desktop || !learning || seededAt || !maps) return
    let cancelled = false
    void window.desktop
      .readLogStats()
      .then((stats) => {
        if (cancelled) return
        const mem = useAssistantMemory.getState()
        mem.seed(habitsFromLogs(stats.events, maps, useRaidLogStore.getState().byMode, mem.habits.asks), Date.now())
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [learning, seededAt, gameData.data])

  // The desktop hotkey asks to listen.
  const listenRequest = useAssistantListenStore((st) => st.request)
  const handledRequest = useRef(0)
  useEffect(() => {
    if (!listenRequest || listenRequest === handledRequest.current || !names.length) return
    handledRequest.current = listenRequest
    void startListening()
  }, [listenRequest, names, startListening])

  return null
}
