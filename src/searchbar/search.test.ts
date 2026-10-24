import { describe, expect, it } from 'vitest'
import type { HideoutStation, Item, Task, Trader } from '../api/types'
import type { MapOption } from '../maps/useMapOptions'
import { searchAll, type SearchSource } from './search'

const item = (id: string, name: string, shortName: string) => ({ id, name, shortName }) as unknown as Item
const items = [item('a', 'Graphics card', 'GPU'), item('b', 'Dorm room 314 marked key', 'Dorm 314'), item('c', 'Gas analyzer', 'GasAn')]

const src: SearchSource = {
  maps: [{ key: 'customs', id: 'm1', name: 'Customs' }, { key: 'the-lab', id: 'm2', name: 'The Lab' }, { key: 'night-factory', id: 'm3', name: 'Night Factory' }] as unknown as MapOption[],
  items,
  itemText: new Map(items.map((it) => [it.id, `${it.name}\n${it.shortName}`.toLowerCase()])),
  tasks: [{ id: 'q1', name: 'Shady Business' }, { id: 'q2', name: 'Gunsmith - Part 1' }] as unknown as Task[],
  traders: [{ id: 't1', name: 'Prapor' }, { id: 't2', name: 'Therapist' }] as unknown as Trader[],
  bosses: [{ key: 'bully', name: 'Reshala', portrait: null, maps: [{ mapId: 'm1', chance: 0.4 }] }],
  extracts: [{ name: "Smugglers' Boat", faction: 'pmc', mapId: 'm1', position: { x: 0, y: 0, z: 0 } }],
  mapNameById: new Map([['m1', 'Customs']]),
  stations: [{ id: 's1', name: 'Intelligence center' }] as unknown as HideoutStation[],
  story: [{ slug: 'tour', title: 'Tour' }],
  calibers: [{ id: 'Caliber545x39', label: '5.45x39 mm' }],
}

const kinds = (q: string) => searchAll(q, src).map((h) => h.kind + ':' + ('item' in h ? h.item.shortName : 'map' in h ? h.map.name : 'task' in h ? h.task.name : 'trader' in h ? h.trader.name : 'boss' in h ? h.boss.name : 'station' in h ? h.station.name : 'extract' in h ? h.extract.name : 'title' in h ? h.title : h.label))

it('finds a calibre only when a number is typed', () => {
  expect(kinds('5.45')).toEqual(['ammo:5.45x39 mm'])
  expect(kinds('5.45x39')).toEqual(['ammo:5.45x39 mm'])
  expect(kinds('mm')).toEqual([])
})

describe('searchAll', () => {
  it('needs two letters', () => {
    expect(searchAll('g', src)).toEqual([])
  })
  it('finds items by short name and words in any order', () => {
    expect(kinds('gpu')).toEqual(['item:GPU'])
    expect(kinds('314 dorm')).toEqual(['item:Dorm 314'])
  })
  it('finds maps by nickname, never Night Factory', () => {
    expect(kinds('labs')).toEqual(['map:The Lab'])
    expect(kinds('night')).toEqual([])
  })
  it('finds traders, bosses, extracts, stations and story chapters', () => {
    expect(kinds('prapor')).toEqual(['trader:Prapor'])
    expect(kinds('reshala')).toEqual(['boss:Reshala'])
    expect(kinds('smugglers')).toEqual(["extract:Smugglers' Boat"])
    expect(kinds('intel')).toEqual(['station:Intelligence center'])
    expect(kinds('tour')).toEqual(['story:Tour'])
  })
  it('opens pages from a few words, before everything else', () => {
    expect(kinds('kappa')[0]).toBe('special:Kappa path')
    expect(kinds('lk')).toEqual(['special:Lightkeeper path'])
    expect(kinds('restock')).toEqual(['special:Trader restocks'])
  })
  it('lists maps first, then items, then quests', () => {
    expect(kinds('cus')).toEqual(['map:Customs'])
    expect(kinds('gas')).toEqual(['item:GasAn'])
  })
})
