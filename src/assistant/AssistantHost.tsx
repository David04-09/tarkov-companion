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
import { answer, nameSlots, type AssistantAction, type AssistantContext, type Reply } from './engine'
import { nluLoaded, understandQuestion } from './nlu'
import { headingOnMap } from './heading'
import { confirmWord } from './items'
import { listenOnce, type ListenState } from './listen'
import { ALL_PLACES, type Place } from './places'
import { cutCount, onSpeakingChange, speak, stopSpeaking } from './speech'
import { addressed, naturalSpeech } from './humanize'
import { GOOD_ANSWER, kindWords, parseAddress, TELL_MORE, TOO_LONG } from './memory'
import { applyWords, askKind, asksAboutOwn, findNote, firstSentence, FORGET_ALL, FORGET_LAST, greetingText, isLearnedChatter, NOT_FOR_YOU, parseMeant, parseRemember, parseStyle, parseTeach, subjectOf, wantsShort, WAS_FOR_YOU, WHAT_YOU_KNOW } from './memory'
import { greetingFacts, habitsFromLogs, knowReply, noteReply, RECOMMEND, recommendReply, resolveName } from './memoryAnswers'
import { compact, words } from './text'
import { buildSoundNames, snapToNames, type SoundName } from './phonetic'
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
  /** In a conversation: the last line answered (for "not you") and the last one ignored (for "that was for you"). */
  const lastAnswered = useRef<string | null>(null)
  const lastIgnored = useRef<string | null>(null)
  /** The last question as asked, for "no, I meant …". */
  const lastQuestion = useRef<string | null>(null)
  /** The word of the last question it did not understand, for "that means …". */
  const lastUnknown = useRef<string | null>(null)
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
  const lastReply = useRef<{ reply: Reply; kind: string } | null>(null)

  const present = useCallback(
    (id: number, given: Reply) => {
      // How the player wants to be called ("sir", their name, nothing).
      const style = useAssistantMemory.getState().style
      const reply = { ...given, text: addressed(given.text, style.address ?? 'sir') }
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text, reply } : x)))
      if (reply.mapId) lastMapId.current = reply.mapId
      if (reply.youAt) lastPlace.current = reply.youAt
      // "Add 1 GPU": asked first; kept until the next message ("yes" applies it).
      pendingConfirm.current = reply.confirm ?? null
      chat().set({ card: reply.map ?? null })
      if (voice.speak && !reply.quiet) {
        const cutBefore = cutCount()
        // Short or full as learned for this topic, then said the way a person would say it.
        const kind = currentKind.current
        let said = wantsShort(style, kind) ? firstSentence(reply.text) : reply.text
        if (style.byKind?.[kind] === 'full' && reply.lines?.length) said = `${said} ${reply.lines.slice(0, 2).join('. ')}.`
        said = naturalSpeech(said, { opener: true })
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

  /**
   * `conversation`: heard after the wake word, where the player may be talking to someone else.
   * Then only what is clearly for the assistant is answered; the rest is shown greyed out, not said.
   */
  const ask = (input: string, opts: { conversation?: boolean } = {}) => {
    const text = input.trim()
    if (!text) return
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
    const finish = (r: Reply) => {
      if (conversation) lastAnswered.current = text
      lastReply.current = { reply: r, kind: currentKind.current }
      show(id, prefix ? { ...r, text: prefix + r.text } : r)
    }

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
      const need = notUnderstood(r) ? 0.62 : r.weak ? 0.7 : 0.88
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
          if (hit && again && !again.needsItems && !notUnderstood(again) && words(hit.ask).join(' ') !== words(question).join(' ')) finish({ ...again, lines: [`I took that as: "${hit.ask}"`, ...(again.lines ?? [])] })
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
  const heard = (text: string, alt?: string): string => {
    const items = queryClient.getQueryData<{ items: ItemsById }>(itemKeys.mode(gameMode))?.items
    const list = soundNamesFor(items)
    // Teaching a nickname: keep the nickname as it was heard (it is not a game name yet).
    if (parseTeach(text)) return text
    const main = snapToNames(text, list).text
    // Memory commands ("remember that …") are kept as Moonshine heard them: Vosk only knows game words.
    if (!alt || alt === main || /^(remember|note to self|forget|no i meant|i meant|when i say|keep it short|more detail|what do you know)/.test(words(main).join(' ')) || parseTeach(main)) return main
    if (understood(main)) return main
    const second = snapToNames(alt, list).text
    return understood(second) ? second : main
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
          say(addressed(greeting ?? 'Yes sir?', useAssistantMemory.getState().style.address ?? 'sir'))
        },
        onQuestion: (text, alt) => askRef.current(heardRef.current(text, alt), { conversation: true }),
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
