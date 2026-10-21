import { describe, expect, it } from 'vitest'
import type { GameData, GameMap, Task } from '../api/types'
import type { MapTask } from '../maps/overlay/mapTasks'
import { answer, type AssistantContext } from './engine'
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
