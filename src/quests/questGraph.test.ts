import { describe, expect, it } from 'vitest'
import {
  buildUnlocks,
  computeDepths,
  countCrossings,
  layeredLayout,
  requiredClosure,
  topoOrder,
  type GraphTask,
} from './questGraph'

const P = { id: 'prapor', name: 'Prapor' }
const T = { id: 'therapist', name: 'Therapist' }

function task(id: string, reqs: string[] = [], level = 1, trader = P, status = ['complete']): GraphTask {
  return {
    id,
    name: id.toUpperCase(),
    minPlayerLevel: level,
    trader,
    taskRequirements: reqs.map((taskId) => ({ taskId, status })),
  }
}

function byId(tasks: GraphTask[]): Record<string, GraphTask> {
  return Object.fromEntries(tasks.map((t) => [t.id, t]))
}

describe('computeDepths', () => {
  it('uses the longest path from a root', () => {
    // a -> b -> c, a -> c : c is at depth 2, not 1
    const tasks = byId([task('a'), task('b', ['a']), task('c', ['a', 'b'])])
    const d = computeDepths(Object.keys(tasks), (id) => tasks[id].taskRequirements.map((r) => r.taskId))
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(1)
    expect(d.get('c')).toBe(2)
  })

  it('ignores prerequisites outside the set', () => {
    const tasks = byId([task('b', ['outside']), task('c', ['b'])])
    const d = computeDepths(Object.keys(tasks), (id) => tasks[id].taskRequirements.map((r) => r.taskId))
    expect(d.get('b')).toBe(0)
    expect(d.get('c')).toBe(1)
  })

  it('terminates on cycles', () => {
    const tasks = byId([task('a', ['c']), task('b', ['a']), task('c', ['b']), task('self', ['self'])])
    const d = computeDepths(Object.keys(tasks), (id) => tasks[id].taskRequirements.map((r) => r.taskId))
    expect(d.size).toBe(4)
    for (const v of d.values()) expect(v).toBeGreaterThanOrEqual(0)
  })
})

describe('layeredLayout', () => {
  it('only keeps left-to-right edges and places every node once', () => {
    const tasks = byId([task('a', ['c']), task('b', ['a']), task('c', ['b']), task('d', ['c'])])
    const prereqs = (id: string) => tasks[id].taskRequirements.map((r) => r.taskId)
    const layout = layeredLayout(Object.keys(tasks), prereqs)
    expect(layout.layers.flat().sort()).toEqual(['a', 'b', 'c', 'd'])
    for (const e of layout.edges) {
      expect(layout.layerOf.get(e.from)!).toBeLessThan(layout.layerOf.get(e.to)!)
    }
  })

  it('removes avoidable crossings with barycentre sweeps', () => {
    // Two independent chains whose second layer starts in crossed order.
    const tasks = byId([task('a1'), task('b1'), task('b2', ['b1']), task('a2', ['a1'])])
    const prereqs = (id: string) => tasks[id].taskRequirements.map((r) => r.taskId)
    const unswept = layeredLayout(['a1', 'b1', 'b2', 'a2'], prereqs, 0)
    expect(countCrossings(unswept)).toBe(1)
    const swept = layeredLayout(['a1', 'b1', 'b2', 'a2'], prereqs)
    expect(countCrossings(swept)).toBe(0)
  })
})

describe('buildUnlocks', () => {
  it('lists dependents per task', () => {
    const u = buildUnlocks([task('a'), task('b', ['a']), task('c', ['a'])])
    expect(u.get('a')).toEqual(['b', 'c'])
    expect(u.get('b')).toBeUndefined()
  })
})

describe('requiredClosure + topoOrder', () => {
  const tasks = byId([
    task('start', [], 1),
    task('mid', ['start'], 5),
    task('other', [], 2, T),
    task('kappa', ['mid', 'other'], 10),
    task('activeOnly', [], 1),
    task('kappa2', ['activeOnly'], 3, P, ['active']),
    task('usecOnly', [], 1),
    task('kappa3', ['usecOnly'], 4),
  ])

  it('collects incomplete prerequisites transitively', () => {
    const c = requiredClosure(['kappa'], tasks, new Set(['start']))
    expect([...c].sort()).toEqual(['kappa', 'mid', 'other'])
  })

  it('ignores active-only requirements and excluded tasks', () => {
    const c = requiredClosure(['kappa2', 'kappa3'], tasks, new Set(), (t) => t.id !== 'usecOnly')
    expect([...c].sort()).toEqual(['kappa2', 'kappa3'])
  })

  it('orders prerequisites first, then by level', () => {
    const c = requiredClosure(['kappa'], tasks, new Set())
    const order = topoOrder(c, tasks)
    expect(order).toEqual(['start', 'other', 'mid', 'kappa'])
  })

  it('survives a cycle', () => {
    const cyc = byId([task('x', ['z'], 1), task('y', ['x'], 1), task('z', ['y'], 1), task('goal', ['z'], 2)])
    const c = requiredClosure(['goal'], cyc, new Set())
    expect(c.size).toBe(4)
    const order = topoOrder(c, cyc)
    expect(order).toHaveLength(4)
    expect(new Set(order).size).toBe(4)
    expect(order[3]).toBe('goal')
  })
})
