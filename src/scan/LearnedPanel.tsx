import { useEffect, useRef, useState } from 'react'
import { Brain, Download, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { ItemsById } from '../api/types'
import { exportCorrections, useLearnedStore } from './learned'
import { parseImportJson } from '../lib/progressFile'

function download(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * "Your corrections": every item the user re-labelled in the scanner, kept as an
 * extra reference picture. Export sends them to the developer so the next
 * release recognises them for everyone.
 */
export function LearnedPanel({ items, onRescan, canRescan }: { items: ItemsById | undefined; onRescan: () => void; canRescan: boolean }) {
  const records = useLearnedStore((s) => s.records)
  const load = useLearnedStore((s) => s.load)
  const remove = useLearnedStore((s) => s.remove)
  const clear = useLearnedStore((s) => s.clear)
  const importFile = useLearnedStore((s) => s.importFile)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const counts = { correct: 0, confirmed: 0, not: 0 }
  for (const r of records) counts[r.kind ?? 'correct']++

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="border-t border-line px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 text-left font-semibold uppercase tracking-wide text-ink-muted hover:text-ink">
        <Brain className="h-3.5 w-3.5 text-accent" /> What the scanner learned ({records.length})
        <span className="ml-auto font-normal normal-case text-ink-dim">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          <p className="text-ink-dim">
            The scanner learns from you. Fixing a wrong item with "Wrong item?" teaches it the right answer and that the guess was wrong for that look. Applying a scan teaches it that the uncertain matches you kept were right.
            Export the list and send it to the app's maintainer to make it part of the next update for everyone.
          </p>
          <p className="text-ink-muted">
            {counts.correct} fixed · {counts.confirmed} confirmed · {counts.not} rejected guesses
          </p>
          {records.length === 0 ? (
            <p className="text-ink-dim">No corrections yet.</p>
          ) : (
            <ul className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto">
              {records.filter((r) => r.kind !== 'not').map((r) => (
                <li key={r.id} className="group relative rounded border border-line bg-surface p-1">
                  <img src={r.thumb} alt="" className="mx-auto h-12 object-contain" />
                  <div className="truncate text-center text-[10px]" title={items?.[r.itemId]?.name}>{items?.[r.itemId]?.shortName ?? r.itemId.slice(-6)}</div>
                  <div className={`text-center text-[9px] ${r.kind === 'confirmed' ? 'text-success' : 'text-info'}`}>{r.kind === 'confirmed' ? 'confirmed' : 'fixed'}</div>
                  {r.wrongItemId && <div className="truncate text-center text-[9px] text-ink-dim line-through" title="What the scanner guessed">{items?.[r.wrongItemId]?.shortName ?? ''}</div>}
                  <button type="button" onClick={() => void remove(r.id)} aria-label="Forget this correction" className="absolute right-0.5 top-0.5 hidden rounded bg-surface-2 p-0.5 text-ink-dim hover:text-danger group-hover:block"><Trash2 className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={onRescan} disabled={!canRescan || records.length === 0} className="btn !px-2 !py-0.5 !text-xs" title="Scan this screenshot again using your corrections"><RefreshCw className="h-3.5 w-3.5" /> Rescan with corrections</button>
            <button type="button" onClick={() => download(`tarkov-companion-scan-corrections-${new Date().toISOString().slice(0, 10)}.json`, exportCorrections(records))} disabled={records.length === 0} className="btn !px-2 !py-0.5 !text-xs"><Download className="h-3.5 w-3.5" /> Export</button>
            <button type="button" onClick={() => fileInput.current?.click()} className="btn !px-2 !py-0.5 !text-xs"><Upload className="h-3.5 w-3.5" /> Import</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                try {
                  const n = await importFile(parseImportJson(await f.text()))
                  setNote(`Imported ${n} correction${n === 1 ? '' : 's'}.`)
                } catch (err) {
                  setNote(err instanceof Error ? err.message : 'Import failed')
                }
              }}
            />
            {records.length > 0 && (
              <button type="button" onClick={() => { if (!confirmClear) { setConfirmClear(true); return } void clear(); setConfirmClear(false) }} onBlur={() => setConfirmClear(false)} className={`btn !px-2 !py-0.5 !text-xs ${confirmClear ? 'border-danger text-danger' : ''}`}>
                {confirmClear ? 'Click again to forget all' : 'Forget all'}
              </button>
            )}
          </div>
          {note && <p className="text-ink-muted">{note}</p>}
        </div>
      )}
    </section>
  )
}
