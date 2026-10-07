# Security

## Reporting a problem

If you find a security problem (for example a way for a web page, a map file or an imported file to run code, read files or reach the internet beyond the list below), please **do not open a public issue**. Use GitHub's private reporting instead: the repository's **Security** tab → **Report a vulnerability**. You will get an answer within a few days, and a fixed version is released through the normal auto-update.

## What the app promises

- It never touches Escape from Tarkov: no access to the game process or its memory, no injection, no input sent to the game, no reading of network traffic, nothing written to the game folder, nothing drawn on top of the game. Quest tracking reads the game's own text logs, read-only.
- It only talks to: `json.tarkov.dev` and `assets.tarkov.dev` (game data and pictures), `escapefromtarkov.fandom.com` and `static.wikia.nocookie.net` (wiki guides and pictures), and GitHub (updates). Nothing about you is uploaded anywhere.
- Your progress stays on your computer (browser storage, or `%APPDATA%\Tarkov Companion` for the desktop app).

## How the desktop app is protected

| Layer | What it does |
| --- | --- |
| Sandboxed page | `contextIsolation`, `sandbox`, no Node in the page, no `<webview>`, web security on. The page reaches Windows only through a small fixed API (`electron/preload.ts`). |
| Checked requests | Every request from the page is refused unless it comes from the app's own page (`electron/security.ts`). Settings are filtered to known fields with valid values; folder paths must be real local folders (a program can never be "opened" as a folder); links only open if they are `http(s)`; only the app's own scanner/OCR files and plain screenshot names can be read. |
| Content-Security-Policy | The page may only run its own code and connect to the services listed above (`vite.config.ts`). |
| Navigation lock | The window can only show the app's own `index.html`; other pages open in your normal browser, pop-ups are refused. |
| Permissions | Only notifications are allowed; camera, microphone, location, screen capture from the page, USB/HID/serial are always refused. |
| Electron fuses | Installed builds ignore `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`, load code only from the packaged `app.asar`, and check its integrity. Developer tools and the reload menu are off. |
| Remote map drawings | SVG maps from tarkov.dev are rebuilt from an allow-list of drawing elements (no scripts, event handlers or external links) before they are shown (`src/lib/sanitizeSvg.ts`). |
| Wiki content | Story and guide pages are rebuilt from an allow-list of plain HTML tags; no scripts, styles or attributes are copied (`src/api/storyWiki.ts`). |
| Imported files | Progress, backup and scanner-correction files are size-limited, parsed without object-tampering keys and validated field by field. |
| Builds | Released by GitHub Actions from tagged commits; third-party actions are pinned to exact commits; the bundled text-recognition model is checked against a fixed SHA-256. |

## Known limits

- **Updates are not code-signed yet.** Downloads come over HTTPS from this repository's GitHub Releases and are checked against the release's SHA-512 list, so their safety rests on the GitHub account. Windows SmartScreen may warn about the installer for the same reason.
- The web version runs in your normal browser and is protected by the same Content-Security-Policy.
