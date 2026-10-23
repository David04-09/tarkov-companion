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
export const UNRELEASED: string[] = []

export const RELEASES: ChangelogEntry[] = [
  {
    version: '2.6.0',
    date: '2026-10-23',
    title: 'Voice commands for the whole app, Goons per map, a quieter assistant',
    changes: [
      "Voice commands for the whole app. With \"Always listen\" on (Neural network tab), say a tab or map on its own and the app goes there: \"Maps\", \"Flea market\", \"Quests\", \"Hideout\", \"Customs\", \"open the Woods map\", \"go back\". It also opens things by name: \"show quest Debut\", \"show key dorm 314\", \"search GPU on the flea\", \"LEDX in my collection\", \"show ammo M995\". No \"Hey Ranger\" needed for these; a command must be the whole sentence, so a tab name said in passing does nothing.",
      "Assistant: \"Goons\" shows their spawn chance and spots on the map you are on (or the one you name, or last asked about), with where they were last reported and the chance on the other maps.",
      "Assistant: understands spelled-out abbreviations: \"G P U\", \"gee pee you\", \"see pee you\" and the like become GPU, CPU, SSD … (every abbreviation the game uses as a short name).",
      "Desktop: the pop-up over the game closes by itself after the time you choose (slider on the Neural network tab, 15 seconds to start with; 0 = only when you say \"close\").",
      "The assistant no longer talks at all, also not with the Windows voices: answers are shown in the app and in the pop-up. The raid briefing is a card only.",
    ],
  },
  {
    version: '2.5.0',
    date: '2026-10-23',
    title: 'A lighter app and a quicker assistant: item cards, follow-ups and a pop-up over the game',
    changes: [
      "Removed the Weapon builder, Crafts and Money makers tabs to keep the app lighter. Favourite crafts no longer count towards the Item Collection (they could not be changed any more), and the Dashboard's top crafts card is gone with them.",
      "Desktop: the assistant shows its answers in a pop-up over the game. A small see-through card in the top left of the screen your mouse is on, with the answer and its details. It never takes the mouse or keyboard from the game (clicks go straight through). Say \"close that\" (or \"hide it\") to close it and \"show that again\" to bring it back. Switch it off under Voice on the Neural network tab. Shows over the game in borderless or windowed mode, not in exclusive full screen.",
      "Assistant: just say an item's name. \"Dorms marked key\" shows where its lock is, what it goes for and whether the room is worth it (from the wiki's \"Behind the lock\" list); \"LEDX\" or \"GPU\" shows the price, where it lies around and which of your quests need it. Three or four short lines, so the pop-up stays small.",
      "Assistant: follow-up questions. After the west 306 key, \"how much is it worth?\" and \"where can I find it?\" are about that key; after the LEDX price, \"what about the GPU?\" gives the GPU's price; after Customs' extracts, \"and on Woods?\" gives Woods'. Keys and items named in part (\"west 306\") count too.",
      "Assistant: faster. A question ends after 1.3 seconds of quiet (was 1.8), and the plain-English helper gets ready as soon as you say its name.",
      "Assistant: fewer false answers while you talk to friends. After \"Hey Ranger\" only questions, requests and item names are answered; chatter like \"push left\" or \"nice one\" is not even looked at, and the plain-English helper has to be surer before it answers.",
      "Assistant: the natural voice is gone. Answers are shown (in the app and in the pop-up) instead of read out, which saves a 57 MB download, memory and CPU while you play. \"Read answers out loud\" still works with the Windows voices if you switch it on. The old voice download is cleaned up after the update.",
    ],
  },
  {
    version: '2.4.0',
    date: '2026-10-21',
    title: 'An assistant that understands you: plain English, quiet around friends, talks like a person',
    changes: [
      "Assistant: talks like a person. \"Chemical - Part 1 is one of Skier's, on Customs. You can do it now.\" instead of reading out a database line; \"The LEDX is going for about 571 thousand roubles on the flea right now\"; \"Here's the way from Crossroads to Dorms. It's about 650 metres on foot; head west to start.\" Spoken answers use contractions, round prices the way people say them and now and then start with \"Sure.\" or \"Right.\".",
      "Assistant: learns how you like to be answered. Say \"too long\" or \"just the price\" after an answer and that kind of answer stays short; \"tell me more\" reads the details, and if you ask for more a second time it gives that kind of answer in full from then on. \"Call me Dave\" or \"don't call me sir\" changes how it addresses you.",
      "Fixed: \"collected a GPU\" without a number was treated as a guess, because of a broken character in a check.",
      "Assistant: stays out of your conversations. After \"Hey Ranger\" it only answers what is clearly for it; anything it does not understand (\"dude push left\", \"lol that was close\") is left unanswered and shown greyed out instead of \"I don't know\". Say \"not you\" when it answered something you said to a friend and it ignores that kind of line from then on; \"that was for you\" makes it answer what it skipped. The mic button and typed questions always get an answer.",
      "Assistant: understands plain English. When its rules do not understand a question, or only guessed, a small offline language model (17 MB, a millisecond per question, loaded only when needed) works out which question you meant: \"yo what's a LEDX going for\" → the price, \"I need to get out of Woods\" → the extracts, \"who runs around on Interchange\" → the bosses, \"is the bitcoin junk\" → keep or sell. The answer shows how it took you (\"I took that as: …\"). Nonsense still gets \"I don't know\". \"Thanks\" gets \"Anytime, sir\".",
      "Assistant: teaching nicknames works by voice. A nickname is recognised however the speech model spells it and in plural: teach \"leddy means LEDX\" once, and \"lady\", \"laddie\", \"leti\" and \"leddies\" all mean the LEDX. More ways to teach: \"leddy is short for LEDX\", \"by leddy I mean LEDX\", \"remember that leddy means LEDX\". You can teach several nicknames for one item.",
    ],
  },
  {
    version: '2.3.0',
    date: '2026-10-21',
    title: 'The assistant in raid: more answers, better hearing, it learns your words',
    changes: [
      "Assistant: knows which map you are on. During a raid (from the game log) or after an in-game screenshot in the last 30 minutes, questions without a map name are about that map (\"extracts\", \"where is the gas station\", \"closest quest\"); naming another map still works.",
      "Assistant: teach it names it does not know. When it says it does not know \"xeno\", say \"xeno means xenomorph sealing foam\" (or \"that means …\" / \"no, I meant …\", also after a wrong guess) and it remembers. A meaning must be a real item, quest, place or map, so nothing made-up is stored. Taught words are listed under Memory, where you can delete them. Also fixed: an item's full name always wins (\"hand drill\" used to find the Electric drill).",
      "Assistant: hears game names much better. When the speech model writes a name as English (\"pox a ram\", \"off the muscope\", \"colontae\", \"annuljan\"), the assistant matches how it sounds against every item, quest, place, trader and boss name and puts the right one back (Poxeram, Ophthalmoscope, Kollontay, Analgin). When a question still makes no sense, it also tries what the game-words-only recogniser heard. Everyday words are never changed.",
      "Assistant: answers for during and after a raid. In raid: \"how long is left?\" (raid clock from the game log), \"what time is it in Tarkov?\", \"where am I?\" (from your last screenshot), \"bosses on Customs\", \"where does Killa spawn?\", \"where are the Goons?\", \"safes on Customs\", \"loot near Dorms\", \"minefields on Woods\", \"locked doors near Dorms\", \"what keys do I need for <quest>?\" (quest data only). Gear: \"best ammo for 5.45 / for the M4A1\", \"will M995 go through class 5?\", \"should I keep the LEDX?\" (keep what you still need, else where it sells best, with the price per slot), \"what should I loot on Customs?\". After raid: \"what did I hand in today?\", \"my stats\", \"what does <quest> unlock?\", \"when does Prapor restock?\", \"when can I scav?\". Say \"help\" for the full list.",
      "Assistant: numbers are read the way players say them: \"Dorm room 314\" is \"three one four\" and \"ZB-014\" is \"Z B zero one four\" (the raid briefing used to stumble over key numbers). Prices, distances and counts stay normal numbers.",
      "Assistant: asks are taken literally. Quest parts are never swapped (\"Signal part 1\" no longer shows Part 3); when the game data has no such part it says so and names the parts it has. Completed quests are found as well.",
      "Assistant: price and value questions answer the price (\"what is a GPU I found worth\" used to count it towards your Item Collection). How many you still need is shown under the price, not read out; it is only said when you ask how many you need.",
      "Assistant: better routes. \"Draw me a path to Dorms\" with no start begins at the PMC spawn closest to it; \"from the west side\" starts at a spawn out on that side of the map; \"path for Delivery from the Past\" visits every objective of the quest on its map in a short order; \"then extract\" or \"to the nearest extract\" ends at the closest PMC extract. Each leg's distance is listed. Asking for the best or safest route says honestly that it is the shortest one: the data has nothing on cover or where players fight.",
    ],
  },
  {
    version: '2.2.0',
    date: '2026-10-21',
    title: 'A smarter assistant: better hearing, normal pace, learns from you',
    changes: [
      'Assistant: it learns from you, all on this PC. "Remember that I keep the 314 key in my case" is kept and "where is my 314 key?" gets it back. When it gets a word wrong, say "no, I meant the Red Rebel" (or "when I say red one I mean red rebel") and it understands you from then on. It learns which maps you play, when, and how they go (from the game log and the after-raid card), and "what should I play tonight?" picks a map from your open quests and your habits. If you keep cutting its answers off it only reads the first sentence ("keep it short" / "more detail" set it yourself). Once a day it greets you with real numbers ("Evening, sir. 13 quests left on the way to Kappa…"). Ask "what do you know about me?", or see and delete everything under Memory on the Neural network tab. It is also in the progress export and the daily backups.',
      'Assistant: much better speech recognition. Your questions are now turned into text by Moonshine, a modern offline model that copes with real microphones, background noise and accents (a 28 MB download the first time; about a fifth of a second per question on one CPU core). Before, "how much is a LEDX worth" through a headset came out as "how march is leg word"; now it is heard right. The old recogniser only listens for "Hey Ranger" and for when you stop talking.',
      'Assistant: the natural voice talks at a normal pace. Each voice was measured and tuned to about 170 words a minute at Speed 1.0× (Bella and Leo were at about 100), and the long silences between sentences are gone.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-10-21',
    title: 'Raid briefing, wake word, natural voice and new themes',
    changes: [
      'Desktop: raid briefing. As soon as the game loads a map, a card shows your quests there (the ones ticked on the Maps tab, else the ones you started in the game) and the keys and items they need, and the assistant reads it out ("Customs. Three quests here: … You need …"). Started quests are put on the Maps tab, which opens on that map. Ask the assistant "extracts?" during the raid and it answers for that map. The card closes when the raid ends. Settings → Maps turns the briefing or its voice off.',
      'Assistant: wake word. Turn on "Wake word" in the Voice panel and pick a name (Ranger, Atlas, Nova, Echo or Raven). Say "Hey Ranger", it answers "Yes sir?", then ask as many questions as you like; say "thanks, that\'s all" (or "stop listening", "goodbye") and it goes back to waiting. While waiting it only listens for its name, uses the speech model already on this PC and sends nothing anywhere; it works on every tab while the app is open, with a small strip at the bottom showing what it heard and its answer (the full chat is on the Neural network tab).',
      "Look and layout: nine new colour themes (Labs, Desert, Woods, Night vision, Thermal, Steel, Lighthouse, Cultist and the light Arctic). The sidebar is sorted into sections (Overview, Quests & story, Raid, Gear & hideout, Trading). Settings → General → Sidebar tabs can hide any tab or give it a colour.",
      'Assistant: a natural voice (Kitten TTS, made on this PC; a 57 MB download the first time). Pick Natural or Windows in the Voice panel, then a female or male voice. A sentence takes about a second to prepare on one CPU core; the Windows voices are still there if you want no download and almost no CPU.',
      'Assistant: listening no longer cuts you off. It waits until you have been quiet for about 2 seconds (up to 25 seconds in total), and it now knows item names, so "battery price" or "where can I find the dorm 303 key" work by voice. Spoken numbers like "three oh three" or "six hundred fifty" become 303 and 650.',
      'Assistant: item questions. "Where can I find X" shows its loose-loot spots on the map (most-spawning map first), traders that sell it, its flea price and the quests that need it; "price of X" gives flea and trader prices; "what is X for" lists quests and what a key opens. Items are found by their words, so "dorm 303 key" finds Dorm room 303 key.',
      "Assistant: it no longer keeps asking where you are. \"Closest quest\" uses the place you named last, tips asking for a place are shown but not read out, and Test voice says a neutral line.",
      'Assistant: Item Collection by voice or text. "Add 1 GPU", "collected 5 wires" or "picked up a gas analyser" first ask "Add 1 Graphics card to your Item Collection?" and go through when you say yes, approve or accept (no or cancel drops it; Undo afterwards); "used 2 wires" or "sold a LEDX" take them off the same way; "how many wires do I still need" lists what needs them. Understands plurals, British spellings, number words and nicknames like moonshine, bitcoin or lion.',
      "Weapon builder: the Modding view is one page now. Every slot of the gun is shown at once, grouped by the part it belongs to (the weapon's own slots first, each fitted part's slots right under it), so there is no more clicking into parts with Modify. The part picker opens at the side of the window.",
      "Weapon builder: plain, real pictures only. When your build matches no ready-made one exactly, you see the closest ready-made build's picture with what differs listed underneath (\"+ ARFX, − M4SS\"); the parts collage from 2.0.0 is gone. Gun previews in the list, saved builds and the builder header show the gun's default build instead of the bare receiver. The List view is gone too (the Modding view has every slot on one page).",
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-21',
    title: 'The assistant: routes, voice and actions',
    changes: [
      'Wiki pictures load reliably: the wiki\'s picture server is now asked the way it expects, and a picture that still fails retries by itself (then shows "Try again").',
      'New quests and game content are checked every 6 hours instead of every hour (Settings → Prices & game data). Trader restock times and the Goons\' map still stay up to date while those screens are open.',
      'Desktop: "Clean up after updates" removes old update installers, old map/scanner packs, crash reports and older installers in your Downloads folder (to the Recycle Bin). Also a "Clean up now" button in Settings.',
      "New tab: Neural network, an assistant that works offline and uses almost no resources, so it can run while you play. Say where you spawned and where you want to go (\"I spawned at Crossroads, how do I get to Dorms?\") and it draws a walking route around water, fences, rocks, minefields and buildings, says how far it is and which way to start, and can put the route on the Maps tab. It also finds the closest available quest, knows 280 place names and every extract, answers about quests, items, keys and your progress, offers to mark quests done, show them on the map or open a gun in the Weapon builder (each only when you click), and reads answers out loud (male or female voice, volume and speed).",
      'Voice input for the assistant: click the mic (or set a hotkey in Settings → Desktop app and press it in game) and ask your question out loud. Recognised on this PC with Vosk (the 42 MB speech model downloads the first time); it only listens for the words the app knows, which makes it accurate, and it frees its memory 3 minutes after the last question.',
      "Weapon builder: a modded gun no longer falls back to the bare receiver picture. When your build matches no ready-made preset, the picture is put together from the parts' own pictures (muzzle at the front, stock at the back, magazine and grip underneath, sights on top). It is approximate, but it looks like your gun.",
      'Weapon builder: when choosing a part, the list now starts with the best ones ("Best first": recoil reduction counts most, ergonomics half as much; ties go to the cheaper part). The other orders are still in the list.',
      'New page: Features & patches (this list).',
    ],
  },
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
