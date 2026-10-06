import { describe, expect, it } from 'vitest'
import type { Task, TaskObjective } from '../../api/types'
import { buildBringList } from './bringList'
import type { MapTask } from './mapTasks'

const obj = (o: Partial<TaskObjective>): TaskObjective =>
  ({ id: Math.random().toString(), type: 'visit', description: '', optional: false, maps: [], count: null, itemIds: [], questItem: null, foundInRaid: null, targetNames: [], locations: [], requiredKeys: [], exitName: null, build: null, markerItemId: null, usingWeaponIds: [], wearingIds: [], ...o }) as TaskObjective
const mt = (name: string, objectives: TaskObjective[], keyIds: string[] = [], objKeys: string[] = []): MapTask => ({
  task: { id: name, name } as Task,
  keyIds,
  placements: [],
  objectives: objectives.map((objective) => ({ objective, placements: [], anywhere: true, keyIds: objKeys, keySource: null })),
})

describe('buildBringList', () => {
  it('adds up plant items and markers across quests, keeps keys and gear once', () => {
    const list = buildBringList([
      mt('A', [obj({ type: 'plantItem', itemIds: ['wd40'], count: 2 }), obj({ type: 'mark', markerItemId: 'ms2000' })], ['key1']),
      mt('B', [obj({ type: 'plantItem', itemIds: ['wd40'], count: 1 }), obj({ type: 'mark', markerItemId: 'ms2000' }), obj({ type: 'shoot', usingWeaponIds: ['ak', 'aks'], wearingIds: [['ushanka', 'scavVest'], ['paca']] })], [], ['key1']),
      mt('C', [obj({ type: 'plantQuestItem', questItem: { id: 'q', name: 'Motor controller', shortName: '', iconLink: null } })]),
    ])
    const byKind = Object.fromEntries(list.map((e) => [e.kind, e]))
    expect(list.map((e) => e.kind)).toEqual(['key', 'plant', 'marker', 'questItem', 'wear', 'weapon'])
    expect(byKind.key).toMatchObject({ itemIds: ['key1'], count: 1, quests: ['A', 'B'] })
    expect(byKind.plant).toMatchObject({ itemIds: ['wd40'], count: 3 })
    expect(byKind.marker).toMatchObject({ count: 2 })
    expect(byKind.questItem).toMatchObject({ questItemName: 'Motor controller' })
    expect(byKind.wear).toMatchObject({ itemIds: ['ushanka', 'scavVest'], otherOutfits: 1 })
    expect(byKind.weapon).toMatchObject({ itemIds: ['ak', 'aks'] })
  })
})
