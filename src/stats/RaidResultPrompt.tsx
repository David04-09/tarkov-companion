import { useEffect, useState } from 'react'
import { Flag, X } from 'lucide-react'
import type { GameMode } from '../api/client'
import { useGameData } from '../api/hooks'
import { modeToGameMode } from '../desktop/useDesktop'
import { useProgressStore } from '../store/progress'
import { raidKey, useRaidLogStore } from '../store/raidLog'
import { ResultButtons } from './RaidLog'

/**
 * Desktop: right after a raid ends (live, from the game log), a small card in the app asks how
 * it went. Answering fills the raid log; "Later" leaves it unmarked in My stats.
 */
export function RaidResultPrompt() {
  const [pending, setPending] = useState<{ key: string; location: string; mode: GameMode } | null>(null)
  const setEntry = useRaidLogStore((s) => s.setEntry)
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
      <ResultButtons
        value={undefined}
        onPick={(result) => {
          if (result) setEntry(pending.mode, pending.key, { result })
          setPending(null)
        }}
      />
      <p className="mt-2 text-[11px] text-ink-dim">Saved in the raid log (My stats), where you can add PMC/Scav and a note.</p>
    </div>
  )
}
