/**
 * Where players report the bosses, traced from the EFT Wiki's own map pictures (CC BY-SA).
 *
 * The game data (tarkov.dev) lists spawn points per boss zone, but many zones also contain points
 * far from where anyone meets the boss (Shturman's "Lumber Mill" has points at USEC camp and Scav
 * town; the Goons' "Weather Station" on Shoreline mostly sits in the village), and some zones list no
 * points at all (Reshala's Dorms, Sanitar's Pier, Zryachiy's island). So each wiki picture was fitted
 * to the game's coordinates with the extracts (and place names) it shows, whose game positions are
 * known, and the area it marks was converted. `fit` is that fit's average error in metres.
 * To redo or add one: scripts/boss-areas/ (fit.cjs + one spec per picture).
 * A few areas come from players instead (source 'player'): fights reported where no picture marks
 * the boss, drawn the same way but labelled as reports.
 */

export interface ReportedArea {
  /** tarkov.dev map normalizedName. */
  map: string
  /** Mob normalizedNames the area is for (the Goons are listed as knight). */
  bosses: string[]
  name: string
  /** Game x/z outline. */
  polygon: [number, number][]
  /**
   * The game data's zones this area stands for: their spawn chance goes here even when their listed
   * points lie elsewhere or are missing. Zones not named anywhere go to the areas their points are next to.
   */
  zones: string[]
  /** Wiki page the description comes from. */
  page: string
  /** wiki: traced from a wiki picture; player: where players report fighting the boss. */
  source: 'wiki' | 'player'
  /** The wiki picture the area was traced from, and when it was last uploaded (wiki areas). */
  picture?: string
  pictureFile?: string
  /** Upload date of the picture, or when players reported it (YYYY-MM-DD). */
  pictureDate: string
  /** Average error of the picture's fit in metres (wiki areas). */
  fit?: number
}

const WIKI_IMG = 'https://static.wikia.nocookie.net/escapefromtarkov_gamepedia/images/'

function circle(x: number, z: number, r: number, n = 12): [number, number][] {
  return Array.from({ length: n }, (_, i) => [Math.round(x + r * Math.cos((i / n) * 2 * Math.PI)), Math.round(z + r * Math.sin((i / n) * 2 * Math.PI))])
}


// Pictures: path under WIKI_IMG, file name, upload date.
const P = {
  customsGoons: ['d/da/CustomsGoonsMap.png', 'CustomsGoonsMap.png', '2026-07-06'],
  customsCultists: ['8/8b/CustomsCultistMap.png', 'CustomsCultistMap.png', '2026-08-31'],
  reshala: ['e/eb/Customs_Dealmaker_Haunt.png', 'Customs Dealmaker Haunt.png', '2023-11-14'],
  shorelineGoons: ['d/df/ShorelineGoonsMap.png', 'ShorelineGoonsMap.png', '2024-02-04'],
  sanitar: ['a/a1/Sanitar_Map.png', 'Sanitar Map.png', '2026-08-13'],
  shorelineCultists: ['2/28/ShorelineCultistMap.png', 'ShorelineCultistMap.png', '2024-02-04'],
  lighthouseGoons: ['0/0e/LighthouseGoonsMap.png', 'LighthouseGoonsMap.png', '2025-05-04'],
  rogues: ['6/6a/Rogues_Lighthouse_Map.png', 'Rogues Lighthouse Map.png', '2026-09-08'],
  zryachiy: ['2/29/ZryachiySpawnMap.png', 'ZryachiySpawnMap.png', '2024-05-14'],
  woods: ['2/2a/WoodsCultistMap.png', 'WoodsCultistMap.png', '2026-01-22'],
  killa: ['6/67/KillaSpawns.jpg', 'KillaSpawns.jpg', '2023-11-14'],
  kaban: ['7/7a/KabanSpawnsStreets.png', 'KabanSpawnsStreets.png', '2023-08-26'],
  kollontay: ['c/c0/KollontaySpawnsStreets.png', 'KollontaySpawnsStreets.png', '2024-06-29'],
} as const

function area(map: string, bosses: string[], name: string, polygon: [number, number][], page: string, pic: readonly [string, string, string], fit: number, zones: string[] = []): ReportedArea {
  return { map, bosses, name, polygon, zones, page, source: 'wiki', picture: WIKI_IMG + pic[0] + '/revision/latest', pictureFile: pic[1], pictureDate: pic[2], fit }
}

/** An area players report fighting the boss in, with no picture behind it. */
function report(map: string, bosses: string[], name: string, polygon: [number, number][], page: string, date: string): ReportedArea {
  return { map, bosses, name, polygon, zones: [], page, source: 'player', pictureDate: date }
}

export const REPORTED_AREAS: ReportedArea[] = [
  // Customs: RE3MR's 3D render (perspective), 29 reference points.
  area('customs', ['knight'], 'Scav base (Fortress), the lab and the north building of the industrial plant', [[298, -54], [294, -85], [240, -173], [188, -183], [147, -146], [66, -163], [43, -97], [257, -50]], 'Knight', P.customsGoons, 18, ['Stronghold']),
  // The app's owner fought the Goons here (2026-10-24), south-west of the area the wiki marks: the
  // squad roams between its spots. Placed from the owner's screenshot of the Customs map (±3 m).
  report('customs', ['knight'], 'South of the industrial plant, by Warehouse 4 (fights reported by players)', circle(309, -9, 75, 12), 'Knight', '2026-10-24'),
  area('customs', ['cultist-priest'], 'Scav base, industrial plant, boiler building and the yard by Warehouse 17', [[331, -5], [317, -105], [218, -201], [195, -200], [148, -153], [65, -170], [50, -130], [-4, -141], [-16, -82], [26, -68], [33, -92], [85, -74], [72, -33], [238, 10]], 'Cultists', P.customsCultists, 18, ['Stronghold']),
  area('customs', ['reshala'], 'Scav base (Fortress, the building with the mounted guns)', [[231, -169], [173, -166], [179, -76], [236, -80]], 'Reshala', P.reshala, 18, ['Stronghold']),
  area('customs', ['reshala'], 'New gas station', [[440, -8], [380, -4], [381, 58], [440, 53]], 'Reshala', P.reshala, 18, ['New Gas Station']),
  area('customs', ['reshala'], 'Dorms (both buildings and the yard between them)', [[241, 100], [153, 108], [159, 186], [245, 177]], 'Reshala', P.reshala, 18, ['Dorms']),
  // Shoreline: flat 2D maps, 12–14 reference points.
  area('shoreline', ['knight'], 'Weather station', [[-459, 231], [-531, 231], [-530, 287], [-459, 287]], 'Knight', P.shorelineGoons, 7, ['Weather Station']),
  area('shoreline', ['sanitar'], 'Cottages', [[188, 47], [77, 48], [78, 143], [189, 142]], 'Sanitar', P.sanitar, 10, ['Greenhouses']),
  // "Roaming to the blue fenced construction area" next to the cottages (Sanitar's Behavior section).
  area('shoreline', ['sanitar'], 'Fenced construction site next to the cottages (where he roams)', [[52, 96], [20, 107], [44, 162], [75, 147]], 'Sanitar', P.sanitar, 10),
  area('shoreline', ['sanitar'], 'Pier', [[-283, 501], [-309, 474], [-385, 540], [-358, 571]], 'Sanitar', P.sanitar, 10, ['Pier']),
  area('shoreline', ['cultist-priest'], 'Resort (west and east wings)', [[-135, -170], [-379, -171], [-378, -54], [-134, -54]], 'Cultists', P.shorelineCultists, 7, ['West Wing', 'East Wing']),
  area('shoreline', ['cultist-priest'], 'Northeast of the sunken village', circle(158, -287, 35), 'Cultists', P.shorelineCultists, 7, ['Northeast of Sunken Village']),
  // Lighthouse: Jindouz's 2D map (same frame in all three pictures), 12 reference points.
  area('lighthouse', ['knight'], 'Water treatment plant, north building', [[-31, -763], [-167, -764], [-168, -710], [-32, -709]], 'Knight', P.lighthouseGoons, 13),
  area('lighthouse', ['knight'], 'Chalet', [[-63, -145], [-152, -146], [-154, 9], [-65, 9]], 'Knight', P.lighthouseGoons, 13, ['Chalet']),
  area('lighthouse', ['rogue'], 'Chalets', [[-63, -145], [-169, -146], [-173, 163], [-67, 165]], 'Rogues', P.rogues, 13, ['Chalet']),
  area('lighthouse', ['rogue'], 'Water treatment plant (marked as a rogue area on the map)', [[68, -760], [-209, -763], [-214, -439], [63, -436]], 'Rogues', P.rogues, 13),
  area('lighthouse', ['zryachiy'], 'Lightkeeper island (the lighthouse peninsula)', [[285, 522], [305, 573], [355, 594], [405, 574], [426, 524], [406, 473], [357, 452], [307, 472]], 'Zryachiy', P.zryachiy, 13, ['Island']),
  // Woods: Jindouz's January 2026 map, 21 reference points.
  area('woods', ['knight'], 'Scav bunker (the antenna in the northwest)', circle(200, -730, 42, 8), 'Knight', P.woods, 8, ['Northwest Scav Bunker']),
  area('woods', ['shturman'], 'Sawmill', circle(16, -19, 65, 10), 'Shturman', P.woods, 8, ['Lumber Mill']),
  area('woods', ['cultist-priest'], 'Village in the north', [[-168, -715], [-156, -685], [-123, -663], [-78, -655], [-33, -663], [0, -685], [12, -715], [0, -746], [-33, -768], [-78, -776], [-123, -768], [-156, -746]], 'Cultists', P.woods, 8, ['Rundown Village']),
  area('woods', ['cultist-priest'], 'Clearing south of that village', circle(-144, -610, 31, 8), 'Cultists', P.woods, 8, ['Rundown Village']),
  area('woods', ['cultist-priest'], 'West of the sawmill', [[189, -76], [202, -44], [236, -20], [283, -12], [330, -20], [364, -44], [377, -76], [364, -108], [330, -132], [283, -140], [236, -132], [202, -108]], 'Cultists', P.woods, 8, ['West of Lumber Mill']),
  // Streets: Jindouz's 2D maps, 14–15 reference points each.
  area('streets-of-tarkov', ['kaban'], 'LexOs car dealership and its yard', [[110, 256], [31, 256], [32, 357], [111, 375]], 'Kaban', P.kaban, 8, ['Car Dealership']),
  area('streets-of-tarkov', ['kollontay'], 'Klimov shopping mall (second floor, around the food court)', [[-180, -32], [-174, -11], [-157, 1], [-137, 1], [-121, -11], [-115, -32], [-121, -52], [-138, -65], [-158, -65], [-174, -52]], 'Kollontay', P.kollontay, 8, ['Klimov Shopping Mall']),
  area('streets-of-tarkov', ['kollontay'], 'Ministry of the Interior academy', [[-248, 115], [-271, 115], [-270, 167], [-248, 167]], 'Kollontay', P.kollontay, 8, ['Ministry of the Interior Academy']),
  // Interchange: the wiki's mall floor plans, fitted to 20 shop names.
  area('interchange', ['killa'], 'IDEA', [[94, -264], [-44, -267], [-47, -182], [92, -179]], 'Killa', P.killa, 9, ['IDEA']),
  area('interchange', ['killa'], 'Centre stores (first and second floor)', [[97, -139], [-49, -143], [-55, 35], [92, 39]], 'Killa', P.killa, 9, ['Center']),
  area('interchange', ['killa'], 'Goshan (west side)', [[-51, -87], [-133, -89], [-136, -15], [-53, -13]], 'Killa', P.killa, 9, ['Goshan']),
  area('interchange', ['killa'], 'OLI', [[74, 63], [-45, 60], [-48, 161], [70, 164]], 'Killa', P.killa, 9, ['OLI']),
]

const AREA_MAP_ALIASES: Record<string, string> = { 'night-factory': 'factory', 'ground-zero-21': 'ground-zero' }

export function reportedAreasFor(mapKey: string, bossKey: string): ReportedArea[] {
  const map = AREA_MAP_ALIASES[mapKey] ?? mapKey
  return REPORTED_AREAS.filter((a) => a.map === map && a.bosses.includes(bossKey))
}

export function wikiPageUrl(page: string): string {
  return `https://escapefromtarkov.fandom.com/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`
}

/** Thumbnail address of a wiki picture (the wiki's own scaling). */
export function pictureThumb(a: ReportedArea, width = 480): string {
  return `${a.picture}/scale-to-width-down/${width}`
}

export function insidePolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Metres from a point to an area: 0 inside, else to the nearest edge. */
export function distanceToArea(x: number, z: number, poly: [number, number][]): number {
  if (insidePolygon(x, z, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j]
    const [bx, bz] = poly[i]
    const dx = bx - ax
    const dz = bz - az
    const len = dx * dx + dz * dz
    const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)))
  }
  return best
}

/** Area-weighted centre of an outline. */
export function areaCentre(poly: [number, number][]): { x: number; z: number } {
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
    a += f
    cx += (poly[j][0] + poly[i][0]) * f
    cz += (poly[j][1] + poly[i][1]) * f
  }
  if (Math.abs(a) < 1e-9) return { x: poly.reduce((s, p) => s + p[0], 0) / poly.length, z: poly.reduce((s, p) => s + p[1], 0) / poly.length }
  return { x: cx / (3 * a), z: cz / (3 * a) }
}
