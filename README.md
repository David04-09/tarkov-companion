# Tarkov Companion

A free Windows app (and web app) for Escape from Tarkov players: quest tracking that fills itself in from the game's log files, interactive maps with quest, loot and boss-spawn overlays, item collection, hideout, crafts and flea market tools. Game data comes live from the free [tarkov.dev](https://tarkov.dev) JSON API.

## For friends: install it

1. Download **TarkovCompanion-Setup-x.y.z.exe** from the [latest release](https://github.com/David04-09/tarkov-companion/releases/latest) (or the `-portable.exe` if you prefer no installer).
2. Run it. **Windows SmartScreen will say "Windows protected your PC"**: click **More info**, then **Run anyway**. This appears because the app is not code-signed (certificates cost money); it is a one-time thing. Updates install from inside the app and do not trigger it again.
3. The installer needs no admin rights: it installs for your user only, with a desktop and Start-menu shortcut.
4. On first start a short setup screen finds your EFT logs folder (or lets you pick it), asks PvP/PvE and faction, and offers to read your old logs so quests you have already finished are ticked.

### Stash scanner

In **Item Collection**, click **Scan screenshot** (or copy a screenshot and press Ctrl+V). In the desktop app you can also press **Alt+Shift+S** while playing: it captures the game screen and opens the scanner. It recognises the items in a stash or container, shows what it found with a confidence label, and lets you fix amounts or pick the right item before adding them to Item Collection. It works fully offline and only looks at the picture.

### How it works, in one paragraph

Escape from Tarkov writes plain-text log files while you play. The app watches the newest log and notices lines like "quest finished", "raid started" and "game mode PvE". That is how it ticks quests, starts the raid timer and opens the right map. **It only reads those files.** It never touches the game process, its memory, its files or its network traffic, and never writes into the game folder. Everything else (quest list, items, prices, maps) comes from tarkov.dev over HTTPS and is cached on your PC, so the app keeps working offline except for live flea prices.

Your data (progress, settings, map drawings) lives in `%APPDATA%Tarkov Companion` and survives updates and reinstalls. Export it from Settings to move it to another PC.

### Updates

The app checks GitHub Releases on launch and every 6 hours, downloads the new version in the background and shows a small "restart to update" bar. Because the builds are unsigned, the updater cannot verify a publisher signature: the only guarantees are HTTPS and the GitHub account that owns this repository.

## How to open the app

You need [Node.js](https://nodejs.org) installed (version 20 or newer).

1. Open a terminal in this folder.
2. The first time only, install the dependencies:

   ```bash
   npm install
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open the address it prints, normally <http://localhost:5173>, in your browser.

Press `Ctrl+C` in the terminal to stop it.

## What is in the app

- **Dashboard**: set your player level and faction, see how many quests are completed / available / locked, and a "Next up" list of the ten available quests with the lowest level requirement.
- **Quests**: every quest in the game with trader, map, minimum level and status. Filter by trader, map, status and text, sort any column, tick quests off as you complete them, and click a quest to see its objectives, prerequisites and wiki link. Kappa-required quests carry a badge.
- **Maps**: interactive map viewer (zoom, pan, fullscreen) for every playable map, with floor switching on multi-level maps and a per-map image selector where several images exist. Imagery, bounds and coordinate transforms come from the open-source tarkov.dev project (see `src/data/mapConfig.json`, `src/maps/mapConfig.ts` and `src/maps/projection.ts`). Lighthouse uses RE3MR's post-rework render instead (see below).
  - **Quest overlay**: the panel on the right (bottom drawer on phones) lists every quest with an objective on the current map, filtered by status, trader and text. Tick quests to draw their objective markers and zones, each quest in its own colour, with a legend bottom-left. Markers carry an icon per objective type, numbered when an objective has several possible spots, and are dimmed when they are on another floor. Click a marker or zone for the details; the key badge shows which key opens the way (dashed badge = guessed from a nearby locked door). Extra layers: PMC/Scav extracts, transits, locked doors with key names, player spawns, boss spawns, caches and loot containers.
- **Item Collection, Crafts, Flea Market**: placeholders for later.
- **PvP / PvE toggle** (sidebar footer): switches which game mode's data is loaded. Progress is stored separately per mode, just like in the game.
- **Settings** (sidebar footer): export your progress to a JSON file, import it again, reset it, or force a data refresh.

Your progress is saved in the browser (localStorage), so it stays on this computer unless you export it.

## Data source

Everything comes from `https://json.tarkov.dev`:

| Document | Used for |
| --- | --- |
| `/endpoints` | Catalog of endpoints, game modes and languages. Read first on every load. |
| `/{gameMode}/tasks` + `/{gameMode}/tasks_en` | Quests, objectives, prerequisites. |
| `/{gameMode}/traders` + `_en` | Trader names. |
| `/{gameMode}/maps` + `_en` | Map names. |
| `/{gameMode}/items` + `_en` | Item names, icons and flea prices. |
| `/{gameMode}/prices/{itemId}` | Flea price history (cached 5 minutes). |

The base documents do not contain readable English. Names are translation keys such as `657315ddab5a49b71f098853 name`, so the `_en` document is always fetched alongside and merged in.

Data is cached for one hour and refreshed in the background. If tarkov.dev is unreachable the app shows the error on screen and retries every minute.

## Desktop app (Windows) with automatic quest tracking

The same code also runs as a desktop app (Electron). On the desktop it watches Escape from Tarkov's own log files and marks quests complete as you finish them, so no other tracker software is needed. The web build is unchanged; desktop-only features appear only when running in the desktop app.

### Run it in development

```bash
npm run dev:desktop
```

This starts the Vite dev server and opens the desktop window with hot reload. The Settings dialog (sidebar footer) shows the detected logs folder and the watcher status.

### Build the installer

```bash
npm run dist:desktop
```

Produces `release/TarkovCompanion-Setup-<version>.exe` (NSIS installer, per-user) and `release/TarkovCompanion-<version>-portable.exe`, plus `latest.yml` for the in-app updater. Build the Lighthouse tiles first (`npm run tiles:fetch && npm run tiles:lighthouse`) so they are bundled.

### Releasing

Bump `version` in `package.json`, commit, then tag and push:

```bash
git tag v1.0.1 && git push && git push --tags
```

The GitHub Actions workflow (`.github/workflows/release.yml`) builds the tiles and the installer on a Windows runner and attaches everything to the GitHub Release. Installed apps pick the new version up automatically.

### How the log watching works

- The game writes a folder per session under `<EFT install>\build\Logs\log_<date>_<version>\`. The app finds the install via the BSG launcher's settings file (`%APPDATA%\Battlestate Games\BsgLauncher\settings`, only the install path fields are read), the Steam library list, the Windows uninstall registry entries and a few default paths. You can also pick the folder by hand in Settings.
- It tails the newest session's `application` and `push-notifications` logs and reacts to quest started / finished / failed, game mode (PvP/PvE), profile selection, raid matching / start / end, map loading and flea market sales.
- Completions go into the PvP or PvE profile according to the game mode the log reports. "Read past logs" in Settings scans every old session once (it runs automatically the first time) to backfill completed quests.
- **Player level** is not written to the logs, and tarkov.dev's public profile API (`player.tarkov.dev`) requires a Cloudflare Turnstile browser check bound to tarkov.dev's own domain, so it cannot be called from this app. The level therefore stays a manual field; the Dashboard shows a "Level estimate" lower bound computed from the XP rewards of your completed quests and the game's level table, with a one-click "Set level" button. Settings shows your account id with a link to your public profile on tarkov.dev.
- **Timers** (desktop): the raid timer starts from the game log's "GameStarted" line and shows time left (from the map's raid length) and the 7-minute run-through window. The log doesn't say whether you spawned as PMC or Scav, so the scav cooldown is started by hand from the Dashboard; its length is configurable. Optional sounds are off by default.
- **Overlay window** (desktop): `Ctrl+Shift+T` (configurable in Settings) toggles a small always-on-top window with the current map (auto-selected from the last raid start), your checked quests, timers and the Ctrl+K item lookup. Drag its top bar to move, resize from the edges, adjust opacity from the slider; position and size are remembered. It is a plain window, so run the game in **borderless windowed** mode for it to stay visible. It never interacts with the game process.
- **Wipe detection** (desktop): a new profile id or a jump in the game's major version shows a one-time banner offering to archive your progress and start fresh. Archives are listed under Settings and can be restored or deleted; you can also archive manually.
- **Safety**: the watcher only *reads* log files. It never touches the game process, its memory or its network traffic, and never writes anything into the game folder.
- The log line meanings were learned from the open-source [TarkovMonitor](https://github.com/the-hideout/TarkovMonitor) project (GPL-3.0). The parser in `electron/logs/parser.ts` is an independent TypeScript implementation tested against real log samples (`npm test`). `npm run scan:logs` prints what a backfill would find without starting the app.

## Map imagery

Each map can have several base images ("layers"), each with its own transform from game coordinates to pixels. The tarkov.dev layers come from the vendored config. Extra layers are declared in `src/maps/mapConfig.ts` under `EXTRA_BASE_LAYERS`.

### Lighthouse (RE3MR render)

The tarkov.dev Lighthouse drawing predates the 1.1.5 rework, so Lighthouse uses the render by RE3MR ([reemr.se](https://reemr.se), CC BY-NC-SA 4.0) instead. The source PNG (23 MB) and the generated tiles are not committed. To regenerate them:

```bash
curl -L -o assets-src/lighthouse/re3mrLighthouseVERT.png https://reemr.se/maps/Lighthouse/re3mrLighthouseVERT.png
```

```bash
npm run tiles:lighthouse
```

This slices the image into 256 px tiles under `public/tiles/lighthouse-re3mr/{z}/{x}/{y}.png` (zoom 0 to 6, about 1300 tiles, 51 MB). Until the tiles exist the Maps tab shows a message on Lighthouse; the old tarkov.dev drawing remains selectable in the image dropdown, labelled as outdated.

### Aligning a new image

Start the dev server and open <http://localhost:5173/dev/align> (not linked from the sidebar, dev builds only). Pick the map and image, choose a reference point with a known in-game position (extracts, transits, quest objectives from the tarkov.dev data), click where it sits on the image, and repeat for at least three well-spread points. The tool fits a least-squares affine transform, shows the residual error per point, and "Copy transform" gives the JSON to paste into that layer's `affine` in `src/maps/mapConfig.ts`. Placed points are kept in the browser between sessions.

## Project layout

```
src/
  api/        JSON API client, TypeScript types, translation merge, TanStack Query hooks
  store/      Zustand store for player progress (persisted to localStorage)
  lib/        Quest status rules and formatting helpers
  config/     nav.tsx: the sidebar tabs. Add a tab by adding one line here.
  components/ Sidebar, layout, settings dialog, shared badges and loading/error panels
  pages/      One component per tab
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the production bundle into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run the linter |
