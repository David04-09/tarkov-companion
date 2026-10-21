import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useGameData } from '../api/hooks'
import { useAssistantMemory } from '../store/assistantMemory'
import { survivalText, topMaps, wantsShort, whenYouPlay, type StylePref } from './memory'

const dateText = (at: number) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * What the assistant has learned about you, all of it on this PC: notes, words, habits and how
 * long answers should be. Each thing can be removed, or everything at once.
 */
export function MemoryPanel() {
  const m = useAssistantMemory()
  const maps = useGameData().data?.maps
  const [confirmWipe, setConfirmWipe] = useState(false)
  const mapName = (key: string) => maps?.find((x) => x.normalizedName === key)?.name ?? key
  const played = topMaps(m.habits, 5)
  const when = whenYouPlay(m.habits)
  const segment = (on: boolean) => `px-2.5 py-1 text-xs ${on ? 'bg-accent/20 text-accent' : 'text-ink-muted hover:bg-surface-3'}`
  const styles: { id: StylePref; label: string }[] = [
    { id: 'auto', label: 'Learn it' },
    { id: 'short', label: 'Short' },
    { id: 'full', label: 'Everything' },
  ]
  return (
    <div className="space-y-4 text-sm">
      <p className="text-xs text-ink-dim">
        It learns by remembering and counting, not with a big AI: what you tell it ("remember that…"), what your words mean ("no, I meant the Hand drill", "when I say drill I mean hand drill"), which maps you play and how they go (from the game log and the after-raid card), and whether you cut its answers off. Ask it "what do you know about me?". Everything stays on this PC.
      </p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={m.learning} onChange={(e) => m.setLearning(e.target.checked)} className="h-4 w-4" />
        Learn from me
        <span className="text-xs text-ink-dim">(off: it still uses what it knows, but saves nothing new)</span>
      </label>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Notes ({m.notes.length})</h3>
        {m.notes.length === 0 ? (
          <p className="text-xs text-ink-dim">None yet. Say or type "remember that I keep the 314 key in my case".</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {[...m.notes].reverse().map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <span className="w-14 shrink-0 text-xs text-ink-dim">{dateText(n.at)}</span>
                <span className="min-w-0 flex-1">{n.text}</span>
                <button type="button" onClick={() => m.forgetNote(n.id)} aria-label="Forget this note" title="Forget" className="text-ink-dim hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Your words ({m.words.length})</h3>
        {m.words.length === 0 ? (
          <p className="text-xs text-ink-dim">None yet. When it gets a word wrong, say "no, I meant …".</p>
        ) : (
          <ul className="space-y-1">
            {m.words.map((w) => (
              <li key={w.phrase} className="flex items-center gap-2">
                <span className="min-w-0 flex-1">"{w.phrase}" → {w.means}{w.uses > 0 && <span className="text-xs text-ink-dim"> · used {w.uses}×</span>}</span>
                <button type="button" onClick={() => m.forgetWord(w.phrase)} aria-label={`Forget ${w.phrase}`} title="Forget" className="text-ink-dim hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Your raids</h3>
        {played.length === 0 ? (
          <p className="text-xs text-ink-dim">{window.desktop ? 'Nothing yet: it learns from the game log (desktop app) as you play.' : 'The desktop app learns this from the game log.'}</p>
        ) : (
          <ul className="space-y-0.5">
            {played.map(([key, h]) => (
              <li key={key}>
                {mapName(key)}: {h.raids} raid{h.raids === 1 ? '' : 's'}
                {survivalText(h) && <span className="text-ink-dim"> · {survivalText(h)}</span>}
              </li>
            ))}
            {when && <li className="text-xs text-ink-dim">You play {when}.</li>}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Answers read out</span>
        <div className="inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Answer length">
          {styles.map((s) => (
            <button key={s.id} type="button" onClick={() => m.setStyle(s.id)} className={segment(m.style.pref === s.id)}>{s.label}</button>
          ))}
        </div>
        <span className="text-xs text-ink-dim">
          {m.style.pref === 'auto' ? (wantsShort(m.style) ? `You cut ${m.style.cut} of ${m.style.spoken} answers off, so only the first sentence is read.` : `Learning: ${m.style.cut} of ${m.style.spoken} answers cut off so far.`) : m.style.pref === 'short' ? 'Only the first sentence is read; the rest is on screen.' : 'Every answer is read in full.'}
        </span>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        {confirmWipe ? (
          <>
            <span className="text-xs">Forget every note, word and habit?</span>
            <button type="button" className="btn !px-2 !py-1 !text-xs !text-red-400" onClick={() => { m.forgetAll(); setConfirmWipe(false) }}>Yes, forget everything</button>
            <button type="button" className="btn !px-2 !py-1 !text-xs" onClick={() => setConfirmWipe(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="btn !px-2 !py-1 !text-xs" onClick={() => setConfirmWipe(true)}><Trash2 className="h-3.5 w-3.5" /> Forget everything</button>
        )}
      </div>
    </div>
  )
}
