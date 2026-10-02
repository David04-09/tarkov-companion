# Tarkov Companion

A web app for Escape from Tarkov players: track your quests, level and faction, and see what you can work on next. Game data comes live from the free [tarkov.dev](https://tarkov.dev) JSON API.

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
