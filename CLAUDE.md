# Tarkov Companion — working notes for Claude

Web + Windows desktop app for Escape from Tarkov players: quest tracking, interactive maps with quest overlays, and (desktop only) automatic quest completion from the game's own log files. The owner is a non-programmer: explain results in plain English, give exact commands, and keep commits self-contained.

## Commands
- `npm run dev` web dev server (5173) · `npm run dev:desktop` Electron with hot reload · `npm run build` web · `npm run dist:desktop` NSIS + portable exe into `release/`
- `npm test` vitest (parser tests) · `npm run scan:logs` prints what a log backfill finds · `npx tsc -b` typechecks app + node + electron configs · `npx oxlint`
- `npm run tiles:lighthouse` regenerates the RE3MR Lighthouse tiles (needs `assets-src/lighthouse/re3mrLighthouseVERT.png`, 23 MB download, see README)

## Stack and layout
Vite 8 + React 19 + TypeScript (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Tailwind v4 (`@theme` tokens in `src/index.css`: surface/ink/line/accent…), React Router 7, TanStack Query 5, Zustand 5 (persist), Leaflet + react-leaflet 5, lucide-react, Electron 44 via vite-plugin-electron.
```
src/api        JSON API client (client.ts), types.ts (Raw* = wire shape, app types), queries.ts (adapters), hooks.ts, catalog.ts
src/store      progress.ts (quest progress), ui.ts (map prefs), mapOverlay.ts (checked tasks/layers), align.ts (dev tool pairs)
src/lib        taskStatus.ts (available/locked/completed rules), levelEstimate.ts, format.ts
src/config/nav.tsx   sidebar tabs = routes; add a tab by adding one line (fullBleed: true for edge-to-edge pages)
src/pages      DashboardPage, QuestsPage, MapsPage, AlignPage (/dev/align, dev builds only), stubs.tsx (Item Collection, Crafts, Flea)
src/maps       projection.ts (affine + Leaflet CRS), mapConfig.ts (base layers), MapViewer.tsx, overlay/* (quest markers, panel, layers)
src/desktop    renderer side of Electron bridge (useDesktop.ts, DesktopSettings.tsx, WatcherStatus.tsx)
src/shared/desktop-api.ts   IPC types shared by main, preload and renderer (no runtime imports)
electron/      main.ts (window, tray, IPC), preload.ts (contextBridge), settings.ts, logs/{parser,tailer,watcher,locator}.ts
src/data/mapConfig.json      vendored tarkov.dev map config (records source commit)   scripts/   tile + scan scripts
```

## Data source: tarkov.dev JSON API (NOT GraphQL)
- Base `https://json.tarkov.dev`, catalog `/endpoints` (read first; `catalog.ts` asserts tasks/items/traders/maps exist). Docs: `/{gameMode}/{tasks|items|traders|maps}` with gameMode `regular` (PvP) or `pve`. GraphQL is deprecated and was down; never reintroduce it.
- Base docs contain translation keys, not English (`"657315dd… name"`). Always fetch `/{gameMode}/{endpoint}_en` and merge (`translate.ts`). traders doc: `data` keyed by id directly; maps/tasks/items under `data.maps|tasks|items`.
- Items doc is 17 MB raw (1.4 MB brotli); loaded lazily (`useItems`) and returns `{ items, playerLevels }`. Prices endpoint `/{gameMode}/prices/{itemId}` cached 5 min. Everything else staleTime 1 h, error retry every minute.
- Data quirks (current wipe): 282/515 tasks have minPlayerLevel 0, 296 have no quest prerequisites, 164 are gated by `otherRequirements` (story `globalVariable`/trader `dialogue`) we cannot track (shown as "Also requires"); `kappaRequired` true on only 13 tasks; zone ids repeat per map variant (dedupe by position); `exitName` on extract objectives matches `MapExtract.name`.

## Progress store (`src/store/progress.ts`, localStorage `tarkov-companion-progress`, v2)
`{ gameMode: 'regular'|'pve', profiles: { regular, pve } }`, each profile `{ playerLevel, faction: 'USEC'|'BEAR', completedTaskIds: Set, activeTaskIds: Set, failedTaskIds: Set }`. Sets are persisted through a replacer/reviver. **Any version bump needs a `migrate` function or zustand drops saved progress** (bitten once). Export/import JSON via Settings. Status rule: completed → available if level met and every prerequisite with status containing "complete" is done → else locked; "active"/"failed"-only requirements are treated as met.

## Maps
- Imagery per map = list of base layers (`mapConfig.ts`), each with an `affine` `[a,b,c,d,e,f]` (px = a·x+b·z+c, py = d·x+e·z+f in zoom-0 pixels) and `bounds`. tarkov.dev layers are derived from the vendored JSON (`affineFromTarkovDev`), extra layers live in `EXTRA_BASE_LAYERS`. Leaflet works in game coordinates: `L.latLng(z, x)`; the CRS applies the affine, so switching image = remounting MapContainer with a new CRS.
- Projection verified on Customs dorms. Interchange defaults to the SVG drawing (tiles are from 2023). Lighthouse uses RE3MR's render (CC BY-NC-SA 4.0, tiles gitignored); first-pass affine fitted from 15 extract icons, RMS ≈ 20 m; refine with `/dev/align` and paste "Copy transform" into `RE3MR_LIGHTHOUSE_AFFINE`. tarkov.dev has no satellite imagery for Lighthouse and its SVG is pre-1.1.5.
- Floors: tarkov.dev extents are per building (`{height, bounds:[[x,z],[x,z],label]}`); use `floorForPosition`, never height alone. Tile path uses `import.meta.env.BASE_URL` so it works from file:// in the desktop build.
- Overlay: `buildMapTasks` resolves zones/spawn points/named extracts per task; keys come from `requiredKeys` else a locked door within 7 m on the same floor (badged "?"; the lock list has gaps, e.g. Chumming's room 314). >200 markers switches to canvas circles. Checked tasks/colours/layer toggles persist in `mapOverlay.ts`.

## Desktop / log watcher (read-only, promised in README)
- Logs live in `<install>\build\Logs\log_<date>_<version>\` with files `"<stamp> application_000.log"` and `"<stamp> push-notifications_000.log"` (older builds: `notifications.log`; `output.log` duplicates them, skip it). Line format `date time|version|level|category|message` + optional pretty JSON block ending with a `}` line.
- Events: `Session mode: Pve|Regular|PvpSeason`, `… ProfileId:<hex> AccountId:<n>`, `scene preset path:maps/x.bundle` (= GameMap.scenePath), `TRACE-NetworkGameCreate profileStatus: '… Location: Interchange, … shortId: …'` (Location = GameMap.nameId), `GameStarting:/GameStarted:`, `Got notification | UserMatchOver`, `Got notification | ChatMessageReceived` with `message.type` 10/11/12 = task started/failed/finished and `templateId` = `<taskId> <suffix>`; type 4 + templateId `5bdabfb886f7743e152e867e 0` = flea sale. Mode for a notification is taken from the application log's mode timeline at that time.
- On this PC: Steam install `D:\SteamLibrary\steamapps\common\Escape from Tarkov\build\Logs` (found via BSG launcher settings `tempFolder`; that file also holds an auth token, read only the path fields). Owner plays PvE; first backfill found 93 completed quests. `userData/last-backfill.json` holds the last summary (Electron on Windows does not pipe main-process console output).
- Licensing: patterns were learned from TarkovMonitor (GPL-3.0) but written independently; do not paste its code. Player level cannot be synced: `player.tarkov.dev` needs a Turnstile token bound to tarkov.dev; Dashboard shows a quest-XP lower bound instead.
- The template `.gitignore` ignores any `logs` folder; `electron/logs/` is un-ignored explicitly. Electron bundles must be CJS (`dist-electron/main.cjs`, `preload.cjs`) because package.json is `type: module`. The renderer uses HashRouter when `window.desktop` exists.

## Environment gotchas
- Bash tool: long multi-file heredocs (~10 KB+) fail to parse and write nothing; use the Write tool for source files. `$TMP` in Bash is `C:\Users\David-HPC\AppData\Local\Temp`, not the scratchpad.
- The Claude browser pane is often hidden: screenshots time out and animation frames/transitions don't run (map size caching, sidebar width). Verify with JS probes, set `resize_window` 1280×800 before measuring, reload after resizing. The HMR-cached `useMemo` results persist across module hot updates; reload to verify logic changes.
- npm 11 blocks install scripts for new packages; `npm install-scripts approve <pkg>` or run `node node_modules/electron/install.js` if the Electron binary is missing.

## Status
Done: Dashboard, Quests tab, Maps (viewer, base layers, Lighthouse render, quest overlay with panel/legend/extra layers, dev alignment tool), desktop app with tray, log watcher (parser + 10 tests, backfill, status light, settings), level estimate, README.
Next candidates: owner refines Lighthouse alignment in `/dev/align`; Phase 3 drawing tools (geoman, per-map/per-mode persistence, export/import, route length in metres); Item Collection / Crafts / Flea tabs (hideout, crafts, barters, prices endpoints exist); auto-update for the desktop build; manual "story stage" setting if the Available filter stays too generous. There is no Tarkov Tracker sync in this repo (the owner once mentioned one; it was never built).
