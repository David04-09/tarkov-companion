import { describe, expect, it } from 'vitest'
import type { GameData, GameMap, Item, Task } from '../api/types'
import type { MapTask } from '../maps/overlay/mapTasks'
import { answer, type AssistantContext } from './engine'
import { confirmWord, itemQuestionKind } from './items'
import { placeEntries } from './places'
import { compassFromScreen, findNames, words } from './text'

const customs = { id: 'm-customs', name: 'Customs', normalizedName: 'customs' } as GameMap
const woods = { id: 'm-woods', name: 'Woods', normalizedName: 'woods' } as GameMap
const shoreline = { id: 'm-shore', name: 'Shoreline', normalizedName: 'shoreline' } as GameMap

function task(id: string, name: string, map: GameMap): Task {
  return { id, name, trader: { name: 'Prapor' }, map, minPlayerLevel: 0, objectives: [], taskRequirements: [], kappaRequired: false } as unknown as Task
}
const near = task('t-near', 'Near One', customs)
const far = task('t-far', 'Far One', customs)
const locked = task('t-locked', 'Locked One', customs)

const spot = (t: Task, x: number, z: number, description: string): MapTask =>
  ({ task: t, placements: [], keyIds: [], objectives: [{ objective: { description }, placements: [{ id: `${t.id}:0`, position: { x, y: 0, z }, outline: null, index: 0, total: 1, floor: null }], anywhere: false, keyIds: [], keySource: null }] }) as unknown as MapTask

const ctx: AssistantContext = {
  data: {
    maps: [customs, woods, shoreline],
    tasks: [near, far, locked],
    tasksById: {},
    mapDetails: { 'm-woods': { extracts: [{ id: 'e1', name: 'UN Roadblock', faction: 'pmc', position: { x: 1, y: 0, z: 1 }, outline: [] }], locks: [] } },
  } as unknown as GameData,
  statuses: { 't-near': 'available', 't-far': 'available', 't-locked': 'locked' },
  tasks: [near, far, locked],
  items: undefined,
  // Dorms on Customs is at x 200, z 150 in the label data.
  tasksOnMap: (m) => (m.id === 'm-customs' ? [spot(far, 600, 600, 'Far thing'), spot(near, 230, 150, 'Find the stash'), spot(locked, 201, 151, 'Locked thing')] : []),
  heading: () => 'east',
  lastMapId: null,
  lastPlace: null,
  playerLevel: 10,
}

describe('place names', () => {
  it('finds places however they are written', () => {
    const places = placeEntries()
    expect(findNames(words("I'm at the crack house"), places).map((h) => h.value.name)).toEqual(['Crackhouse'])
    expect(findNames(words('im at dorm'), places).map((h) => h.value.name)).toEqual(['Dorms'])
    expect(findNames(words('near big red'), places).map((h) => h.value.name)).toEqual(['Big Red'])
  })
})

describe('answer', () => {
  it('routes from a place to the closest available quest spot', () => {
    const r = answer("I'm at dorms, what's the next closest task?", ctx)
    expect(r.text).toContain('Near One')
    expect(r.text).toContain('about 30 metres east')
    expect(r.map?.route).toEqual([{ x: 200, y: 0, z: 150 }, { x: 230, y: 0, z: 150 }])
    expect(r.map?.points.map((p) => p.kind)).toEqual(['you', 'quest'])
    expect(r.mapId).toBe('m-customs')
  })

  it('asks which map when a place exists on several', () => {
    const r = answer('where is construction', ctx)
    expect(r.text).toMatch(/on .* and /)
    expect(r.map).toBeUndefined()
  })

  it('uses the map named in the question to settle it', () => {
    const r = answer('where is construction on shoreline', ctx)
    expect(r.text).toBe('Construction is on Shoreline. Here you go.')
    expect(answer('where is crackhouse on woods', ctx).text).toBe('There is no Crackhouse on Woods. It is on Customs.')
  })

  it('remembers the map of the last answer', () => {
    const r = answer('extracts', { ...ctx, lastMapId: 'm-woods' })
    expect(r.text).toBe('There is one PMC extract on Woods.')
    expect(r.lines).toEqual(['UN Roadblock'])
  })

  it('asks for the item list only when needed', () => {
    expect(answer('what is the ledx for', ctx).needsItems).toBe(true)
  })

  it('plans a route from where the player spawned to a place', () => {
    const withExtract = { ...ctx, data: { ...ctx.data, mapDetails: { ...ctx.data.mapDetails, 'm-customs': { extracts: [{ id: 'x1', name: 'ZB-1013', faction: 'pmc', position: { x: 10, y: 0, z: 20 }, outline: [] }], locks: [] } } } as unknown as GameData }
    const r = answer('I spawned at zb 013, how do I get to dorms?', withExtract)
    expect(r.text).toBe("Here's the way from ZB-1013 to Dorms.")
    expect(r.walk).toEqual({ fromName: 'ZB-1013', toName: 'Dorms' })
    expect(r.map?.route).toEqual([{ x: 10, y: 0, z: 20 }, { x: 200, y: 0, z: 150 }])
    expect(r.youAt?.name).toBe('ZB-1013')
  })

  it('reads "to X from Y" too', () => {
    expect(answer('route to crackhouse from dorms', ctx).text).toBe("Here's the way from Dorms to Crackhouse.")
  })

  it('remembers where the player is for the next route', () => {
    const here = answer("I'm at dorms, closest quest?", ctx).youAt ?? null
    const r = answer('how do I get to crackhouse', { ...ctx, lastPlace: here })
    expect(r.text).toBe("Here's the way from Dorms to Crackhouse.")
  })

  it('uses the last place named instead of asking again', () => {
    const here = answer("I'm at dorms, closest quest?", ctx).youAt ?? null
    const r = answer('next closest quest', { ...ctx, lastPlace: here })
    expect(r.text).toContain('Near One')
    // Without any place known it shows a quiet tip (not read out loud).
    expect(answer('next closest quest', ctx).quiet).toBe(true)
  })

  it('offers to mark a quest done, never does it by itself', () => {
    const r = answer('I finished Near One', ctx)
    expect(r.actions).toEqual([{ kind: 'complete', taskId: 't-near', done: true, label: 'Mark Near One done' }])
  })

  it('adds collected items to the Item Collection and can take them off again', () => {
    const wires = { id: 'wires', name: 'Bundle of wires', shortName: 'Wires', types: [], sellToTrader: [], buyFromTrader: [] } as unknown as Item
    const analyzer = { id: 'gas', name: 'Gas analyzer', shortName: 'GasAn', types: [], sellToTrader: [], buyFromTrader: [] } as unknown as Item
    const need = { itemId: 'wires', fir: 0, nonFir: 12, total: 12, sources: [], alternatives: [] }
    const c: AssistantContext = { ...ctx, items: { wires, gas: analyzer }, collected: { wires: 2 }, needFor: (id) => (id === 'wires' ? need : undefined) }
    const add = answer('collected 5 wires', c)
    // Asked first; the change waits for a yes.
    expect(add.text).toBe('Add 5 Bundle of wires to your Item Collection?')
    expect(add.confirm).toMatchObject({ itemId: 'wires', from: 2, to: 7 })
    expect(add.confirm?.doneText).toContain("You need 12 and you've got 7, so 5 to go.")
    expect(add.actions?.[0]).toMatchObject({ kind: 'setCollected', itemId: 'wires', count: 7 })
    expect(answer('i found two wire', c).confirm?.to).toBe(4)
    expect(answer('used 3 wires', c).confirm).toMatchObject({ itemId: 'wires', from: 2, to: 0 })
    expect(answer('picked up a gas analyser', c).confirm).toMatchObject({ itemId: 'gas', from: 0, to: 1 })
    expect(answer('how many wires do i still need', c).text).toContain("you need 12 and you've got 2, so 10 to go")
    // Asking where to find something is not collecting it.
    expect(answer('where can i find wires', c).confirm).toBeUndefined()
    expect(confirmWord('yes please')).toBe('yes')
    expect(confirmWord('Approve')).toBe('yes')
    expect(confirmWord('accept')).toBe('yes')
    expect(confirmWord('no, cancel')).toBe('no')
    expect(confirmWord('where is dorms')).toBeNull()
  })

  it('says when it did not understand', () => {
    expect(answer('banana pancakes', ctx).text).toBe('Sorry, I did not get that.')
  })
})

describe('compassFromScreen', () => {
  it('uses screen directions (y down)', () => {
    expect(compassFromScreen(0, -1)).toBe('north')
    expect(compassFromScreen(1, 0)).toBe('east')
    expect(compassFromScreen(-1, 1)).toBe('south-west')
  })
})

describe('asking for exactly what was said', () => {
  const part = (id: string, n: number) => task(id, `Signal - Part ${n}`, shoreline)
  const parts = { ...ctx, data: { ...ctx.data, tasks: [part('s3', 3), part('s4', 4)] } as unknown as GameData, tasks: [part('s3', 3), part('s4', 4)] }

  it('never swaps a quest part number, and says when the data has no such part', () => {
    expect(answer('signal part 3', parts).text).toContain("Signal - Part 3 is one of Prapor's")
    const r = answer('show signal part 1', parts)
    expect(r.text).toBe('There is no Signal - Part 1 in the game data, sir. It has Signal - Part 3 and Signal - Part 4.')
  })

  it('keeps shortened numbers ("zb 013" is ZB-1013) but not changed ones', () => {
    const places = placeEntries()
    expect(findNames(words('dorm room 314'), places).every((h) => !/303|302/.test(h.value.name))).toBe(true)
  })
})

describe('route planning', () => {
  const spawnsAt = (ps: [number, number][]) => ps.map(([x, z]) => ({ position: { x, y: 0, z }, sides: ['pmc'], categories: ['player'], zoneName: '' }))
  const plan = {
    ...ctx,
    data: {
      ...ctx.data,
      mapDetails: {
        'm-customs': {
          extracts: [{ id: 'x1', name: 'Crossroads', faction: 'pmc', position: { x: 700, y: 0, z: 650 }, outline: [] }, { id: 'x2', name: 'Far Exit', faction: 'pmc', position: { x: -900, y: 0, z: 0 }, outline: [] }],
          locks: [],
          // West = negative x on this test compass.
          spawns: spawnsAt([[-500, 100], [-400, 600], [500, 100]]),
        },
      },
    } as unknown as GameData,
    heading: (_m: GameMap, a: { x: number }, b: { x: number }) => (b.x < a.x ? 'west' : 'east'),
  } as AssistantContext

  it('starts from a side of the map: the PMC spawn there closest to the target', () => {
    const r = answer('path from the west side to dorms on customs', plan)
    expect(r.text).toBe("Here's the way from the west spawn to Dorms.")
    expect(r.map?.route?.[0]).toEqual({ x: -500, y: 0, z: 100 })
  })

  it('starts from the closest PMC spawn when no start is said', () => {
    const r = answer('draw me a path to dorms on customs', plan)
    expect(r.map?.route?.[0]).toEqual({ x: 500, y: 0, z: 100 })
    expect(r.lines?.some((l) => l.includes('closest to the first stop'))).toBe(true)
  })

  it('visits every objective of a quest in a short order, then extracts', () => {
    const twoStops = { ...plan, tasksOnMap: () => [{ ...spot(far, 600, 600, 'Far thing'), objectives: [...spot(far, 600, 600, 'Far thing').objectives, ...spot(far, 450, 120, 'Near thing').objectives] }] } as AssistantContext
    const r = answer('draw me the best path for far one from dorms then extract', twoStops)
    expect(r.text).toBe('Far One on Customs: 2 stops, then out at Crossroads, from Dorms.')
    expect(r.map?.points.map((p) => p.label)).toEqual(['You: Dorms', '1. Near thing', '2. Far thing', 'Crossroads (extract)'])
    expect(r.lines?.some((l) => l.includes('safest'))).toBe(true)
  })
})

describe('item questions', () => {
  it('answers the price when asked what something is worth', () => {
    expect(itemQuestionKind('what is the price to buy a gpu')).toBe('price')
    expect(itemQuestionKind('what is the value of a gpu')).toBe('price')
    expect(itemQuestionKind('where can i buy a gpu')).toBe('where')
    expect(itemQuestionKind('where does a gpu spawn and what is it worth')).toBe('where')
  })
})

describe('the map you are on', () => {
  it('settles a place that exists on several maps by the raid you are in', () => {
    const inRaid = { ...ctx, live: { currentMapId: 'm-shore' } } as unknown as AssistantContext
    expect(answer('where is construction', inRaid).text).toBe('Construction is on Shoreline. Here you go.')
    // A map named in the question still wins.
    expect(answer('where is construction on customs', inRaid).text).toMatch(/^There is no Construction on Customs/)
  })
})
