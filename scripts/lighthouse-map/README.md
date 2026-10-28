# Updated Lighthouse drawing

`lighthouse-2026.svg` is Lighthouse in tarkov.dev's flat drawing style, updated to the current
layout. The app shows it as "Updated drawing (2026)" (the default Lighthouse picture); it travels in
the Lighthouse content pack (`scripts/tile-lighthouse.mjs` copies it next to the RE3MR tiles), so it
is not in the installer.

**Licence: CC BY-NC-SA 4.0.** It combines tarkov.dev's Lighthouse drawing
([the-hideout/tarkov-dev-svg-maps](https://github.com/the-hideout/tarkov-dev-svg-maps), Shebuka and
contributors, CC BY-NC-SA 4.0, not for use in cheating software) with shapes traced from RE3MR's
Lighthouse 1.7 render ([reemr.se](https://reemr.se/maps/Lighthouse/), CC BY-NC-SA 4.0).

## How it is made

- **Ground** (sea, land, lakes, rock, dirt roads, west-coast piers, the map border) is tarkov.dev's
  drawing (`tarkov-dev-lighthouse.svg`, kept as downloaded), minus the old lighthouse island.
- **Roads, yards, concrete, rails, walls, buildings, tanks, the rebuilt island, the causeway and the
  south road landslide** are traced from the RE3MR render in `specs/*.json` (drawing units ≈ metres:
  `r` rectangles, `p` polygons, `c`+`w`/`h`/`a` turned rectangles, `c`+`rad` circles, `l` lines with
  width `w`).
- RE3MR's render is a hand-made model, so it drifts from the game in places. `specs/warp.json` moves
  the traced shapes onto the game's own positions: no change where quest zones, door locks and
  containers from the game data sit right on the render (most of the map), up to ~17 m on the
  causeway and ~8 m on the island, where the game's claymores and the Top Secret quest zone show the
  render is off.
- **Minefields** are the game's own outlines (`minefields.json`, from `hazards.cjs`).

`frames.cjs` holds the coordinate frames (game ↔ drawing ↔ render, using the app's RE3MR fit).

## Commands (run from the repository root; without Node use `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe`)

- `node scripts/lighthouse-map/build.cjs scripts/lighthouse-map/tarkov-dev-lighthouse.svg scripts/lighthouse-map/minefields.json scripts/lighthouse-map/lighthouse-2026.svg` rebuilds the drawing.
- `trace.cjs <out.png> --box=u0,v0,u1,v1 --px=4 [--specs=a.json;b.json] [--old=old.svg --all=1] [--points=points.json]` shows the render straightened into drawing units with a grid, for tracing and checking.
- `drawing.cjs <svg> <out.png> --box=… [--points=…] [--zones=…]` draws a drawing with game points and quest zones on top.
- `side.cjs <svg> <out.png> --crop=x,y,w,h` puts the render and a drawing side by side.
- `points.cjs`, `hazards.cjs`, `zones.cjs` fetch the game's containers/locks/extracts, minefields and quest zones from json.tarkov.dev; `straighten.cjs` and `tile.cjs` are picture helpers.

All of them need the RE3MR render in `assets-src/lighthouse/re3mrLighthouseVERT.png` (`npm run tiles:fetch`), except `build.cjs`.
