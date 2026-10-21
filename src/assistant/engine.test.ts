import { describe, expect, it } from 'vitest'
import type { GameData, GameMap, Item, Task } from '../api/types'
import type { MapTask } from '../maps/overlay/mapTasks'
import { answer, type AssistantContext } from './engine'
import { confirmWord } from './items'
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
    expect(r.text).toBe('Construction is on Shoreline. Here it is.')
    expect(answer('where is crackhouse on woods', ctx).text).toBe('There is no Crackhouse on Woods. It is on Customs.')
  })

  it('remembers the map of the last answer', () => {
    const r = answer('extracts', { ...ctx, lastMapId: 'm-woods' })
    expect(r.text).toBe('Woods has 1 PMC extract.')
    expect(r.lines).toEqual(['UN Roadblock'])
  })

  it('asks for the item list only when needed', () => {
    expect(answer('what is the ledx for', ctx).needsItems).toBe(true)
  })

  it('plans a route from where the player spawned to a place', () => {
    const withExtract = { ...ctx, data: { ...ctx.data, mapDetails: { ...ctx.data.mapDetails, 'm-customs': { extracts: [{ id: 'x1', name: 'ZB-1013', faction: 'pmc', position: { x: 10, y: 0, z: 20 }, outline: [] }], locks: [] } } } as unknown as GameData }
    const r = answer('I spawned at zb 013, how do I get to dorms?', withExtract)
    expect(r.text).toBe('From ZB-1013 to Dorms.')
    expect(r.walk).toEqual({ fromName: 'ZB-1013', toName: 'Dorms' })
    expect(r.map?.route).toEqual([{ x: 10, y: 0, z: 20 }, { x: 200, y: 0, z: 150 }])
    expect(r.youAt?.name).toBe('ZB-1013')
  })

  it('reads "to X from Y" too', () => {
    expect(answer('route to crackhouse from dorms', ctx).text).toBe('From Dorms to Crackhouse.')
  })

  it('remembers where the player is for the next route', () => {
    const here = answer("I'm at dorms, closest quest?", ctx).youAt ?? null
    const r = answer('how do I get to crackhouse', { ...ctx, lastPlace: here })
    expect(r.text).toBe('From Dorms to Crackhouse.')
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
    expect(add.confirm?.doneText).toContain('7 of 12 needed')
    expect(add.actions?.[0]).toMatchObject({ kind: 'setCollected', itemId: 'wires', count: 7 })
    expect(answer('i found two wire', c).confirm?.to).toBe(4)
    expect(answer('used 3 wires', c).confirm).toMatchObject({ itemId: 'wires', from: 2, to: 0 })
    expect(answer('picked up a gas analyser', c).confirm).toMatchObject({ itemId: 'gas', from: 0, to: 1 })
    expect(answer('how many wires do i still need', c).text).toContain('2 of 12 needed, 10 to go')
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
