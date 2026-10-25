/**
 * Map spots for quests only the EFT Wiki has (api/wikiQuests.ts), so they show on the maps like
 * the game data's own quests. Every spot comes from one of:
 * - the game data itself: a lock, switch, extract or BTR stop with that name, or the zone of a
 *   tarkov.dev quest at the same place (named in `how`);
 * - the wiki's own quest map picture, read off and converted with a fitted picture frame
 *   (scripts/quest-spots: specs/*.json hold the pixels, place.cjs prints these numbers; the fit
 *   error of that frame is in `how`).
 * `r` marks a spot that is only known to the building or area (drawn as a circle of r metres).
 * Transits and named extracts are found in the game data at runtime (see toWikiTask), not here.
 * Not placed (no reliable source): Container 14 on Interchange (the wiki only has an unscaled
 * garage plan) and the yellow bus underground on Ground Zero (only an underground sketch).
 */
export interface WikiSpot {
  x: number
  z: number
  y: number
  /** Only the building or area is known: a circle of this many metres. */
  r?: number
}

export interface WikiQuestSpots {
  /** Wiki page title. */
  quest: string
  /** Lower-case piece of the objective text it belongs to. */
  objective: string
  /** GameMap.normalizedName. */
  map: string
  /** Alternatives: any one of them (or "one of these" for spawns). */
  spots: WikiSpot[]
  /** Where the position comes from. */
  how: string
}

const LH = "the wiki's Lighthouse quest maps (Jindouz frame, fit 13 m)"
const SH = "the wiki's Shoreline quest maps (Jindouz frame, fit 7 m)"
const WD = "the wiki's Woods quest maps (Jindouz frame, fit 8 m)"
const ST = "the wiki's Streets quest maps (Jindouz frame, fit 8 m)"
const LAB = "the wiki's Lab floor plans (fitted to the game's room labels, 5 m)"
const BIO_TOILETS: WikiSpot = { x: -47, z: 380, y: 3 }
const MIXER: WikiSpot = { x: 203, z: 259, y: 3 }
const URAL: WikiSpot = { x: -183, z: 136, y: -50 }
const EXCAVATOR: WikiSpot = { x: -596, z: -204, y: -30 }
const GZ_TRUCK: WikiSpot = { x: 123, z: 70, y: 22 }
const PRAPOR_CAMP: WikiSpot = { x: -81, z: 460, y: 10 }
const LAKE_CABIN: WikiSpot = { x: -373, z: -628, y: 27 }
const TERRAGROUP_MAIN: WikiSpot = { x: -45, z: 20, y: 29, r: 30 }
const CASE_SPOTS: WikiSpot[] = [
  { x: -714, z: 96, y: -45 },
  { x: -510, z: 238, y: -48 },
  { x: -234, z: 188, y: -52 },
]
const SCOURGE: WikiSpot[] = [
  { x: -260, z: -340, y: 1 },
  { x: -169, z: -364, y: 1 },
]
const V3_DRIVE: WikiSpot[] = [
  { x: -137, z: 98, y: 37, r: 20 },
  { x: -66, z: 132, y: 28 },
]
const MARKED_ROOMS: Record<string, WikiSpot[]> = {
  customs: [{ x: 181, z: 184, y: 7 }],
  reserve: [
    { x: -158, z: 73, y: -8 },
    { x: 190, z: -225, y: -6 },
    { x: -120, z: 28, y: -13 },
  ],
  'streets-of-tarkov': [
    { x: -133, z: 273, y: 10 },
    { x: 186, z: 227, y: 1 },
  ],
}

export const WIKI_QUEST_SPOTS: WikiQuestSpots[] = [
  // Lighthouse
  { quest: 'Honest Review', objective: 'intersection at the village', map: 'lighthouse', spots: [{ x: -205, z: -240, y: 20 }], how: `BTR stop "Village Crossroads" on ${LH}` },
  { quest: 'Honest Review', objective: 'un checkpoint', map: 'lighthouse', spots: [{ x: -4, z: 128, y: 25 }], how: `BTR stop "UN Checkpoint" on ${LH}` },
  { quest: 'Honest Review', objective: 'parking between the two main buildings', map: 'lighthouse', spots: [{ x: -167, z: -748, y: 10 }], how: `BTR stop "WTP Building 2 Parking" on ${LH}` },
  { quest: 'Fog of War', objective: 'brdm', map: 'lighthouse', spots: [{ x: -70, z: -695, y: 10 }], how: LH },
  { quest: 'Fog of War', objective: 'guard tower', map: 'lighthouse', spots: [{ x: 14, z: -446, y: 5 }], how: LH },
  { quest: 'Fog of War', objective: 'from the roof', map: 'lighthouse', spots: [{ x: 36, z: -621, y: 30 }, { x: -100, z: -741, y: 30 }, { x: -191, z: -666, y: 30 }], how: `${LH}; within 5 m of the game's "Plant 1/2/3" labels` },
  { quest: 'All-Inclusive Support', objective: 'mountain lake cabin', map: 'lighthouse', spots: [LAKE_CABIN], how: `${LH}; 15 m from the Passage by the Lake extract` },
  { quest: 'Callsign Malachite', objective: "operative's personnel file", map: 'lighthouse', spots: [LAKE_CABIN], how: `${LH} (the cabin at Passage by the Lake)` },
  { quest: 'Ease the Move', objective: 'first rogue stash', map: 'lighthouse', spots: [{ x: -46, z: -379, y: 10 }, { x: -166, z: -378, y: 10 }, { x: -309, z: -216, y: 10 }], how: `${LH}; one of the three` },
  { quest: 'Ease the Move', objective: 'second rogue stash', map: 'lighthouse', spots: [{ x: -421, z: -277, y: 10 }, { x: -436, z: -329, y: 10 }], how: `${LH}; one of the two` },
  { quest: 'Ease the Move', objective: 'grotto', map: 'lighthouse', spots: [{ x: 174, z: -483, y: 2 }], how: LH },
  { quest: 'Number Temporarily Unavailable', objective: "prapor's new camp", map: 'lighthouse', spots: [PRAPOR_CAMP], how: LH },
  { quest: 'Make Amends - Security', objective: 'yellow bus', map: 'lighthouse', spots: [{ x: -17, z: -312, y: 5 }], how: "the wiki's Lighthouse v1.7 quest map (fitted to 10 extracts, 14 m)" },
  { quest: 'Make Amends - Security', objective: 'bulldozer', map: 'lighthouse', spots: [{ x: -191, z: -435, y: 5 }], how: "the wiki's Lighthouse v1.7 quest map (fitted to 10 extracts, 14 m)" },
  { quest: 'Make Amends - Security', objective: 'police truck', map: 'lighthouse', spots: [{ x: 76, z: -562, y: 5 }], how: "the wiki's Lighthouse v1.7 quest map (fitted to 10 extracts, 14 m)" },
  { quest: 'Make Amends - Security', objective: 'army truck', map: 'lighthouse', spots: [{ x: -68, z: -789, y: 10 }], how: "the wiki's Lighthouse v1.7 quest map (fitted to 10 extracts, 14 m)" },
  { quest: 'Make Amends', objective: 'v3 flash drive on lighthouse', map: 'lighthouse', spots: V3_DRIVE, how: `${LH}: the southern chalet, and the tennis court (zone of the game's Lost Contact / Bullshit quests)` },
  { quest: 'To the Light - Getting Acquainted', objective: 'v3 flash drive on lighthouse', map: 'lighthouse', spots: V3_DRIVE, how: `${LH}: the southern chalet, and the tennis court (zone of the game's Lost Contact / Bullshit quests)` },
  { quest: 'Make Amends', objective: 'lighthouse building', map: 'lighthouse', spots: [{ x: 445, z: 458, y: 33, r: 25 }], how: "the game's Lightkeeper switch in the lighthouse" },
  { quest: 'To the Light - Getting Acquainted', objective: 'lighthouse building', map: 'lighthouse', spots: [{ x: 445, z: 458, y: 33, r: 25 }], how: "the game's Lightkeeper switch in the lighthouse" },
  { quest: 'Scope the Clearing', objective: 'first wi-fi camera', map: 'lighthouse', spots: [{ x: 9, z: -891, y: 13 }, { x: 6, z: -851, y: 13 }], how: `${LH}; one of the two package piles` },
  { quest: 'Scope the Clearing', objective: 'second wi-fi camera', map: 'lighthouse', spots: [{ x: 9, z: -891, y: 13 }, { x: 6, z: -851, y: 13 }], how: `${LH}; one of the two package piles` },
  { quest: 'Scope the Clearing', objective: 'woods transit', map: 'lighthouse', spots: [{ x: 98, z: -934, y: 8 }], how: `${LH} (the overturned car by the transit)` },

  // Shoreline
  { quest: 'Cast the Net', objective: 'ural truck', map: 'shoreline', spots: [URAL], how: SH },
  { quest: 'Cast the Net', objective: 'excavator', map: 'shoreline', spots: [EXCAVATOR], how: SH },
  { quest: 'Reverse Gear', objective: 'ural truck', map: 'shoreline', spots: [URAL], how: SH },
  { quest: 'Reverse Gear', objective: 'excavator', map: 'shoreline', spots: [EXCAVATOR], how: SH },
  { quest: 'Stay Clear of Blast Zone', objective: 'west side fence', map: 'shoreline', spots: [{ x: -132, z: -93, y: -4 }], how: SH },
  { quest: 'Stay Clear of Blast Zone', objective: 'north side fence', map: 'shoreline', spots: [{ x: -132, z: -62, y: -4 }], how: SH },
  { quest: 'Stay Clear of Blast Zone', objective: 'east side fence', map: 'shoreline', spots: [{ x: -383, z: -91, y: -4 }], how: SH },
  { quest: 'Uninvited Guests - Part 1', objective: 'obtain the case with military equipment', map: 'shoreline', spots: CASE_SPOTS, how: `${SH}; one of the three` },
  { quest: 'Uninvited Guests - Part 1', objective: 'sordi tower', map: 'shoreline', spots: [CASE_SPOTS[0]], how: SH },
  { quest: 'Uninvited Guests - Part 1', objective: 'weather station', map: 'shoreline', spots: [CASE_SPOTS[1]], how: SH },
  { quest: 'Uninvited Guests - Part 1', objective: 'hydroelectric power station', map: 'shoreline', spots: [CASE_SPOTS[2]], how: SH },
  { quest: 'Uninvited Guests - Part 2', objective: 'case with military equipment', map: 'shoreline', spots: CASE_SPOTS, how: `${SH}; one of the three` },
  { quest: 'To the Light - Clip Their Wings', objective: 'health resort admin building', map: 'shoreline', spots: [{ x: -261, z: -138, y: 0, r: 20 }], how: `${SH} (west side of the 2nd floor)` },

  // Woods
  { quest: 'To the Light - Clip Their Wings', objective: 'weather station on the mountain', map: 'woods', spots: [{ x: -209, z: -280, y: 78 }], how: "zone of the game's Steady Signal quest (the wiki map agrees within 1 m)" },
  { quest: 'To the Light - Clip Their Wings', objective: 'sawmill guardhouse', map: 'woods', spots: [{ x: -28, z: 45, y: 0 }], how: WD },
  { quest: 'Break the Chain', objective: 'top of the mountain', map: 'woods', spots: [{ x: -172, z: -263, y: 80 }], how: WD },
  { quest: 'Break the Chain', objective: 'cell tower', map: 'woods', spots: [{ x: 228, z: -730, y: 21 }], how: `${WD} (the radio tower at the Scav Bunker extract)` },
  { quest: 'Historical Prospects', objective: 'abandoned village marked circle', map: 'woods', spots: [{ x: -130, z: -695, y: 10 }], how: WD },

  // Customs
  { quest: 'Break the Chain', objective: 'factory chimney', map: 'customs', spots: [{ x: 144, z: -59, y: 2 }], how: "the wiki's Customs quest maps (RE3MR frame, fit 18 m): the west chimney of the boiler building" },
  { quest: 'Break the Chain', objective: 'power line tower', map: 'customs', spots: [{ x: 404, z: 177, y: 4 }], how: "the wiki's Break the Chain map (RE3MR render fitted to 18 extracts, 12 m)" },
  { quest: 'To the Light - Clip Their Wings', objective: 'roadside construction site', map: 'customs', spots: [{ x: 223, z: -48, y: 6, r: 15 }], how: "the wiki's Customs quest map (RE3MR frame, fit 18 m)" },
  { quest: 'To the Light - False Call', objective: 'convenience store', map: 'customs', spots: [{ x: 12, z: 36, y: -1 }], how: "zone of the game's Thirsty - Delivery quest at that store (the wiki map agrees within 5 m)" },
  { quest: 'Historical Prospects', objective: 'marked room on customs', map: 'customs', spots: MARKED_ROOMS.customs, how: "the game's Dorm room 314 marked key lock" },
  { quest: 'To the Light - The Other Side', objective: 'marked room on customs', map: 'customs', spots: MARKED_ROOMS.customs, how: "the game's Dorm room 314 marked key lock" },

  // Reserve
  { quest: 'To the Light - The Other Side', objective: 'marked room on reserve', map: 'reserve', spots: MARKED_ROOMS.reserve, how: "the game's RB-BK, RB-VO and RB-PKPM marked key locks; any one" },

  // Streets of Tarkov
  { quest: 'To the Light - The Other Side', objective: 'marked room on streets', map: 'streets-of-tarkov', spots: MARKED_ROOMS['streets-of-tarkov'], how: "the game's Abandoned factory and Mysterious room marked key locks; either" },
  { quest: 'Cast the Net', objective: 'concrete mixer truck', map: 'streets-of-tarkov', spots: [MIXER], how: `${ST}; 11 m from the game's Collapsed Crane BTR stop` },
  { quest: 'Cast the Net', objective: 'bio toilet', map: 'streets-of-tarkov', spots: [BIO_TOILETS], how: ST },
  { quest: 'Reverse Gear', objective: 'concrete mixer truck', map: 'streets-of-tarkov', spots: [MIXER], how: `${ST}; 11 m from the game's Collapsed Crane BTR stop` },
  { quest: 'Reverse Gear', objective: 'bio toilet', map: 'streets-of-tarkov', spots: [BIO_TOILETS], how: ST },
  { quest: 'Final Stretch', objective: "fence's stash", map: 'streets-of-tarkov', spots: [{ x: -89, z: 240, y: 3 }], how: `${ST} (the vent chimney behind the diner)` },
  { quest: 'Historical Prospects', objective: 'nikitskaya st. 8', map: 'streets-of-tarkov', spots: [{ x: -151, z: 264, y: 12, r: 15 }], how: `${ST} (2nd floor apartment)` },
  { quest: 'In the Name of Humanity...', objective: 'pinewood hotel restaurant', map: 'streets-of-tarkov', spots: [{ x: -110, z: 116, y: 17, r: 20 }], how: `${ST} (3rd floor balcony)` },
  { quest: 'In the Name of Humanity...', objective: 'tram that collapsed', map: 'streets-of-tarkov', spots: [{ x: -247, z: 210, y: 0 }], how: `${ST}; 21 m from the Sewer River extract` },
  { quest: 'Side Hustle', objective: 'case or a box containing precursors', map: 'streets-of-tarkov', spots: [{ x: 34, z: 122, y: 3, r: 15 }], how: `${ST}: the post office (TerraGroup employee's package)` },

  // Interchange
  { quest: 'In the Name of Humanity...', objective: 'burger spot bathroom', map: 'interchange', spots: [{ x: -52, z: -125, y: 37 }], how: "the game's Saferoom Exfil unlock switch (the keycard panel)" },
  { quest: 'In the Name of Humanity...', objective: 'hidden terragroup saferoom', map: 'interchange', spots: [{ x: -48, z: 44, y: 23 }], how: "the game's Saferoom Exfil extract (its Object 14 lever is inside)" },

  // Ground Zero
  { quest: 'Cast the Net', objective: 'cargo truck', map: 'ground-zero', spots: [GZ_TRUCK], how: "the wiki's Ground Zero quest map (Xtycho, fitted to 7 extracts, 11 m)" },
  { quest: 'Reverse Gear', objective: 'cargo truck', map: 'ground-zero', spots: [GZ_TRUCK], how: "the wiki's Ground Zero quest map (Xtycho, fitted to 7 extracts, 11 m)" },
  { quest: 'Doxed', objective: 'ssd with delivery routes', map: 'ground-zero', spots: [TERRAGROUP_MAIN], how: "the TerraGroup main building (game label and the wiki's map; office no. 3, 2nd floor)" },
  { quest: 'Unanswered Calls', objective: 'reception desk', map: 'ground-zero', spots: [TERRAGROUP_MAIN], how: "the TerraGroup main building (game label and the wiki's map; 2nd floor reception)" },

  // The Lab
  { quest: 'To the Light - Trust but Verify', objective: 'server room', map: 'the-lab', spots: [{ x: -182, z: -327, y: 1 }], how: `${LAB}: the servers in the main working area, as the wiki guide marks it` },
  { quest: 'Make Amends - Quarantine', objective: 'quarantine zone', map: 'the-lab', spots: [{ x: -132, z: -358, y: 1 }], how: "zone of the game's Following the Bread Crumbs quest (the human experiment room the wiki says it really is)" },
  { quest: 'Information Trail', objective: 'intel from scourge', map: 'the-lab', spots: SCOURGE, how: `${LAB}: reception, or the orange dome in the main working area (matches the game's Scourge spawns there)` },
  { quest: 'Side Hustle', objective: "ref's gladiators", map: 'the-lab', spots: SCOURGE, how: `${LAB}: where Scourge and his guards are` },
  { quest: 'Side Hustle', objective: 'case or a box containing precursors', map: 'the-lab', spots: [{ x: -223, z: -357, y: 1 }, { x: -227, z: -328, y: 1 }], how: `${LAB}: the two TerraGroup employee's suitcase spawns` },
]
