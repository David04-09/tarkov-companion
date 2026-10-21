import { useState } from 'react'
import { Brain, CheckCircle2, Circle, Send } from 'lucide-react'

interface Message {
  from: 'you' | 'assistant'
  text: string
}

/** Where this tab is going, step by step. */
const ROADMAP: { done: boolean; title: string; detail: string }[] = [
  { done: true, title: 'The tab', detail: 'A place for the assistant in the app.' },
  { done: false, title: 'Answer questions', detail: 'Ask about quests, keys, items, ammo or maps and get answers from the same data the app shows.' },
  { done: false, title: 'Do things for you', detail: 'Tick quests, plan a raid, fill the Item Collection or build a gun in the Weapon builder when you ask.' },
]

const NOT_YET = 'I can\'t answer yet: the assistant is still being built. This tab is the first step. Answering questions comes next, then doing things in the app for you.'

/**
 * The future in-app assistant. First step: the tab and the chat layout. Nothing is sent
 * anywhere; messages stay on this page until it is closed.
 */
export function NeuralNetworkPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setMessages((m) => [...m, { from: 'you', text }, { from: 'assistant', text: NOT_YET }])
    setDraft('')
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Brain className="h-6 w-6 text-accent" /> Neural network</h1>
        <p className="text-sm text-ink-muted">Your future Tarkov assistant: ask it questions and let it do things for you in the app, such as building guns. It is being built step by step.</p>
      </div>

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

      <section className="flex min-h-80 flex-col rounded-lg border border-line bg-surface-2">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-ink-dim">Try asking something, for example "Which key do I need for Dorms 314?"</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.from === 'you' ? 'bg-accent/15 text-ink' : 'border border-line bg-surface text-ink-muted'}`}>{m.text}</div>
              </div>
            ))
          )}
        </div>
        <form
          className="flex gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the assistant…" aria-label="Message" className="min-w-0 flex-1 rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
          <button type="submit" className="btn" disabled={!draft.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
        </form>
      </section>
    </div>
  )
}
