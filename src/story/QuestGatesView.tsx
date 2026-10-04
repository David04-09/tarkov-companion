import { useMemo } from 'react'
import { Hourglass, Lock, MessageSquare, Variable } from 'lucide-react'
import { useGameData } from '../api/hooks'
import type { Task } from '../api/types'
import { StatusPill } from '../components/Badges'
import { ErrorPanel, LoadingPanel } from '../components/DataState'
import { autoTickFor, useSyncHistory } from '../desktop/syncHistory'
import { formatCountdown, formatWait } from '../lib/storyTime'
import { computeTaskStatuses, isFactionEligible } from '../lib/taskStatus'
import { useProfile, useProgressStore } from '../store/progress'
import { useNow } from './storyUtils'

const clock = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Quest-side gates from tarkov.dev: waiting times after prerequisites, hidden progress
 * counters ("globalVariable") and required trader conversations ("dialogue").
 */
export function QuestGatesView() {
  const gameData = useGameData()
  const profile = useProfile()
  const mode = useProgressStore((s) => s.gameMode)
  const entries = useSyncHistory((s) => s.entries)
  const now = useNow(30_000)

  const model = useMemo(() => {
    const data = gameData.data
    if (!data) return null
    const tasks = data.tasks.filter((t) => isFactionEligible(t, profile.faction))
    const statuses = computeTaskStatuses(tasks, profile)
    const delayed = tasks.filter((t) => t.availableDelay).sort((a, b) => a.trader.name.localeCompare(b.trader.name) || a.name.localeCompare(b.name))
    const groups = new Map<string, { task: Task; value: number; compare: string }[]>()
    for (const t of tasks) {
      for (const g of t.storyGates) {
        let list = groups.get(g.variableId)
        if (!list) groups.set(g.variableId, (list = []))
        list.push({ task: t, value: g.value, compare: g.compare })
      }
    }
    const counters = [...groups.entries()]
      .map(([id, list]) => {
        const traders = [...new Set(list.map((x) => x.task.trader.name))]
        const stages = [...new Set(list.map((x) => x.value))].sort((a, b) => a - b)
        return { id, traders, stages, list: list.sort((a, b) => a.value - b.value || a.task.name.localeCompare(b.task.name)) }
      })
      .sort((a, b) => a.traders.join().localeCompare(b.traders.join()) || a.stages[0] - b.stages[0])
    const dialogue = tasks.filter((t) => t.dialogueTraderIds.length)
    const traderName = (id: string) => data.traders.find((tr) => tr.id === id)?.name ?? 'a trader'
    return { data, statuses, delayed, counters, dialogue, traderName }
  }, [gameData.data, profile])

  if (gameData.isPending) return <LoadingPanel label="quests" />
  if (!model) return <ErrorPanel error={gameData.error} onRetry={() => void gameData.refetch()} />
  const { data, statuses, delayed, counters, dialogue, traderName } = model
  const gatedTotal = counters.reduce((n, c) => n + c.list.length, 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        {delayed.length} quests have a waiting time · {gatedTotal} are behind {counters.length} hidden progress counters · {dialogue.length} need a trader conversation first ({mode === 'pve' ? 'PvE' : 'PvP'} data from tarkov.dev).
      </p>

      {/* Waiting times */}
      <section className="rounded-lg border border-line bg-surface-2">
        <h3 className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><Hourglass className="h-3.5 w-3.5 text-info" /> Quests with a waiting time</h3>
        <ul className="divide-y divide-line/60 text-sm">
          {delayed.map((t) => {
            const prereqs = t.taskRequirements.filter((r) => r.status.some((s) => /complete/i.test(s))).map((r) => data.tasksById[r.taskId]).filter(Boolean)
            const allDone = prereqs.every((p) => profile.completedTaskIds.has(p.id))
            const times = prereqs.map((p) => autoTickFor(entries, mode, p.id)?.at)
            const knownAt = allDone && prereqs.length > 0 && times.every((x) => x !== undefined) ? Math.max(...(times as number[])) : null
            const delay = t.availableDelay as { minS: number; maxS: number }
            const wait = { minH: delay.minS / 3600, maxH: delay.maxS / 3600 }
            const from = knownAt !== null ? knownAt + delay.minS * 1000 : null
            const to = knownAt !== null ? knownAt + delay.maxS * 1000 : null
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{t.name}</span> <span className="text-xs text-ink-dim">{t.trader.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {prereqs.length ? <>After {prereqs.map((p) => p.name).join(', ')}</> : 'After its prerequisites'} · offered {formatWait(wait)} later
                  </span>
                </span>
                {statuses[t.id] === 'completed' ? null : knownAt !== null && from !== null && to !== null ? (
                  <span className={`rounded border px-2 py-0.5 text-xs ${now >= from ? 'border-success/50 text-success' : 'border-info/50 text-info'}`}>
                    {now >= to ? 'Available now' : now >= from ? `Any moment (by ${clock(to)})` : `In ${formatCountdown(from - now)} · ${clock(from)}`}
                  </span>
                ) : allDone && prereqs.length ? (
                  <span className="text-xs text-ink-dim" title="The prerequisite was ticked by hand, so the hand-in time is unknown">{formatWait(wait)} after you handed in {prereqs[prereqs.length - 1].name}</span>
                ) : null}
                <StatusPill status={statuses[t.id]} />
              </li>
            )
          })}
        </ul>
        <p className="border-t border-line px-4 py-1.5 text-[11px] text-ink-dim">Times are exact when the hand-in was read from the game log (desktop app); otherwise count from when you handed the prerequisite in.</p>
      </section>

      {/* Hidden counters */}
      <section className="rounded-lg border border-line bg-surface-2">
        <h3 className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><Variable className="h-3.5 w-3.5 text-accent" /> Quests behind hidden progress counters</h3>
        <p className="px-4 pt-2 text-xs text-ink-muted">
          The game unlocks these quests when an internal counter reaches a stage. tarkov.dev lists the counters but not what raises them, so this groups the quests that share one: they open together, lower stages first. Ticked quests count as done.
        </p>
        <div className="grid gap-2 p-3 md:grid-cols-2">
          {counters.map((c, i) => {
            const doneCount = c.list.filter((x) => statuses[x.task.id] === 'completed').length
            return (
              <div key={c.id} className="rounded border border-line bg-surface p-2.5">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Lock className="h-3.5 w-3.5 text-ink-dim" />
                  <span className="font-semibold text-ink">Counter {i + 1}</span>
                  <span className="text-ink-muted">{c.traders.join(', ')}</span>
                  <span className="ml-auto text-ink-dim">{doneCount}/{c.list.length} done</span>
                </div>
                <ul className="space-y-0.5 text-xs">
                  {c.stages.map((stage) => (
                    <li key={stage} className="flex gap-2">
                      <span className="w-14 shrink-0 text-ink-dim">stage {stage}</span>
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {c.list.filter((x) => x.value === stage).map((x) => (
                          <span key={x.task.id} className={statuses[x.task.id] === 'completed' ? 'text-success line-through decoration-success/40' : 'text-ink'}>
                            {x.task.name}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </section>

      {/* Dialogue */}
      {dialogue.length > 0 && (
        <section className="rounded-lg border border-line bg-surface-2">
          <h3 className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted"><MessageSquare className="h-3.5 w-3.5 text-accent" /> Quests that need a trader conversation</h3>
          <ul className="divide-y divide-line/60 text-sm">
            {dialogue.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-1.5">
                <span className="min-w-0 flex-1"><span className="text-ink">{t.name}</span> <span className="text-xs text-ink-dim">{t.trader.name}</span></span>
                <span className="text-xs text-ink-muted">Talk to {[...new Set(t.dialogueTraderIds.map(traderName))].join(', ')}</span>
                <StatusPill status={statuses[t.id]} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
