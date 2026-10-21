import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { itemKeys, useCrafts, useGameData, useHideout } from '../api/hooks'
import { fetchItems } from '../api/queries'
import type { GameData, GameMap, ItemsById } from '../api/types'
import { computeNeeds, type ItemNeed } from '../lib/needs'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { useAssistantStore } from '../store/assistant'
import { useAssistantChat, type ChatMessage } from '../store/assistantChat'
import { useAssistantListenStore } from '../store/assistantListen'
import { useAssistantRouteStore } from '../store/assistantRoute'
import { useInventoryStore, useModeInventory } from '../store/inventory'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useProfile, useProgressStore } from '../store/progress'
import { useRaidBriefingStore } from '../store/raidBriefing'
import { useUiStore } from '../store/ui'
import { answer, type AssistantAction, type AssistantContext, type Reply } from './engine'
import { headingOnMap } from './heading'
import { confirmWord } from './items'
import { listenOnce, type ListenState } from './listen'
import { ALL_PLACES, type Place } from './places'
import { onSpeakingChange, speak, stopSpeaking } from './speech'
import { voiceVocabulary } from './spoken'
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
  const nextId = useRef(1)
  const navigate = useNavigate()

  /** Runs an offered action (only ever from a click on its button). */
  const run = (key: string, a: AssistantAction) => {
    chat().set({ done: [...chat().done, key] })
    if (a.kind === 'setCollected') {
      useInventoryStore.getState().setCollected(useProgressStore.getState().gameMode, a.itemId, a.count)
      pendingConfirm.current = null
      return
    }
    if (a.kind === 'complete') {
      useProgressStore.getState().setTaskCompleted(a.taskId, a.done)
      return
    }
    if (a.kind === 'openWeapon') return navigate(`/weapons?weapon=${encodeURIComponent(a.itemId)}`)
    if (a.kind === 'showOnMap') useMapOverlayStore.getState().setTasksChecked([a.taskId], true)
    if (a.kind === 'routeOnMap') useAssistantRouteStore.getState().set({ mapKey: a.mapKey, path: a.path, fromLabel: a.fromLabel, toLabel: a.toLabel })
    useUiStore.getState().setLastMapKey(a.mapKey)
    navigate('/maps')
  }

  const tasks = useMemo(() => (gameData.data?.tasks ?? []).filter((t) => isFactionEligible(t, profile.faction)), [gameData.data, profile.faction])
  const statuses = useMemo(() => computeTaskStatuses(tasks, profile), [tasks, profile])
  const faction = profile.faction

  // Item Collection: the same "still needed" numbers as the Item Collection page.
  const inventory = useModeInventory()
  const favoriteCraftIds = useInventoryStore((st) => st.favoriteCraftIds)
  const hideout = useHideout()
  const crafts = useCrafts()
  const needsCache = useRef<{ inputs: unknown[]; list: ItemNeed[] } | null>(null)
  const needsFor = (data: GameData, items: ItemsById | undefined): ItemNeed[] => {
    const inputs = [data, items, profile.completedTaskIds, profile.faction, hideout.data, crafts.data, inventory.stationLevels, favoriteCraftIds]
    const c = needsCache.current
    if (c && c.inputs.every((v, i) => v === inputs[i])) return c.list
    const list = [
      ...computeNeeds({ tasks: data.tasks, completedTaskIds: profile.completedTaskIds, faction: profile.faction, stations: hideout.data ?? [], stationLevels: inventory.stationLevels, crafts: crafts.data ?? [], favoriteCraftIds, items }).values(),
    ]
    needsCache.current = { inputs, list }
    return list
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
    }
  }

  const present = useCallback(
    (id: number, reply: Reply) => {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text, reply } : x)))
      if (reply.mapId) lastMapId.current = reply.mapId
      if (reply.youAt) lastPlace.current = reply.youAt
      // "Add 1 GPU": asked first; kept until the next message ("yes" applies it).
      pendingConfirm.current = reply.confirm ?? null
      chat().set({ card: reply.map ?? null })
      if (voice.speak && !reply.quiet) speak(reply.text, { ...voice, onStatus: (m) => m && chat().listen.state === 'idle' && setListen({ state: 'idle', detail: m }) })
    },
    [voice],
  )

  /** Answers with a line on the map get a walking route over the terrain first (built only now, in a few ms). */
  const show = useCallback(
    (id: number, reply: Reply) => {
      if (!reply.map?.route) return present(id, reply)
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'Working out the route…' } : x)))
      chat().set({ pending: id })
      void withWalk(reply)
        .then((r) => present(id, r))
        .finally(() => clearPending(id))
    },
    [present],
  )

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    const you = nextId.current++
    const id = nextId.current++
    const at = Date.now()
    setMessages((m) => [...m, { id: you, from: 'you', text, at }, { id, from: 'assistant', text: '…', at }])
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
    const data = gameData.data
    if (!data) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'The game data is still loading. Ask again in a moment.' } : x)))
      return
    }
    const cachedItems = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const reply = answer(text, context(data, cachedItems))
    if (!reply.needsItems) {
      show(id, reply)
      return
    }
    // A question about an item: load the item list once (shared with the other tabs), then answer.
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text } : x)))
    chat().set({ pending: id })
    queryClient
      .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
      .then((r) => {
        const again = answer(text, context(data, r.items))
        show(id, again.needsItems ? { text: 'Sorry, I did not find that item.' } : again)
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

  const stopListening = useRef<(() => void) | null>(null)
  const askRef = useRef(ask)
  const runRef = useRef(run)
  useEffect(() => {
    askRef.current = ask
    runRef.current = run
  })
  // Wake word ("Hey Ranger"): while it is on, the mic button and hotkey start a conversation instead.
  const wakeRef = useRef<WakeListener | null>(null)
  const voiceRef = useRef(voice)
  useEffect(() => {
    voiceRef.current = voice
  })
  const startListening = useCallback(async () => {
    if (wakeRef.current) {
      wakeRef.current.wake()
      return
    }
    if (stopListening.current || !names.length) return
    stopSpeaking()
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
      onResult: (text) => {
        stopListening.current = null
        if (text) askRef.current(text)
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
      ask: (text) => askRef.current(text),
      run: (key, action) => runRef.current(key, action),
      toggleListening: () => (stopListening.current ? stopListening.current() : void startListening()),
    })
  }, [startListening])

  const wakeOn = voice.wakeWord
  const wakeName = voice.wakeName
  useEffect(() => {
    if (!wakeOn || !names.length) return
    let cancelled = false
    let listener: WakeListener | null = null
    let offSpeaking = () => {}
    const called = wakeName[0].toUpperCase() + wakeName.slice(1)
    const waitingText = `Say "Hey ${called}" to talk to the assistant.`
    const say = (text: string) => {
      const v = voiceRef.current
      if (v.speak) void speak(text, v)
    }
    void (async () => {
      if (!queryClient.getQueryData(itemKeys.mode(gameMode))) setListen({ state: 'loading', detail: 'Loading item names (first time)…' })
      const items = await loadItems()
      if (cancelled) return
      listener = startWakeListening(wakeName, vocabularyFor(items), {
        onState: (state, detail) => setListen({ state: state === 'waiting' ? 'idle' : state, detail: state === 'waiting' ? waitingText : detail }),
        onWake: () => {
          stopSpeaking()
          chat().set({ talking: true })
          setListen({ state: 'listening', detail: `Listening. Say "thanks, that's all" when you are done.` })
          say('Yes sir?')
        },
        onQuestion: (text) => askRef.current(text),
        onEnd: (idle) => {
          chat().set({ talking: false })
          setListen({ state: 'idle', detail: waitingText })
          if (!idle) say('Anytime.')
        },
        onPartial: (text) => setListen({ state: 'listening', detail: text }),
        onError: (message) => setListen({ state: 'idle', detail: message }),
      })
      wakeRef.current = listener
      // Do not listen to its own voice.
      offSpeaking = onSpeakingChange((on) => listener?.pause(on))
    })()
    return () => {
      cancelled = true
      offSpeaking()
      listener?.stop()
      wakeRef.current = null
      chat().set({ talking: false })
      setListen({ state: 'idle' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vocabularyFor/loadItems read refs and the query cache; names covers their inputs
  }, [wakeOn, wakeName, names, queryClient, gameMode])

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
