export function SegmentButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}
