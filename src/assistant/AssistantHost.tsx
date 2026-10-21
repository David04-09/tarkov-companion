import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { itemKeys, useCrafts, useGameData, useHideout } from '../api/hooks'
import { fetchItems } from '../api/queries'
import type { GameData, GameMap, ItemsById } from '../api/types'
import { computeNeeds, type ItemNeed } from '../lib/needs'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
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
import { answer, type AssistantAction, type AssistantContext, type Reply } from './engine'
import { headingOnMap } from './heading'
import { confirmWord } from './items'
import { listenOnce, type ListenState } from './listen'
import { ALL_PLACES, type Place } from './places'
import { cutCount, onSpeakingChange, speak, stopSpeaking } from './speech'
import { applyWords, askKind, asksAboutOwn, findNote, firstSentence, FORGET_ALL, FORGET_LAST, greetingText, parseMeant, parseRemember, parseStyle, parseTeach, subjectOf, wantsShort, WHAT_YOU_KNOW } from './memory'
import { greetingFacts, habitsFromLogs, knowReply, noteReply, RECOMMEND, recommendReply } from './memoryAnswers'
import { words } from './text'
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
  /** "Forget everything?" asked, waiting for yes. */
  const pendingForget = useRef(false)
  /** The last question as asked, for "no, I meant …". */
  const lastQuestion = useRef<string | null>(null)
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

  const present = useCallback(
    (id: number, reply: Reply) => {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text, reply } : x)))
      if (reply.mapId) lastMapId.current = reply.mapId
      if (reply.youAt) lastPlace.current = reply.youAt
      // "Add 1 GPU": asked first; kept until the next message ("yes" applies it).
      pendingConfirm.current = reply.confirm ?? null
      chat().set({ card: reply.map ?? null })
      if (voice.speak && !reply.quiet) {
        const cutBefore = cutCount()
        const said = wantsShort(useAssistantMemory.getState().style) ? firstSentence(reply.text) : reply.text
        void speak(said, { ...voice, onStatus: (m) => m && chat().listen.state === 'idle' && setListen({ state: 'idle', detail: m }) }).then(() => useAssistantMemory.getState().spoke(cutCount() > cutBefore))
      }
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

  const ask = (input: string) => {
    const text = input.trim()
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
    const note = parseRemember(text)
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
    const teach = parseTeach(text)
    if (teach) {
      mem.learn(teach.phrase, teach.means)
      show(id, { text: `Got it: when you say "${teach.phrase}" you mean ${teach.means}.` })
      return
    }
    // "No, I meant the Hand drill": learn what the last question's word meant and answer that.
    let question = text
    let prefix = ''
    const meant = parseMeant(text)
    if (meant) {
      const prev = lastQuestion.current
      const subject = prev ? subjectOf(prev) : null
      if (prev && subject && subject !== meant) {
        if (mem.learning) {
          mem.learn(subject, meant)
          prefix = `Got it, "${subject}" means ${meant} from now on. `
        }
        question = applyWords(prev, [{ phrase: subject, means: meant, at: 0, uses: 0 }]).text
      } else question = meant
    }
    lastQuestion.current = question
    const learned = applyWords(question, useAssistantMemory.getState().words)
    if (learned.used.length) {
      mem.usedWords(learned.used)
      question = learned.text
    }
    const finish = (r: Reply) => show(id, prefix ? { ...r, text: prefix + r.text } : r)

    const data = gameData.data
    if (!data) {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'The game data is still loading. Ask again in a moment.' } : x)))
      return
    }
    if (WHAT_YOU_KNOW.test(said)) return show(id, knowReply(data, mem))
    if (RECOMMEND.test(said)) return finish(recommendReply(data, statuses, onMap(data), mem.habits))
    // "Where's MY 314 key?": the player's own note first.
    const own = asksAboutOwn(question) ? findNote(mem.notes, question) : null
    if (own) return finish(noteReply(own))
    mem.ask(askKind(question))
    const cachedItems = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const reply = answer(question, context(data, cachedItems))
    if (!reply.needsItems) {
      // Not understood, but it matches something the player told me: say that instead.
      const fromNote = reply.text.startsWith('Sorry, I did not get that') ? findNote(mem.notes, question) : null
      finish(fromNote ? noteReply(fromNote) : reply)
      return
    }
    // A question about an item: load the item list once (shared with the other tabs), then answer.
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text } : x)))
    chat().set({ pending: id })
    queryClient
      .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
      .then((r) => {
        const again = answer(question, context(data, r.items))
        finish(again.needsItems ? { text: 'Sorry, I did not find that item.' } : again)
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
          const greeting = greetingRef.current()
          if (greeting) setMessages((m) => [...m, { id: nextId.current++, from: 'assistant', text: greeting, at: Date.now() }])
          say(greeting ?? 'Yes sir?')
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

  // Opening the assistant's tab: the day's greeting, once.
  const { pathname } = useLocation()
  useEffect(() => {
    if (pathname !== '/neural' || chat().messages.length) return
    const greeting = greetingRef.current()
    if (!greeting) return
    setMessages((m) => [...m, { id: nextId.current++, from: 'assistant', text: greeting, at: Date.now() }])
    const v = voiceRef.current
    if (v.speak) void speak(greeting, v)
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
