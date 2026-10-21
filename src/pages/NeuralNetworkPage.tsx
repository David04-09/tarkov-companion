import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Brain, CheckCircle2, Circle, Loader2, Map as MapIcon, Send, Square, Volume2, VolumeX, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { itemKeys, useGameData } from '../api/hooks'
import { fetchItems } from '../api/queries'
import type { GameData, GameMap, ItemsById } from '../api/types'
import { AssistantMap } from '../assistant/AssistantMap'
import { headingOnMap } from '../assistant/heading'
import type { Place } from '../assistant/places'
import { withWalk } from '../assistant/withWalk'
import { answer, type AssistantAction, type AssistantContext, type MapCard, type Reply } from '../assistant/engine'
import { listVoices, pickVoice, speak, speechAvailable, stopSpeaking, voiceGender } from '../assistant/speech'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { findMapConfig, resolveBaseLayer } from '../maps/mapConfig'
import { buildMapTasks, type MapTask } from '../maps/overlay/mapTasks'
import { useAssistantStore } from '../store/assistant'
import { useAssistantRouteStore } from '../store/assistantRoute'
import { useMapOverlayStore } from '../store/mapOverlay'
import { useUiStore } from '../store/ui'
import { useProfile, useProgressStore } from '../store/progress'

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

interface Message {
  id: number
  from: 'you' | 'assistant'
  text: string
  reply?: Reply
}

const ROADMAP: { done: boolean; title: string; detail: string }[] = [
  { done: true, title: 'The tab', detail: 'A place for the assistant in the app.' },
  { done: true, title: 'Answer questions and guide on the map', detail: 'Places, closest quests with a line on a small map, extracts, quests, items and keys, your progress. Spoken out loud.' },
  { done: false, title: 'Do things for you', detail: 'Tick quests, plan a raid, fill the Item Collection or build a gun in the Weapon builder when you ask.' },
]

const EXAMPLES = ["I'm at Dorms, what's the closest quest?", 'Where is Crackhouse?', 'Extracts on Woods', 'What is the LEDX for?']

function VoicePanel() {
  const s = useAssistantStore()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices())
  useEffect(() => {
    if (!speechAvailable()) return
    const update = () => setVoices(listVoices())
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  if (!speechAvailable()) return <p className="text-xs text-ink-dim">Speaking is not available on this system.</p>
  const ofGender = voices.filter((v) => voiceGender(v) === s.gender)
  const current = pickVoice(voices, s.gender, s.voiceUri)
  const noMatch = voices.length > 0 && ofGender.length === 0
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.speak} onChange={(e) => s.set({ speak: e.target.checked })} className="h-4 w-4" />
        Read answers out loud
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-ink-muted">Voice</span>
        <div className="inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Voice">
          {(['female', 'male'] as const).map((g) => (
            <button key={g} type="button" onClick={() => s.set({ gender: g, voiceUri: null })} className={`px-3 py-1 capitalize ${s.gender === g ? 'bg-accent/20 text-accent' : 'text-ink-muted hover:bg-surface-3'}`}>
              {g}
            </button>
          ))}
        </div>
        {ofGender.length > 1 && (
          <select value={current?.voiceURI ?? ''} onChange={(e) => s.set({ voiceUri: e.target.value || null })} aria-label="Which voice" className="min-w-0 max-w-full rounded border border-line bg-surface px-2 py-1 text-xs">
            {ofGender.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </select>
        )}
      </div>
      {noMatch && <p className="text-xs text-ink-dim">No {s.gender} voice is installed; using {current?.name ?? 'the default voice'}. Windows: Settings → Time & language → Speech adds more.</p>}
      <label className="flex items-center gap-2">
        <span className="w-16 text-ink-muted">Volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} className="w-48 accent-[var(--color-accent)]" aria-label="Volume" />
        <span className="w-10 tabular-nums text-xs text-ink-dim">{Math.round(s.volume * 100)}%</span>
      </label>
      <label className="flex items-center gap-2">
        <span className="w-16 text-ink-muted">Speed</span>
        <input type="range" min={0.5} max={2} step={0.1} value={s.rate} onChange={(e) => s.set({ rate: Number(e.target.value) })} className="w-48 accent-[var(--color-accent)]" aria-label="Speaking speed" />
        <span className="w-10 tabular-nums text-xs text-ink-dim">{s.rate.toFixed(1)}×</span>
      </label>
      <button type="button" className="btn" onClick={() => speak('Ready when you are. Where are you on the map?', s)}>
        <Volume2 className="h-4 w-4" /> Test voice
      </button>
    </div>
  )
}

/**
 * The in-app assistant. Built to be light enough to use while the game runs: no AI model, no
 * background work. Each question is matched against names from the app's own data in well under
 * a millisecond; voices are the ones built into Windows; the small map only exists while an
 * answer shows one. The large item list is loaded only when a question is about an item.
 */
export function NeuralNetworkPage() {
  const gameData = useGameData()
  const profile = useProfile()
  const queryClient = useQueryClient()
  const gameMode = useProgressStore((s) => s.gameMode)
  const voice = useAssistantStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [card, setCard] = useState<MapCard | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const lastMapId = useRef<string | null>(null)
  const lastPlace = useRef<Place | null>(null)
  const nextId = useRef(1)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [done, setDone] = useState<Set<string>>(new Set())

  /** Runs an offered action (only ever from a click on its button). */
  const run = (key: string, a: AssistantAction) => {
    setDone((d) => new Set(d).add(key))
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

  /** Everything an answer may use; the item list only if it is already loaded (it is large). */
  const context = (data: GameData, items: ItemsById | undefined): AssistantContext => {
    const eligible = new Set(tasks.map((t) => t.id))
    return {
      data,
      statuses,
      tasks,
      items,
      playerLevel: profile.playerLevel,
      lastMapId: lastMapId.current,
      lastPlace: lastPlace.current,
      tasksOnMap: (map: GameMap) => tasksOnMapFor(data, map, eligible, faction),
      heading: (map, from, to) => headingOnMap(map.normalizedName, from, to),
    }
  }

  const present = useCallback(
    (id: number, reply: Reply) => {
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: reply.text, reply } : x)))
      if (reply.mapId) lastMapId.current = reply.mapId
      if (reply.youAt) lastPlace.current = reply.youAt
      setCard(reply.map ?? null)
      if (voice.speak) speak(reply.text, voice)
    },
    [voice],
  )

  /** Answers with a line on the map get a walking route over the terrain first (built only now, in a few ms). */
  const show = useCallback(
    (id: number, reply: Reply) => {
      if (!reply.map?.route) return present(id, reply)
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, text: 'Working out the route…' } : x)))
      setPending(id)
      void withWalk(reply)
        .then((r) => present(id, r))
        .finally(() => setPending((p) => (p === id ? null : p)))
    },
    [present],
  )

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return
    const you = nextId.current++
    const id = nextId.current++
    setMessages((m) => [...m, { id: you, from: 'you', text }, { id, from: 'assistant', text: '…' }])
    setDraft('')
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
    setPending(id)
    queryClient
      .fetchQuery({ queryKey: itemKeys.mode(gameMode), queryFn: ({ signal }) => fetchItems(gameMode, signal) })
      .then((r) => {
        const again = answer(text, context(data, r.items))
        show(id, again.needsItems ? { text: 'Sorry, I did not find that item.' } : again)
      })
      .catch(() => show(id, { text: 'The item list could not be loaded. Check the internet connection and ask again.' }))
      .finally(() => setPending((p) => (p === id ? null : p)))
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // Stop talking when leaving the tab.
  useEffect(() => () => stopSpeaking(), [])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Brain className="h-6 w-6 text-accent" /> Neural network</h1>
        <p className="text-sm text-ink-muted">Your Tarkov assistant. Ask where things are and what to do next; it answers from the app's own data, shows it on a small map and can say it out loud. It works offline and uses almost no resources, so it can run while you play.</p>
      </div>

      <section className="flex flex-col rounded-lg border border-line bg-surface-2">
        <div ref={listRef} className="max-h-[45vh] min-h-48 space-y-2 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="space-y-2 text-sm text-ink-dim">
              <p>Try one of these:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" onClick={() => ask(e)} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-accent hover:text-ink">{e}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.from === 'you' ? 'bg-accent/15 text-ink' : 'border border-line bg-surface text-ink'}`}>
                  <p className="flex items-center gap-1.5">{m.from === 'assistant' && pending === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{m.text}</p>
                  {m.reply?.lines && m.reply.lines.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
                      {m.reply.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  )}
                  {(m.reply?.links?.length || m.reply?.map) && (
                    <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                      {m.reply?.map && (
                        <button type="button" onClick={() => setCard(m.reply?.map ?? null)} className="inline-flex items-center gap-1 text-accent underline"><MapIcon className="h-3 w-3" /> Show on the map</button>
                      )}
                      {m.reply?.links?.map((l) => (
                        <Link key={l.to + l.label} to={l.to} className="text-accent underline">{l.label}</Link>
                      ))}
                    </div>
                  )}
                  {m.reply?.actions && m.reply.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.reply.actions.map((a, i) => {
                        const key = `${m.id}:${i}`
                        return (
                          <button key={key} type="button" disabled={done.has(key)} onClick={() => run(key, a)} className="btn !px-2 !py-1 !text-xs">
                            {done.has(key) ? <><CheckCircle2 className="h-3.5 w-3.5 text-accent" /> Done</> : a.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <form
          className="flex gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={gameData.isPending ? 'Loading game data…' : 'Ask the assistant…'} aria-label="Message" className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="button" className="btn" onClick={() => voice.set({ speak: !voice.speak })} title={voice.speak ? 'Mute the voice' : 'Read answers out loud'} aria-label={voice.speak ? 'Mute' : 'Unmute'}>
            {voice.speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button type="button" className="btn" onClick={stopSpeaking} title="Stop talking" aria-label="Stop talking"><Square className="h-4 w-4" /></button>
          <button type="submit" className="btn" disabled={!draft.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
        </form>
      </section>

      {card && (
        <section className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <MapIcon className="h-3.5 w-3.5 text-accent" /> {card.map.name}
            {card.path ? <span className="text-ink-dim">· orange line = walking route</span> : card.route && <span className="text-ink-dim">· dashed line = straight line, not a walking path</span>}
            <button type="button" onClick={() => setCard(null)} className="ml-auto rounded p-1 hover:bg-surface-3" aria-label="Close the map"><X className="h-4 w-4" /></button>
          </div>
          <AssistantMap card={card} />
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface-2 p-4">
        <h2 className="mb-3 text-sm font-semibold">Voice</h2>
        <VoicePanel />
      </section>

      <section className="rounded-lg border border-line bg-surface-2 p-4">
        <h2 className="mb-2 text-sm font-semibold">Plan</h2>
        <ol className="space-y-2">
          {ROADMAP.map((s) => (
            <li key={s.title} className="flex gap-2 text-sm">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-dim" />}
              <div>
                <div className={s.done ? 'font-medium' : 'font-medium text-ink-muted'}>{s.title}</div>
                <div className="text-xs text-ink-dim">{s.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
