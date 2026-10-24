/**
 * How each boss behaves, in short plain sentences written for this app from the EFT Wiki's
 * "Behavior" and "Location" sections (CC BY-SA; the page is linked wherever this is shown). Nothing
 * here is from the game data: it is what players have seen. Keys are the mob normalizedNames.
 */
export interface BossInfo {
  /** Who is in the group, when it is more than one named AI. */
  members?: string
  behaviour: string[]
  /** EFT Wiki page title. */
  page: string
}

export const BOSS_INFO: Record<string, BossInfo> = {
  knight: {
    members: 'Knight (leader), Big Pipe (grenadier) and Birdeye (marksman)',
    behaviour: [
      'When any of them spots you, Knight and Big Pipe rush you together.',
      'Birdeye hangs back and only pushes if the other two go down; his footsteps are quieter.',
      'They move to another map every 3.5 to 5 hours; "last reported" says where players saw them.',
      'They wander between their spots on a map, so expect them outside the marked areas too.',
    ],
    page: 'The Goons',
  },
  reshala: {
    behaviour: [
      'Keeps to the back of the fight, out of sight, with 2 to 4 guards around him.',
      'Wears no body armour.',
      'When attacked he and one or two guards run for cover; the other guards fight where they stand.',
      'Low-karma player scavs can be shot for getting close; guards sometimes warn first.',
    ],
    page: 'Reshala',
  },
  killa: {
    behaviour: [
      'Suppresses with a machine gun or automatic rifle while moving from cover to cover, then pushes.',
      'Moves in a zig-zag and throws smoke and frag grenades.',
      'Chases a target far outside his usual area: run a long way to shake him.',
    ],
    page: 'Killa',
  },
  shturman: {
    behaviour: [
      'He and his guards hold the sawmill and fight at long range from cover or camouflage.',
      'One guard may flank or rush you while the others keep you pinned down.',
      'Fires 3 to 5 warning shots at far-off targets before he commits.',
      'With both guards dead he tends to hide in the wooden barracks.',
    ],
    page: 'Shturman',
  },
  sanitar: {
    behaviour: [
      'Fights with his guards and nearby scavs, but often breaks off to heal or inject stims, so fights drag on.',
      'At least one guard stays next to him; another scouts the area around.',
      'At the cottages they roam the whole area, including the fenced construction site next to them.',
      'Drops medical items and other things from his bag as he walks.',
    ],
    page: 'Sanitar',
  },
  glukhar: {
    behaviour: [
      'Has up to six guards (assault, security, scout, sniper) who follow him; one or two patrol farther out.',
      'Very accurate, with a hard-hitting rifle and a tough chest: aim for the head.',
      'Fight him in corridors and rooms, not in the open or through windows.',
      'If he dies, the guards left defend his body, then wander their area.',
    ],
    page: 'Glukhar',
  },
  tagilla: {
    behaviour: [
      'Charges you with a sledgehammer; where he cannot reach you, he switches to his shotgun.',
      'Active from the start of the raid; sets ambushes, suppresses and breaches doors.',
    ],
    page: 'Tagilla',
  },
  'shadow-of-tagilla': {
    behaviour: ['Like Tagilla, with an axe: he charges you, and uses a gun when you are far away.'],
    page: 'Shadow of Tagilla',
  },
  kaban: {
    behaviour: [
      'LexOs is defended by snipers on the dealership and garage roofs, guards patrolling the yard, and mounted grenade launchers and machine guns at the entrances.',
      'A guard mans the mounted gun nearest to the side you attack from.',
      'Kaban stays inside the dealership or the garage, often with Gus and Basmach, and moves upstairs or into the yard when fighting.',
      'The compound is full of claymore mines.',
    ],
    page: 'Kaban',
  },
  kollontay: {
    behaviour: [
      'With his police baton out he jams the guns of players near him, then charges, even around corners.',
      'At the police academy he stays indoors and watches the windows on both sides; his guards push hard with heavy weapons.',
      'At Klimov mall he and his guards spread over the second floor, mostly around the food court, sometimes by the escalators and main stairs.',
    ],
    page: 'Kollontay',
  },
  zryachiy: {
    behaviour: [
      'He and his guards open fire when one of them is hit, or when you step onto the bridge.',
      'Very accurate and hard to spot on the rocks: he sits near the rock closest to the lighthouse, his guards on opposite sides of the island.',
      'His guards come back up to three times while he lives, and only target whoever last hurt them.',
    ],
    page: 'Zryachiy',
  },
  partisan: {
    behaviour: [
      'Can turn up anywhere on Customs, Woods, Shoreline and Lighthouse.',
      'Sneaks around, sets tripwires in advance and lures players into them; uses grenades and follows a target for a long time.',
      'In PvP he goes after low-karma PMCs (and low-karma scavs).',
    ],
    page: 'Partisan',
  },
  rogue: {
    behaviour: [
      'Patrol in groups of 2 to 3; very accurate full-auto fire, push under suppression, use flashbangs and frag grenades.',
      'Leave player scavs alone unless shot at or crowded; once provoked, every player scav is an enemy for the rest of the raid.',
    ],
    page: 'Rogues',
  },
  raider: {
    behaviour: [
      'Squads of 2 to 4 that flank, rush and pin you down; much tougher than normal scavs.',
      'Reserve: in the underground command area at the start, more after the D-2 power switch, and at the train yard when the train arrives or the bunker door lever is pulled.',
      'Labs: everywhere, and more head to any extract switch someone pulls.',
      'Neutral to scavs at first but shout warnings; once a scav provokes one, they turn on all scavs.',
    ],
    page: 'Scav Raiders',
  },
  'cultist-priest': {
    members: 'a priest with 2 to 4 warriors',
    behaviour: [
      'Only out between 22:00 and 07:00 in-game time.',
      'Lie prone in bushes and tall grass to ambush; warriors jump up and run in to stab you. Their poisoned knife causes the Unknown toxin (cure: xTG-12 or Perfotoran).',
      'Almost no thermal signature, suppressed weapons, and they stay in cover once the fight starts.',
      'The priest runs for cover while warriors live; alone and cornered, he drops a grenade at his own feet.',
      'They ignore scavs and bosses unless hurt by them.',
    ],
    page: 'Cultists',
  },
  scourge: {
    behaviour: ['Found at the reception on the first level, or near the orange dome in the main work area (first level).'],
    page: 'Scourge',
  },
}

/**
 * Notes for one boss on one map ('*' = every map): where the wiki and the game data disagree, or a
 * place no picture marks.
 */
const TERMINAL = 'Terminal: one of five bosses (Killa, Glukhar, Reshala, Sanitar or Tagilla) late in the raid, in the medium container-ship berths (EFT Wiki); the game data lists no exact points.'

export const BOSS_MAP_NOTES: Record<string, Record<string, string>> = {
  glukhar: {
    '*': "The EFT Wiki's Glukhar page still lists Reserve. The current game data has him only on Lighthouse (water treatment plant), in PvP and PvE alike.",
    terminal: TERMINAL,
  },
  tagilla: {
    interchange: "The EFT Wiki puts Tagilla in the parking garage under Goshan; the game data's points are on the mall's first and second floors.",
    factory: 'Factory is small: expect him anywhere.',
    'night-factory': 'Factory is small: expect him anywhere.',
    terminal: TERMINAL,
  },
  killa: { terminal: TERMINAL },
  reshala: { terminal: TERMINAL },
  sanitar: { terminal: TERMINAL },
  'cultist-priest': { 'ground-zero-21': 'Ground Zero 21+: expect them anywhere.', 'night-factory': 'Night Factory is small: expect them anywhere.' },
  partisan: { '*': 'No fixed spot: he roams the whole map.' },
}

export function bossNote(key: string, mapKey: string): string | undefined {
  const notes = BOSS_MAP_NOTES[key]
  return notes?.[mapKey] ?? notes?.['*']
}
