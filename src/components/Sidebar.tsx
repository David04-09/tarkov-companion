import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Settings, Shield } from 'lucide-react'
import { NAV_ITEMS } from '../config/nav'
import { GAME_MODES } from '../api/client'
import { useProgressStore } from '../store/progress'
import { SettingsDialog } from './SettingsDialog'

function GameModeToggle({ compact }: { compact: boolean }) {
  const gameMode = useProgressStore((s) => s.gameMode)
  const setGameMode = useProgressStore((s) => s.setGameMode)

  if (compact) {
    const other = GAME_MODES.find((m) => m.id !== gameMode) ?? GAME_MODES[0]
    const current = GAME_MODES.find((m) => m.id === gameMode) ?? GAME_MODES[0]
    return (
      <button
        type="button"
        onClick={() => setGameMode(other.id)}
        title={`Game mode: ${current.label}. Click to switch to ${other.label}.`}
        className="mx-auto flex h-9 w-10 items-center justify-center rounded border border-accent/50 bg-accent/10 text-xs font-bold text-accent hover:bg-accent/20"
      >
        {current.label}
      </button>
    )
  }

  return (
    <div className="flex rounded border border-line bg-surface p-0.5" role="group" aria-label="Game mode">
      {GAME_MODES.map((m) => {
        const active = m.id === gameMode
        return (
          <button
            key={m.id}
            type="button"
            title={m.description}
            onClick={() => setGameMode(m.id)}
            aria-pressed={active}
            className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
              active ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Below the md breakpoint the sidebar always shows icons only.
  const widthClass = collapsed ? 'w-16' : 'w-16 md:w-60'
  const labelClass = collapsed ? 'hidden' : 'hidden md:inline'
  const wideOnlyClass = collapsed ? 'hidden' : 'hidden md:block'

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-line bg-surface-2 transition-[width] duration-200 ${widthClass}`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-line px-3">
        <Shield className="h-6 w-6 shrink-0 text-accent" aria-hidden />
        <span className={`truncate text-sm font-semibold tracking-wide ${labelClass}`}>
          Tarkov Companion
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="ml-auto hidden rounded p-1 text-ink-dim hover:bg-surface-3 hover:text-ink md:block"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Main">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded px-2.5 py-2 text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                  }`
                }
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className={`truncate ${labelClass}`}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-2 border-t border-line p-2">
        <div className={wideOnlyClass}>
          <GameModeToggle compact={false} />
        </div>
        <div className={collapsed ? 'block' : 'block md:hidden'}>
          <GameModeToggle compact />
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-sm text-ink-muted hover:bg-surface-3 hover:text-ink"
        >
          <Settings className="h-5 w-5 shrink-0" aria-hidden />
          <span className={labelClass}>Settings</span>
        </button>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </aside>
  )
}
