import { describe, expect, it } from 'vitest'
import type { Task } from '../api/types'
import { parseChange, planAvailable, type ChangeContext } from './changes'

const task = (id: string, name: string, extra: Partial<Task> = {}): Task => ({ id, name, minPlayerLevel: 1, taskRequirements: [], ...extra }) as Task
const debut = task('debut', 'Debut')
const checking = task('check', 'Checking', { taskRequirements: [{ taskId: 'debut', status: ['complete'] }] })
const shootout = task('shoot', 'Shootout Picnic', { minPlayerLevel: 8, taskRequirements: [{ taskId: 'check', status: ['complete'] }, { taskId: 'other', status: ['active'] }] })
const ctx: ChangeContext = {
  quests: [debut, checking, shootout],
  stations: [
    { id: 'wb', name: 'Workbench', maxLevel: 3 },
    { id: 'lav', name: 'Lavatory', maxLevel: 3 },
    { id: 'ic', name: 'Intelligence Center', maxLevel: 3 },
  ],
  traders: [
    { id: 'prapor', name: 'Prapor', maxLevel: 4 },
    { id: 'ref', name: 'Ref', maxLevel: 4 },
  ],
  stationLevel: (id) => (id === 'lav' ? 1 : 0),
}

describe('changes asked for', () => {
  it('ticks, unticks, unlocks and shows quests', () => {
    expect(parseChange('mark debut done', ctx)).toMatchObject({ kind: 'questDone', task: { id: 'debut' }, done: true })
    expect(parseChange('i finished shootout picnic', ctx)).toMatchObject({ kind: 'questDone', task: { id: 'shoot' }, done: true })
    expect(parseChange('please untick checking', ctx)).toMatchObject({ kind: 'questDone', done: false })
    expect(parseChange('set shootout picnic to available', ctx)).toMatchObject({ kind: 'questAvailable', task: { id: 'shoot' } })
    expect(parseChange('shootout picnic should be unlocked', ctx)).toMatchObject({ kind: 'questAvailable' })
    expect(parseChange('zoom in on debut', ctx)).toMatchObject({ kind: 'zoomQuest', task: { id: 'debut' } })
    expect(parseChange('show checking on the map', ctx)).toMatchObject({ kind: 'zoomQuest' })
  })

  it('sets the player, the hideout and traders', () => {
    expect(parseChange("I'm level 30", ctx)).toEqual({ kind: 'playerLevel', level: 30 })
    expect(parseChange('set my level to 12', ctx)).toEqual({ kind: 'playerLevel', level: 12 })
    expect(parseChange("I'm bear", ctx)).toEqual({ kind: 'faction', faction: 'BEAR' })
    expect(parseChange('switch to pve', ctx)).toEqual({ kind: 'gameMode', mode: 'pve' })
    expect(parseChange('set the workbench to level 2', ctx)).toMatchObject({ kind: 'station', id: 'wb', level: 2 })
    expect(parseChange('intel level 1', ctx)).toMatchObject({ kind: 'station', id: 'ic', level: 1 })
    expect(parseChange('i upgraded the lavatory', ctx)).toMatchObject({ kind: 'station', id: 'lav', level: 2 })
    expect(parseChange('workbench level 9', ctx)).toMatchObject({ level: 3 })
    expect(parseChange('prapor is level 3', ctx)).toMatchObject({ kind: 'trader', id: 'prapor', level: 3 })
    expect(parseChange('undo that', ctx)).toEqual({ kind: 'undo' })
  })

  it('leaves questions alone', () => {
    for (const s of ['is debut available', 'what level do i need for shootout picnic', 'how do i do debut', 'where is the workbench', 'debut', 'what does prapor sell']) expect(parseChange(s, ctx), s).toBeNull()
  })

  it('knows what unlocks a quest', () => {
    const plan = planAvailable(shootout, ctx.quests, new Set(), 5)
    expect(plan.complete.map((t) => t.id)).toEqual(['debut', 'check'])
    expect(plan.level).toBe(8)
    expect(planAvailable(shootout, ctx.quests, new Set(['debut', 'check']), 10)).toEqual({ complete: [], level: null })
  })
})
