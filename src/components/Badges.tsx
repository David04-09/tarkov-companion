import type { TaskStatus } from '../lib/taskStatus'
import { STATUS_LABEL } from '../lib/taskStatus'

export function KappaBadge() {
  return (
    <span
      title="Required for the Kappa container quest line"
      className="inline-flex items-center rounded border border-accent/60 bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent"
    >
      Kappa
    </span>
  )
}

export function LightkeeperBadge() {
  return (
    <span
      title="Required to unlock Lightkeeper"
      className="inline-flex items-center rounded border border-info/60 bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info"
    >
      Lightkeeper
    </span>
  )
}

const STATUS_CLASS: Record<TaskStatus, string> = {
  available: 'border-accent/60 bg-accent/15 text-accent',
  completed: 'border-success/60 bg-success/15 text-success',
  locked: 'border-line bg-surface-3 text-ink-dim',
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}
