/**
 * The app's own features and fixes per version, shown on the "Features & patches" page.
 * Add an entry to UNRELEASED with every fix that is committed but not released yet; at release
 * time move them into a new RELEASES entry at the top.
 */
export interface ChangelogEntry {
  version: string
  /** YYYY-MM-DD */
  date: string
  title: string
  changes: string[]
}

/** Committed, waiting for the next update. */
export const UNRELEASED: string[] = [
  'Wiki pictures load reliably: the wiki\'s picture server is now asked the way it expects, and a picture that still fails retries by itself (then shows "Try again").',
  'New quests and game content are checked every 6 hours instead of every hour (Settings → Prices & game data). Trader restock times and the Goons\' map still stay up to date while those screens are open.',
  'Desktop: "Clean up after updates" removes old update installers, old map/scanner packs, crash reports and older installers in your Downloads folder (to the Recycle Bin). Also a "Clean up now" button in Settings.',
  "New tab: Neural network, an assistant that works offline and uses almost no resources, so it can run while you play. Say where you spawned and where you want to go (\"I spawned at Crossroads, how do I get to Dorms?\") and it draws a walking route around water, fences, rocks, minefields and buildings, says how far it is and which way to start, and can put the route on the Maps tab. It also finds the closest available quest, knows 280 place names and every extract, answers about quests, items, keys and your progress, offers to mark quests done, show them on the map or open a gun in the Weapon builder (each only when you click), and reads answers out loud (male or female voice, volume and speed).",
  'New page: Features & patches (this list).',
]

export const RELEASES: ChangelogEntry[] = [
  { version: '1.18.0', date: '2026-10-21', title: 'Scan quest list on Maps', changes: ['Maps: "Scan quest list" reads your in-game quest list from a screenshot and ticks the quests on the current map after you review them.', 'Attempted fix for grey wiki pictures.'] },
  { version: '1.17.0', date: '2026-10-07', title: 'Where to find keys', changes: ['Keys: where the key itself spawns, shown on the map, plus the wiki\'s key location notes and who sells it.'] },
  { version: '1.16.0', date: '2026-10-07', title: 'Scanner Undo', changes: ['Stash scanner: Undo for Apply.'] },
  { version: '1.15.1', date: '2026-10-07', title: 'Morning game sessions', changes: ['Game sessions started before 10:00 are read again (quests from them were not ticked).'] },
  { version: '1.15.0', date: '2026-10-07', title: 'Events & patches tab', changes: ['Game server status, the current in-game event and the bugs fixed in the latest game patches.'] },
  { version: '1.14.1', date: '2026-10-07', title: 'Portable app fix', changes: ['The portable exe refused every request on some PCs; fixed.'] },
  { version: '1.14.0', date: '2026-10-07', title: 'Open source and content packs', changes: ['Licence GPL-3.0.', 'The Lighthouse map picture and the scanner data download on first use instead of being in the installer.'] },
  { version: '1.13.1', date: '2026-10-07', title: 'Only accurate info', changes: ['No guessed quest keys on maps and no guesses in the scanner.'] },
  { version: '1.13.0', date: '2026-10-07', title: 'Key details', changes: ['Keys: click a key to see its door on the map, pictures, loot behind it and whether it is worth keeping.'] },
  { version: '1.12.1', date: '2026-10-07', title: 'App id', changes: ['Internal app id changed (updates keep working).'] },
  { version: '1.12.0', date: '2026-10-07', title: 'Settings page and themes', changes: ['Full Settings page with search, themes, text size, number formats.', 'Much faster start-up.', 'Security hardening.'] },
  { version: '1.11.1', date: '2026-10-07', title: 'New gun pictures', changes: ['Weapon builder: pictures for new gun variants.'] },
  { version: '1.11.0', date: '2026-10-07', title: 'Scanner knows guns', changes: ['Stash scanner recognises guns, also modded ones by their name.'] },
  { version: '1.10.0', date: '2026-10-07', title: 'Modding view', changes: ['Weapon builder: in-game style Modding view.'] },
  { version: '1.9.0', date: '2026-10-07', title: 'Weapon builder and quest tree', changes: ['Weapon builder.', 'Quest tree and Kappa path.', 'Raid log editing, daily backups and app health.'] },
  { version: '1.8.1', date: '2026-10-07', title: 'Log accuracy', changes: ['Profile resets detected, every raid counted.'] },
  { version: '1.8.0', date: '2026-10-07', title: 'Money makers and more', changes: ['Money makers and Ammo tabs, raid log, "Where am I", the map\'s "Bring for this raid" box.', 'Overlay window removed.'] },
  { version: '1.7.0', date: '2026-10-07', title: 'My stats', changes: ['My stats tab from the game logs.'] },
  { version: '1.6.0', date: '2026-10-05', title: 'Scanner box editor', changes: ['Item names pin positions; boxes can be edited.'] },
  { version: '1.5.0', date: '2026-10-04', title: 'Story tab', changes: ['Story chapters, endings and quest time gates.'] },
  { version: '1.4.6', date: '2026-10-04', title: 'Dialogs above the map', changes: ['Settings and other dialogs open above the map.'] },
  { version: '1.4.5', date: '2026-10-04', title: 'Update fallback', changes: ['Updates log every step and offer the normal installer if needed.'] },
  { version: '1.4.4', date: '2026-10-04', title: 'Scanner Apply once', changes: ['Apply works once per screenshot.'] },
  { version: '1.4.3', date: '2026-10-04', title: 'Update messages', changes: ['Says what happens after "Restart to update".'] },
  { version: '1.4.2', date: '2026-10-04', title: 'Scanner cell size', changes: ['Works out the cell size for every snip.'] },
  { version: '1.4.1', date: '2026-10-04', title: 'Scanner accuracy', changes: ['Steadier grid, reads item names.'] },
  { version: '1.4.0', date: '2026-10-04', title: 'Scanner learns', changes: ['Stash scanner learns from your fixes.'] },
  { version: '1.3.0', date: '2026-10-04', title: 'Keep or sell', changes: ['Scanner shows what to keep or sell.'] },
  { version: '1.2.0', date: '2026-10-04', title: 'Stash scanner', changes: ['Recognise items from a stash screenshot into Item Collection.'] },
  { version: '1.1.0', date: '2026-10-03', title: 'Quest sync and guides', changes: ['Quest sync review and Undo, quest guide pictures, Gunsmith builds.'] },
  { version: '1.0.3', date: '2026-10-03', title: 'Portable updates', changes: ['The portable exe offers a download instead of failing to update.'] },
  { version: '1.0.2', date: '2026-10-03', title: 'Setup again', changes: ['Setup and log catch-up offered again when progress is empty.'] },
  { version: '1.0.1', date: '2026-10-03', title: 'Map banner', changes: ['No more false "tiles could not be downloaded" banner.'] },
  { version: '1.0.0', date: '2026-10-03', title: 'First release', changes: ['Quests, maps with quest overlays, hideout, flea market and automatic quest ticking from the game logs.'] },
]
