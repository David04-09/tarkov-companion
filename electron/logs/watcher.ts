/**
 * Watches the EFT Logs folder: picks the newest session folder, tails its
 * application and notification logs, and emits GameEvents. Also performs the
 * one-off "read past logs" backfill over every session folder.
 *
 * Read-only by design: it stats and reads files, nothing else.
 */
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import type { BackfillProgress, BackfillResult, GameEvent, SessionMode, WatcherState } from '../../src/shared/desktop-api'
import { GameLogInterpreter, logFileRole, logFolderTime } from './parser'
import { FileTail } from './tailer'

const POLL_MS = 750
const RESCAN_MS = 3000
const RECENT_LIMIT = 50

interface SessionFolder {
  dir: string
  name: string
  time: number
}

function listSessionFolders(logsPath: string): SessionFolder[] {
  let names: string[]
  try {
    names = fs.readdirSync(logsPath)
  } catch {
    return []
  }
  return names
    .map((name) => ({ name, time: logFolderTime(name) ?? -1, dir: path.join(logsPath, name) }))
    .filter((f) => f.time >= 0)
    .sort((a, b) => a.time - b.time)
}

function listLogFiles(dir: string): { file: string; role: 'application' | 'notifications' }[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: { file: string; role: 'application' | 'notifications' }[] = []
  for (const n of names) {
    const role = logFileRole(n)
    if (role) out.push({ file: path.join(dir, n), role })
  }
  // application first so the session mode is known before notifications are read
  return out.sort((a, b) => (a.role === b.role ? a.file.localeCompare(b.file) : a.role === 'application' ? -1 : 1))
}

export interface LogWatcherEvents {
  event: (e: GameEvent) => void
  state: (s: WatcherState) => void
}

export class LogWatcher extends EventEmitter {
  private logsPath: string | null = null
  private detectedPath: string | null = null
  private paused = false
  private timer: NodeJS.Timeout | null = null
  private lastRescan = 0
  private current: { folder: SessionFolder; tails: { tail: FileTail; role: 'application' | 'notifications' }[]; interpreter: GameLogInterpreter; knownFiles: Set<string> } | null = null
  private recent: GameEvent[] = []
  private lastEventAt: number | null = null
  private message: string | undefined
  /** The first pass over the current folder is "historical" (no live reactions). */
  private initialRead = true

  configure(opts: { logsPath: string | null; detectedPath: string | null; paused: boolean }) {
    const changedPath = opts.logsPath !== this.logsPath
    this.logsPath = opts.logsPath
    this.detectedPath = opts.detectedPath
    this.paused = opts.paused
    if (changedPath) {
      this.current = null
      this.initialRead = true
    }
    this.message = undefined
    this.start()
    this.emitState()
  }

  getState(): WatcherState {
    return {
      status: !this.logsPath ? 'no-folder' : this.paused ? 'paused' : this.message ? 'error' : 'watching',
      logsPath: this.logsPath,
      detectedPath: this.detectedPath,
      currentFolder: this.current?.folder.name ?? null,
      lastEventAt: this.lastEventAt,
      sessionMode: this.current?.interpreter.currentMode ?? 'unknown',
      profileId: this.current?.interpreter.profileId ?? null,
      accountId: this.current?.interpreter.accountId ?? null,
      message: this.message,
    }
  }

  getRecentEvents(): GameEvent[] {
    return [...this.recent].reverse()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private start() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), POLL_MS)
    this.tick()
  }

  private emitState() {
    this.emit('state', this.getState())
  }

  private tick() {
    if (!this.logsPath || this.paused) return
    const now = Date.now()
    if (!this.current || now - this.lastRescan > RESCAN_MS) {
      this.lastRescan = now
      if (!fs.existsSync(this.logsPath)) {
        if (!this.message) {
          this.message = 'Logs folder not found.'
          this.emitState()
        }
        return
      }
      if (this.message) {
        this.message = undefined
        this.emitState()
      }
      const folders = listSessionFolders(this.logsPath)
      const newest = folders[folders.length - 1]
      if (newest && newest.dir !== this.current?.folder.dir) {
        this.current = { folder: newest, tails: [], interpreter: new GameLogInterpreter(), knownFiles: new Set() }
        // A folder that appeared while we were running is a fresh session: read it live.
        // The folder found at start-up is read as history (mode/profile recovered, no reactions).
        this.emitState()
      }
      if (this.current) {
        for (const f of listLogFiles(this.current.folder.dir)) {
          if (this.current.knownFiles.has(f.file)) continue
          this.current.knownFiles.add(f.file)
          this.current.tails.push({ tail: new FileTail(f.file), role: f.role })
        }
        this.current.tails.sort((a, b) => (a.role === b.role ? 0 : a.role === 'application' ? -1 : 1))
      }
    }
    if (!this.current) return

    const historical = this.initialRead
    let any = false
    for (const { tail, role } of this.current.tails) {
      const entries = tail.poll()
      if (entries.length === 0) continue
      any = true
      const fileName = path.basename(tail.path)
      for (const entry of entries) {
        for (const ev of this.current.interpreter.interpret(entry, fileName, historical)) {
          void role
          this.publish(ev)
        }
      }
    }
    if (this.initialRead && !any) {
      // First poll of the start-up folder has drained; everything after this is live.
      this.initialRead = false
      this.emitState()
    }
  }

  private publish(ev: GameEvent) {
    this.recent.push(ev)
    if (this.recent.length > RECENT_LIMIT) this.recent.splice(0, this.recent.length - RECENT_LIMIT)
    this.lastEventAt = Date.now()
    this.emit('event', ev)
  }

  /**
   * Reads every session folder once (oldest first). Each folder gets its own
   * interpreter so session modes never leak between sessions.
   */
  backfill(onProgress?: (p: BackfillProgress) => void): BackfillResult {
    const result: BackfillResult = {
      folders: 0,
      files: 0,
      events: [],
      finishedByMode: { regular: [], pve: [], seasonal: [], unknown: [] },
      currentProfileByMode: { regular: null, pve: null, seasonal: null, unknown: null },
      skippedOtherProfile: 0,
      sessions: [],
    }
    if (!this.logsPath) return result
    const folders = listSessionFolders(this.logsPath)
    folders.forEach((folder, i) => {
      onProgress?.({ done: i, total: folders.length, folder: folder.name })
      const interpreter = new GameLogInterpreter()
      const files = listLogFiles(folder.dir)
      const pending: { entries: ReturnType<typeof FileTail.readAll>; fileName: string }[] = []
      let first = Infinity
      let last = -Infinity
      for (const f of files) {
        result.files += 1
        const entries = FileTail.readAll(f.file)
        for (const e of entries) {
          if (e.at < first) first = e.at
          if (e.at > last) last = e.at
        }
        const fileName = path.basename(f.file)
        if (f.role === 'application') {
          // Application log first: establishes the mode timeline.
          for (const e of entries) result.events.push(...interpreter.interpret(e, fileName, true))
        } else {
          pending.push({ entries, fileName })
        }
      }
      for (const p of pending) {
        for (const e of p.entries) {
          for (const ev of interpreter.interpret(e, p.fileName, true)) {
            result.events.push(ev)
          }
        }
      }
      result.folders += 1
      if (Number.isFinite(first) && last >= first) result.sessions?.push({ start: first, end: last })
    })
    onProgress?.({ done: folders.length, total: folders.length, folder: '' })
    // "You" per mode = the profile selected most recently in that mode. Older profiles
    // (before a wipe/reset, or a second account on this PC) must not tick quests.
    const ordered = [...result.events].sort((a, b) => a.at - b.at)
    const profilesSeen: Record<SessionMode, Set<string>> = { regular: new Set(), pve: new Set(), seasonal: new Set(), unknown: new Set() }
    for (const ev of ordered) {
      if (ev.kind !== 'profile') continue
      result.currentProfileByMode[ev.mode] = ev.profileId
      profilesSeen[ev.mode].add(ev.profileId)
    }
    const finished: Record<SessionMode, Set<string>> = { regular: new Set(), pve: new Set(), seasonal: new Set(), unknown: new Set() }
    for (const ev of ordered) {
      if (ev.kind !== 'taskFinished') continue
      const current = result.currentProfileByMode[ev.mode]
      const mine = ev.profileId ? ev.profileId === current : profilesSeen[ev.mode].size <= 1
      if (mine) finished[ev.mode].add(ev.taskId)
      else result.skippedOtherProfile += 1
    }
    for (const mode of Object.keys(finished) as SessionMode[]) result.finishedByMode[mode] = [...finished[mode]]
    return result
  }
}
