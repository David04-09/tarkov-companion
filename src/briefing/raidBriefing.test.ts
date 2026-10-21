import { describe, expect, it } from 'vitest'
import type { Task, TaskObjective } from '../api/types'
import type { MapTask } from '../maps/overlay/mapTasks'
import { buildBriefing, isRepeat, joinAnd } from './raidBriefing'

const obj = (o: Partial<TaskObjective>): TaskObjective =>
  ({ id: Math.random().toString(), type: 'visit', description: '', optional: false, maps: [], count: null, itemIds: [], questItem: null, foundInRaid: null, targetNames: [], locations: [], requiredKeys: [], exitName: null, build: null, markerItemId: null, usingWeaponIds: [], wearingIds: [], ...o }) as TaskObjective
const mt = (id: string, objectives: TaskObjective[] = [], keyIds: string[] = []): MapTask => ({
  task: { id, name: `Quest ${id}` } as Task,
  keyIds,
  placements: [],
  objectives: objectives.map((objective) => ({ objective, placements: [], anywhere: true, keyIds: [], keySource: null })),
})
const names: Record<string, string> = { k314: 'Dorm room 314 marked key', ms: 'MS2000 Marker', ak: 'AK-74N', paca: 'PACA' }
const map = { id: 'customs', name: 'Customs', normalizedName: 'customs' }
const base = {
  map,
  statuses: { a: 'available', b: 'available', c: 'completed', d: 'locked' } as const,
  itemName: (id: string) => names[id],
}

describe('buildBriefing', () => {
  it('uses ticked quests first, then started ones', () => {
    const mapTasks = [mt('a', [], ['k314']), mt('b', [obj({ type: 'mark', markerItemId: 'ms' })]), mt('c'), mt('d')]
    const ticked = buildBriefing({ ...base, mapTasks, tickedIds: new Set(['b', 'c']), startedIds: new Set(['a']) })
    expect(ticked.source).toBe('ticked')
    expect(ticked.quests.map((q) => q.id)).toEqual(['b'])
    expect(ticked.spoken).toBe('Customs. One quest here: Quest b. You need MS2000 Marker.')

    const started = buildBriefing({ ...base, mapTasks, tickedIds: new Set(), startedIds: new Set(['a', 'b', 'c']) })
    expect(started.source).toBe('started')
    expect(started.quests.map((q) => q.id)).toEqual(['a', 'b'])
    expect(started.spoken).toBe('Customs. Two quests here: Quest a and Quest b. You need Dorm room 314 marked key and MS2000 Marker.')
  })

  it('only counts available quests when none are ticked or started', () => {
    const b = buildBriefing({ ...base, mapTasks: [mt('a'), mt('b'), mt('c')], tickedIds: new Set(), startedIds: new Set() })
    expect(b.source).toBe('none')
    expect(b.quests).toEqual([])
    expect(b.bring).toEqual([])
    expect(b.spoken).toBe('Customs. None of your started quests are here. Two available quests have objectives on this map.')
    expect(buildBriefing({ ...base, mapTasks: [mt('c')], tickedIds: new Set(), startedIds: new Set() }).spoken).toBe('Customs. No open quests on this map.')
  })

  it('keeps gear and optional items on the card but does not read them out', () => {
    const b = buildBriefing({
      ...base,
      mapTasks: [mt('a', [obj({ type: 'shoot', usingWeaponIds: ['ak', 'aks'], wearingIds: [['paca']] }), obj({ type: 'mark', markerItemId: 'ms', optional: true })])],
      tickedIds: new Set(['a']),
      startedIds: new Set(),
    })
    expect(b.bringLabels).toEqual(['MS2000 Marker', 'PACA', 'AK-74N (or 1 other gun)'])
    expect(b.spoken).toBe('Customs. One quest here: Quest a.')
  })

  it('reads short item names out loud and shows full ones', () => {
    const b = buildBriefing({ ...base, mapTasks: [mt('a', [obj({ type: 'mark', markerItemId: 'ms' })], ['k314'])], tickedIds: new Set(['a']), startedIds: new Set(), itemShortName: (id) => ({ k314: '314', ms: 'MS2000' })[id] })
    expect(b.bringLabels).toEqual(['Dorm room 314 marked key', 'MS2000 Marker'])
    expect(b.spoken).toBe('Customs. One quest here: Quest a. You need Dorm room 314 marked key and MS2000.')
  })

  it('uses full names when two items share a short name', () => {
    const b = buildBriefing({ ...base, mapTasks: [mt('a', [obj({ type: 'plantItem', itemIds: ['ak'] }), obj({ type: 'plantItem', itemIds: ['paca'] }), obj({ type: 'mark', markerItemId: 'ms' })])], tickedIds: new Set(['a']), startedIds: new Set(), itemShortName: (id) => ({ ak: 'DVL', paca: 'DVL', ms: 'MS2000' })[id] })
    expect(b.spoken).toBe('Customs. One quest here: Quest a. You need AK-74N, PACA and MS2000.')
  })

  it('reads at most five quests', () => {
    const ids = ['a', 'b', 'e', 'f', 'g', 'h', 'i']
    const statuses = Object.fromEntries(ids.map((i) => [i, 'available' as const]))
    const b = buildBriefing({ ...base, statuses, mapTasks: ids.map((i) => mt(i)), tickedIds: new Set(ids), startedIds: new Set() })
    expect(b.spoken).toBe('Customs. Seven quests here: Quest a, Quest b, Quest e, Quest f, Quest g and two more.')
  })
})

describe('helpers', () => {
  it('joins with and', () => {
    expect(joinAnd(['a'])).toBe('a')
    expect(joinAnd(['a', 'b', 'c'])).toBe('a, b and c')
  })
  it('briefs once per map load', () => {
    expect(isRepeat(null, 'customs', 0, false)).toBe(false)
    expect(isRepeat({ mapKey: 'customs', at: 0 }, 'customs', 60_000, false)).toBe(true)
    expect(isRepeat({ mapKey: 'customs', at: 0 }, 'customs', 60_000, true)).toBe(false)
    expect(isRepeat({ mapKey: 'customs', at: 0 }, 'woods', 60_000, false)).toBe(false)
  })
})
