import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, CheckCircle2, Circle, Loader2, Map as MapIcon, Mic, MicOff, Send, Square, Volume2, VolumeX, X } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { AssistantMap } from '../assistant/AssistantMap'
import { MemoryPanel } from '../assistant/MemoryPanel'
import { WAKE_NAMES } from '../assistant/wake'
import { listVoices, pickNaturalVoice, pickVoice, speak, speechAvailable, stopSpeaking, voiceGender } from '../assistant/speech'
import { NATURAL_VOICES } from '../assistant/naturalVoice'
import { useAssistantStore } from '../store/assistant'
import { useAssistantChat } from '../store/assistantChat'

const ROADMAP: { done: boolean; title: string; detail: string }[] = [
  { done: true, title: 'The tab', detail: 'A place for the assistant in the app.' },
  { done: true, title: 'Answer questions and guide on the map', detail: 'Places, extracts, walking routes around water, fences, rocks and minefields, closest quests, items and keys, your progress. Spoken out loud.' },
  { done: true, title: 'Talk to it', detail: 'Mic button, or a hotkey in game (Settings → Desktop app). Recognised on this PC; nothing is sent anywhere.' },
  { done: true, title: 'Do things for you (first steps)', detail: 'Mark quests done, show a quest or a route on the Maps tab, open a gun in the Weapon builder. Each one only when you click its button.' },
  { done: true, title: 'Learn from you', detail: 'Remembers what you tell it, learns your words and your maps from the game log, keeps answers short if you keep cutting it off, and greets you with real numbers. All on this PC.' },
  { done: false, title: 'More things to do', detail: 'Pick parts for a gun build, plan a whole raid.' },
]

const EXAMPLES = ["I'm at Dorms, what's the closest quest?", 'Where is Crackhouse?', 'What should I play tonight?', 'Remember that I keep the 314 key in my case', 'What do you know about me?']

function VoicePanel() {
  const s = useAssistantStore()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices())
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    if (!speechAvailable()) return
    const update = () => setVoices(listVoices())
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  const natural = s.engine === 'natural'
  const ofGender = voices.filter((v) => voiceGender(v) === s.gender)
  const current = pickVoice(voices, s.gender, s.voiceUri)
  const noMatch = !natural && voices.length > 0 && ofGender.length === 0
  const naturalList: readonly string[] = NATURAL_VOICES[s.gender]
  const segment = (on: boolean) => `px-3 py-1 ${on ? 'bg-accent/20 text-accent' : 'text-ink-muted hover:bg-surface-3'}`
  return (
    <div className="space-y-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.speak} onChange={(e) => s.set({ speak: e.target.checked })} className="h-4 w-4" />
        Read answers out loud
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.wakeWord} onChange={(e) => s.set({ wakeWord: e.target.checked })} className="h-4 w-4" />
          Wake word
        </label>
        <select value={s.wakeName} onChange={(e) => s.set({ wakeName: e.target.value as typeof s.wakeName })} aria-label="Wake word name" className="rounded border border-line bg-surface px-2 py-1 text-xs">
          {WAKE_NAMES.map((n) => (
            <option key={n} value={n}>Hey {n[0].toUpperCase() + n.slice(1)}</option>
          ))}
        </select>
        <span className="text-xs text-ink-dim">On any tab while the app is open: say the name, it answers "Yes sir?", ask away, and say "thanks, that's all" to finish. The mic stays open while it waits; only the name is listened for and nothing leaves this PC.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-ink-muted">Engine</span>
        <div className="inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Voice engine">
          <button type="button" onClick={() => s.set({ engine: 'natural' })} className={segment(natural)}>Natural</button>
          <button type="button" onClick={() => s.set({ engine: 'windows' })} className={segment(!natural)}>Windows</button>
        </div>
        <span className="text-xs text-ink-dim">{natural ? 'Neural voice on this PC (57 MB download the first time; ~1 s per sentence on one CPU core).' : 'The voices built into Windows: no download, almost no CPU, robotic.'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-ink-muted">Voice</span>
        <div className="inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Voice">
          {(['female', 'male'] as const).map((g) => (
            <button key={g} type="button" onClick={() => s.set({ gender: g, voiceUri: null, naturalVoice: null })} className={`${segment(s.gender === g)} capitalize`}>
              {g}
            </button>
          ))}
        </div>
        {natural ? (
          <select value={pickNaturalVoice(s.gender, s.naturalVoice)} onChange={(e) => s.set({ naturalVoice: e.target.value })} aria-label="Which voice" className="rounded border border-line bg-surface px-2 py-1 text-xs">
            {naturalList.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ) : (
          ofGender.length > 1 && (
            <select value={current?.voiceURI ?? ''} onChange={(e) => s.set({ voiceUri: e.target.value || null })} aria-label="Which voice" className="min-w-0 max-w-full rounded border border-line bg-surface px-2 py-1 text-xs">
              {ofGender.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
              ))}
            </select>
          )
        )}
      </div>
      {noMatch && <p className="text-xs text-ink-dim">No {s.gender} voice is installed; using {current?.name ?? 'the default voice'}. Windows: Settings → Time & language → Speech adds more.</p>}
      {!natural && !speechAvailable() && <p className="text-xs text-ink-dim">Windows voices are not available on this system.</p>}
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
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={() => speak('This is how I sound. Ask me anything about Tarkov.', { ...s, onStatus: setStatus })}>
          <Volume2 className="h-4 w-4" /> Test voice
        </button>
        {status && <span className="text-xs text-ink-dim">{status}</span>}
      </div>
    </div>
  )
}

/**
 * The in-app assistant's chat (the logic is in AssistantHost, mounted in Layout so the wake word
 * works on every tab). Built to be light enough to use while the game runs: no AI model, no
 * background work. Each question is matched against names from the app's own data in well under
 * a millisecond; the voice is generated on this PC only while speaking; the small map only exists while an
 * answer shows one. The large item list is loaded only when a question is about an item.
 */
export function NeuralNetworkPage() {
  const gameData = useGameData()
  const voice = useAssistantStore()
  const { messages, card, pending, listen, done, ask, run, toggleListening, set } = useAssistantChat()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const doneKeys = new Set(done)
  const setCard = (c: typeof card) => set({ card: c })
  const ready = !!gameData.data

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

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
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.ignored ? 'border border-dashed border-line text-ink-dim italic' : m.from === 'you' ? 'bg-accent/15 text-ink' : 'border border-line bg-surface text-ink'}`}>
                  <p className="flex items-center gap-1.5">{m.from === 'assistant' && pending === m.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{m.text}</p>
                  {m.ignored && <p className="mt-0.5 text-[11px] not-italic">Not answered: sounded like you were talking to someone else. Say "that was for you" and I'll answer it.</p>}
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
                          <button key={key} type="button" disabled={doneKeys.has(key)} onClick={() => run(key, a)} className="btn !px-2 !py-1 !text-xs">
                            {doneKeys.has(key) ? <><CheckCircle2 className="h-3.5 w-3.5 text-accent" /> Done</> : a.label}
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
        {listen.detail && (
          <p className={`border-t border-line px-3 py-1.5 text-xs ${listen.state === 'listening' ? 'text-ink' : 'text-ink-muted'}`}>
            {listen.state === 'listening' ? 'Heard: ' : ''}
            {listen.detail}
          </p>
        )}
        <form
          className="flex gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(draft)
            setDraft('')
          }}
        >
          <button
            type="button"
            className={`btn ${listen.state === 'listening' ? 'border-red-500 text-red-400' : ''}`}
            disabled={!ready || listen.state === 'loading'}
            onClick={toggleListening}
            title={listen.state === 'listening' ? 'Stop listening' : 'Ask by voice (recognised on this PC)'}
            aria-label={listen.state === 'listening' ? 'Stop listening' : 'Ask by voice'}
          >
            {listen.state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : listen.state === 'listening' ? <MicOff className="h-4 w-4 animate-pulse" /> : <Mic className="h-4 w-4" />}
          </button>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={listen.state === 'listening' ? 'Listening… ask your question' : gameData.isPending ? 'Loading game data…' : 'Ask the assistant…'} aria-label="Message" className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
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
        <h2 className="mb-3 text-sm font-semibold">Memory: what it has learned about you</h2>
        <MemoryPanel />
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
