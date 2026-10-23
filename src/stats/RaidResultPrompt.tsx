import { useEffect, useState } from 'react'
import { Flag, X } from 'lucide-react'
import type { GameMode } from '../api/client'
import { useGameData } from '../api/hooks'
import { modeToGameMode } from '../desktop/useDesktop'
import { useProgressStore } from '../store/progress'
import { raidKey, useRaidLogStore } from '../store/raidLog'
import { ResultButtons, RoleButtons } from './RaidLog'

/**
 * Desktop: right after a raid ends (live, from the game log), a small card in the app asks how
 * it went and whether you were a PMC or a Scav. Each click is saved straight into the raid log;
 * the card closes once both are picked, or with Done / X ("later": it stays unmarked in My stats).
 */
export function RaidResultPrompt() {
  const [pending, setPending] = useState<{ key: string; location: string; mode: GameMode } | null>(null)
  const setEntry = useRaidLogStore((s) => s.setEntry)
  const entry = useRaidLogStore((s) => (pending ? s.byMode[pending.mode][pending.key] : undefined))
  const maps = useGameData().data?.maps
  useEffect(
    () =>
      window.desktop?.onEvent((e) => {
        if (e.kind !== 'raidEnded' || e.historical) return
        setPending({ key: raidKey(e.raidId, e.at), location: e.location, mode: modeToGameMode(e.mode, useProgressStore.getState().gameMode) })
      }),
    [],
  )
  if (!pending) return null
  const mapName = maps?.find((m) => m.nameId.toLowerCase() === pending.location.toLowerCase())?.name ?? pending.location
  return (
    <div role="status" className="fixed bottom-4 left-4 z-[66] w-80 rounded-lg border border-accent/50 bg-surface-2 p-3 text-sm shadow-xl">
      <div className="mb-2 flex items-center gap-2">
        <Flag className="h-4 w-4 text-accent" />
        <span className="flex-1 font-medium">How did your raid on {mapName} go?</span>
        <button type="button" onClick={() => setPending(null)} aria-label="Later" title="Later (mark it in My stats)" className="text-ink-dim hover:text-ink"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <ResultButtons value={entry?.result} onPick={(result) => {
            setEntry(pending.mode, pending.key, { result })
            if (result && entry?.role) setPending(null)
          }} />
        <div className="flex items-center gap-2">
          <RoleButtons value={entry?.role} onPick={(role) => {
              setEntry(pending.mode, pending.key, { role })
              if (role && entry?.result) setPending(null)
            }} />
          <button type="button" onClick={() => setPending(null)} className="ml-auto text-xs text-accent underline">Done</button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-dim">Saved in the raid log (My stats), where you can add a note.</p>
    </div>
  )
}
