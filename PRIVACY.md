# Privacy

Tarkov Companion has no accounts, no tracking, no analytics and no advertising. It never sends anything about you, your game or your progress to the project or to anyone else.

## What stays on your computer

Everything you enter or the app works out: quests, level and faction, item collection, keys, hideout, drawings, story progress, raid log, settings, backups and what the stash scanner learned. It is stored in the app's own folder (`%APPDATA%\Tarkov Companion` for the desktop app) or in your browser's storage (web version). You can export, back up and delete it from Settings.

The desktop app reads Escape from Tarkov's own log files and the names of your in-game screenshots on your computer. What it reads from them (quest hand-ins, raids, your in-game position) is only used inside the app.

## What the app downloads

To work, the app connects to these services. Like any website visit, they see your IP address and that a copy of the app is asking; the app sends them nothing else about you.

| Service | Why |
| --- | --- |
| `json.tarkov.dev`, `assets.tarkov.dev` | Game data (quests, items, prices, maps) and pictures |
| `escapefromtarkov.fandom.com`, `static.wikia.nocookie.net` | Quest guides, story chapters and key pictures from the EFT Wiki |
| `github.com` (this project's releases) | Checking for and downloading updates (Settings → Updates can turn this off), and the Lighthouse map and stash scanner data the first time you need them |

## Things that only happen when you click

- **View public profile on tarkov.dev** opens your browser at `tarkov.dev/players/…/<your account id>`: the account id comes from your game logs and is part of that address.
- Links to the wiki, tarkov.dev or GitHub open in your normal browser.
- The stash scanner looks at screenshots you paste or capture with its hotkey. The picture is processed on your computer and is not uploaded.

## Questions

Open an issue on [GitHub](https://github.com/David04-09/tarkov-companion/issues).
