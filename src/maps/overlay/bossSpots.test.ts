import { describe, expect, it } from 'vitest'
import type { MapBoss } from '../../api/types'
import { distanceToArea, insidePolygon, reportedAreasFor } from './bossAreas'
import { buildSpots } from './bossSpots'

const pos = (x: number, z: number) => ({ x, y: 0, z })
const listing = (spawnChance: number, locations: { name: string; chance: number; positions: [number, number][] }[]): MapBoss => ({
  mobId: null,
  name: 'Boss',
  normalizedName: 'boss',
  spawnChance,
  locations: locations.map((l) => ({ ...l, positions: l.positions.map(([x, z]) => pos(x, z)) })),
  escorts: [],
  spawnTime: -1,
  spawnTimeRandom: false,
  trigger: null,
})

describe('reported areas', () => {
  it('measures inside and outside', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]]
    expect(insidePolygon(5, 5, square)).toBe(true)
    expect(insidePolygon(15, 5, square)).toBe(false)
    expect(distanceToArea(5, 5, square)).toBe(0)
    expect(distanceToArea(13, 14, square)).toBeCloseTo(5)
  })

  it('covers the bosses the data leaves without points', () => {
    expect(reportedAreasFor('customs', 'reshala').flatMap((a) => a.zones)).toEqual(['Stronghold', 'New Gas Station', 'Dorms'])
    expect(reportedAreasFor('shoreline', 'sanitar').some((a) => a.zones.includes('Pier'))).toBe(true)
    expect(reportedAreasFor('lighthouse', 'zryachiy')[0].zones).toEqual(['Island'])
    expect(reportedAreasFor('streets-of-tarkov', 'kaban')).toEqual([])
  })
})

describe('buildSpots', () => {
  it('splits Reshala over the Fortress, Dorms and New Gas by the zone chances', () => {
    // Customs data: Dorms and New Gas Station list no points, Stronghold lists five by the lab.
    const spots = buildSpots(
      [listing(0.75, [
        { name: 'Dorms', chance: 0.33, positions: [] },
        { name: 'New Gas Station', chance: 0.33, positions: [] },
        { name: 'Stronghold', chance: 0.33, positions: [[125, -146], [103, -115], [106, -114], [78, -108], [42, -144]] },
      ])],
      reportedAreasFor('customs', 'reshala'),
      'customs',
    )
    const reported = spots.filter((s) => s.kind === 'reported')
    expect(reported).toHaveLength(3)
    for (const s of reported) expect(s.share).toBeCloseTo(1 / 3, 2)
    const dorms = reported.find((s) => s.zones.includes('Dorms'))!
    expect(dorms.noPoints).toBe(true)
    expect(dorms.name).toMatch(/^Dorms/)
    // The Stronghold zone's points sit by the lab: one within reach of the Fortress, the rest unconfirmed.
    const fort = reported.find((s) => s.zones.includes('Stronghold'))!
    expect(fort.name).toMatch(/^Scav base/)
    expect(fort.points).toHaveLength(1)
    const data = spots.filter((s) => s.kind === 'data')
    expect(data.reduce((a, s) => a + s.points.length, 0)).toBe(4)
    expect(data.every((s) => s.share === 0)).toBe(true)
  })

  it('keeps the Goons at the Shoreline weather station and marks the village points as data only', () => {
    const spots = buildSpots(
      [listing(0.3, [{ name: 'Weather Station', chance: 1, positions: [[459, 56], [373, 76], [459, 159], [460, 92], [447, 235], [-582, 110], [328, 111], [-575, 129], [459, 182], [462, 120]] }])],
      reportedAreasFor('shoreline', 'knight'),
      'shoreline',
    )
    // The zone is named "Weather Station": its chance goes there although its points lie elsewhere.
    const weather = spots.find((s) => s.kind === 'reported')!
    expect(weather.name).toBe('Weather station')
    expect(weather.share).toBeCloseTo(1)
    expect(weather.noPoints).toBe(true)
    const data = spots.filter((s) => s.kind === 'data')
    expect(data.reduce((a, s) => a + s.points.length, 0)).toBe(10)
    expect(data.some((s) => s.name === 'Near Village')).toBe(true)
  })

  it('merges points next to one reported area into one spot', () => {
    // Shturman: two points by the sawmill, the rest elsewhere on Woods.
    const spots = buildSpots(
      [listing(0.75, [{ name: 'Lumber Mill', chance: 1, positions: [[-2, -75], [90, 10], [299, -566], [-273, -498]] }])],
      reportedAreasFor('woods', 'shturman'),
      'woods',
    )
    const sawmill = spots.filter((s) => s.kind === 'reported')
    expect(sawmill).toHaveLength(1)
    expect(sawmill[0].points).toHaveLength(2)
    expect(sawmill[0].share).toBeCloseTo(1)
    expect(spots.filter((s) => s.kind === 'data')).toHaveLength(2)
  })

  it('splits a zone no area names by the points next to each area', () => {
    // Lighthouse Rogues: "Rocks" lists points at the water treatment plant, the chalets and the island.
    const spots = buildSpots(
      [listing(1, [{ name: 'Rocks', chance: 1, positions: [[55, -633], [52, -590], [39, -593], [-69, 113], [372, 571]] }])],
      reportedAreasFor('lighthouse', 'rogue'),
      'lighthouse',
    )
    const by = (n: RegExp) => spots.find((s) => n.test(s.name))!
    expect(by(/^Water treatment/).share).toBeCloseTo(0.75)
    expect(by(/^Chalets/).share).toBeCloseTo(0.25)
    // The island point is near no Rogue area: unconfirmed, and it took no chance.
    expect(spots.find((s) => s.kind === 'data')!.share).toBe(0)
  })

  it('adds up points shared by several listings and leaves maps without areas as listed', () => {
    const spots = buildSpots(
      [listing(1, [{ name: 'Car Dealership', chance: 1, positions: [[86, 349], [78, 310]] }]), listing(0.5, [{ name: 'Car Dealership', chance: 1, positions: [[86, 349]] }])],
      [],
      'streets-of-tarkov',
    )
    expect(spots).toHaveLength(1)
    expect(spots[0].kind).toBe('listed')
    expect(spots[0].name).toBe('Car Dealership')
    expect(spots[0].points).toHaveLength(2)
    expect(spots[0].share).toBeCloseTo(1)
  })
})
