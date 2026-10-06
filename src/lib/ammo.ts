import type { AmmoStats, Item } from '../api/types'

/** An item that has ammo ballistics (see the items adapter in api/queries.ts). */
export type AmmoItem = Item & { ammo: AmmoStats }

export type CaliberGroup = 'Pistol and SMG' | 'Rifle' | 'Marksman and sniper' | 'Shotgun' | 'Grenade and special'

export const CALIBER_GROUPS: CaliberGroup[] = ['Pistol and SMG', 'Rifle', 'Marksman and sniper', 'Shotgun', 'Grenade and special']

interface CaliberInfo {
  label: string
  group: CaliberGroup
}

/** Game calibre ids → the names players use. Unknown ids fall back to `guessCaliberLabel`. */
const CALIBERS: Record<string, CaliberInfo> = {
  Caliber9x18PM: { label: '9x18 mm Makarov', group: 'Pistol and SMG' },
  Caliber9x19PARA: { label: '9x19 mm Parabellum', group: 'Pistol and SMG' },
  Caliber9x21: { label: '9x21 mm Gyurza', group: 'Pistol and SMG' },
  Caliber762x25TT: { label: '7.62x25 mm Tokarev', group: 'Pistol and SMG' },
  Caliber1143x23ACP: { label: '.45 ACP', group: 'Pistol and SMG' },
  Caliber9x33R: { label: '.357 Magnum', group: 'Pistol and SMG' },
  Caliber127x33: { label: '.50 Action Express', group: 'Pistol and SMG' },
  Caliber46x30: { label: '4.6x30 mm HK', group: 'Pistol and SMG' },
  Caliber57x28: { label: '5.7x28 mm FN', group: 'Pistol and SMG' },
  Caliber545x39: { label: '5.45x39 mm', group: 'Rifle' },
  Caliber556x45NATO: { label: '5.56x45 mm NATO', group: 'Rifle' },
  Caliber58x42: { label: '5.8x42 mm', group: 'Rifle' },
  Caliber762x39: { label: '7.62x39 mm', group: 'Rifle' },
  Caliber762x35: { label: '.300 Blackout', group: 'Rifle' },
  Caliber366TKM: { label: '.366 TKM', group: 'Rifle' },
  Caliber9x39: { label: '9x39 mm', group: 'Rifle' },
  Caliber68x51: { label: '6.8x51 mm', group: 'Rifle' },
  Caliber127x55: { label: '12.7x55 mm', group: 'Rifle' },
  Caliber762x51: { label: '7.62x51 mm NATO', group: 'Marksman and sniper' },
  Caliber784x49: { label: '.308 ME', group: 'Marksman and sniper' },
  Caliber762x54R: { label: '7.62x54 mm R', group: 'Marksman and sniper' },
  Caliber93x64: { label: '9.3x64 mm', group: 'Marksman and sniper' },
  Caliber86x70: { label: '.338 Lapua Magnum', group: 'Marksman and sniper' },
  Caliber127x99: { label: '.50 BMG', group: 'Marksman and sniper' },
  Caliber12g: { label: '12 gauge (12/70)', group: 'Shotgun' },
  Caliber20g: { label: '20 gauge (20/70)', group: 'Shotgun' },
  Caliber23x75: { label: '23x75 mm (KS-23)', group: 'Shotgun' },
  Caliber40x46: { label: '40x46 mm grenade', group: 'Grenade and special' },
  Caliber40mmRU: { label: '40 mm VOG-25 grenade', group: 'Grenade and special' },
  Caliber26x75: { label: '26x75 mm flare', group: 'Grenade and special' },
  Caliber20x1mm: { label: '20x1 mm disk', group: 'Grenade and special' },
}

/** "Caliber556x45" → "5.56x45 mm", "Caliber9x18" → "9x18 mm"; best effort for calibres added after this list. */
export function guessCaliberLabel(id: string): string {
  const body = id.replace(/^Caliber/, '')
  const m = /^(\d+)x(\d+)(.*)$/.exec(body)
  if (!m) return body || id
  const [, a, b, rest] = m
  // Diameters are written without the dot in the id: 556 = 5.56, 762 = 7.62, 127 = 12.7, 9 = 9.
  let dia = a
  if (a.length === 3) dia = a.startsWith('1') ? `${a.slice(0, 2)}.${a.slice(2)}` : `${a[0]}.${a.slice(1)}`
  else if (a.length === 2 && !a.startsWith('1') && !a.startsWith('2')) dia = `${a[0]}.${a[1]}`
  const suffix = rest.replace(/mm$/i, '').trim()
  return `${dia}x${b} mm${suffix ? ` ${suffix}` : ''}`
}

export function caliberLabel(id: string): string {
  return CALIBERS[id]?.label ?? guessCaliberLabel(id)
}

export function caliberGroup(id: string): CaliberGroup {
  return CALIBERS[id]?.group ?? 'Grenade and special'
}

/** Calibres present in the data, grouped for a select and sorted by name within each group. */
export function groupCalibers(ids: Iterable<string>): { group: CaliberGroup; calibers: { id: string; label: string }[] }[] {
  const unique = [...new Set(ids)]
  return CALIBER_GROUPS.map((group) => ({
    group,
    calibers: unique
      .filter((id) => caliberGroup(id) === group)
      .map((id) => ({ id, label: caliberLabel(id) }))
      .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true })),
  })).filter((g) => g.calibers.length > 0)
}

// ---------------------------------------------------------------------------
// Armour effectiveness
// ---------------------------------------------------------------------------

export type ArmorVerdict = 'good' | 'partial' | 'poor'

/**
 * Community rule of thumb, NOT the game's exact formula: a round goes through
 * armour of class N reliably when its penetration is at least 10·N, has a
 * real but unreliable chance when it is up to 10 below that, and mostly fails
 * below. The real outcome also depends on armour durability, material and
 * the round's penetration chance, so the UI calls this approximate.
 */
export function armorVerdict(penetration: number, armorClass: number): ArmorVerdict {
  const needed = armorClass * 10
  if (penetration >= needed) return 'good'
  if (penetration >= needed - 10) return 'partial'
  return 'poor'
}

/** Highest armour class (0..6) this round handles well under the rule above. */
export function bestArmorClass(penetration: number): number {
  return Math.max(0, Math.min(6, Math.floor(penetration / 10)))
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type AmmoSortKey =
  | 'name'
  | 'caliber'
  | 'damage'
  | 'penetration'
  | 'armorDamage'
  | 'fragmentation'
  | 'speed'
  | 'recoil'
  | 'accuracy'
  | 'price'

/** Total damage of one shot (pellets × damage per pellet). */
export function shotDamage(a: AmmoStats): number {
  return a.damage * a.projectileCount
}

function sortValue(row: { item: AmmoItem; price: number | null }, key: AmmoSortKey): number | string | null {
  const a = row.item.ammo
  switch (key) {
    case 'name': return row.item.name
    case 'caliber': return caliberLabel(a.caliber)
    case 'damage': return shotDamage(a)
    case 'penetration': return a.penetrationPower
    case 'armorDamage': return a.armorDamage
    case 'fragmentation': return a.fragmentationChance
    case 'speed': return a.initialSpeed
    case 'recoil': return a.recoilModifier
    case 'accuracy': return a.accuracyModifier
    case 'price': return row.price
  }
}

/**
 * Sorts rows by a column. Missing values (no price) always go last; ties fall
 * back to calibre then name so the order is stable.
 */
export function sortAmmo<T extends { item: AmmoItem; price: number | null }>(rows: T[], key: AmmoSortKey, dir: 'asc' | 'desc'): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((x, y) => {
    const vx = sortValue(x, key)
    const vy = sortValue(y, key)
    if (vx == null && vy != null) return 1
    if (vy == null && vx != null) return -1
    let c = 0
    if (typeof vx === 'string' && typeof vy === 'string') c = vx.localeCompare(vy, undefined, { numeric: true })
    else if (typeof vx === 'number' && typeof vy === 'number') c = vx - vy
    if (c !== 0) return c * sign
    return (
      caliberLabel(x.item.ammo.caliber).localeCompare(caliberLabel(y.item.ammo.caliber)) ||
      x.item.name.localeCompare(y.item.name)
    )
  })
}

/** "+5 %", "-10 %", "0" for a fractional modifier. */
export function formatModifier(fraction: number): string {
  const pct = Math.round(fraction * 100)
  if (pct === 0) return '0'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`
}
