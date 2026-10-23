import { describe, expect, it } from 'vitest'
import { commandWords, parseCommand, type CommandContext } from './commands'

const items = [
  { id: 'k314', name: 'Dorm room 314 marked key', key: true },
  { id: 'gpu', name: 'Graphics card', short: 'gpu', key: false },
  { id: 'ledx', name: 'LEDX Skin Transilluminator', short: 'ledx', key: false },
]
const ctx: CommandContext = {
  tabs: [
    { path: '/', label: 'Dashboard' },
    { path: '/quests', label: 'Quests' },
    { path: '/maps', label: 'Maps' },
    { path: '/keys', label: 'Keys' },
    { path: '/flea', label: 'Flea Market' },
    { path: '/items', label: 'Item Collection' },
    { path: '/hideout', label: 'Hideout' },
  ],
  maps: [
    { name: 'Customs', normalizedName: 'customs' },
    { name: 'Streets of Tarkov', normalizedName: 'streets-of-tarkov' },
    { name: 'The Lab', normalizedName: 'the-lab' },
  ],
  quests: [
    { id: 'debut', name: 'Debut' },
    { id: 'gs1', name: 'Gunsmith - Part 1' },
  ],
  findItem: (said, keysOnly) => {
    const s = said.join(' ')
    const hit = items.find((it) => (!keysOnly || it.key) && (it.short === s || said.every((w) => it.name.toLowerCase().includes(w))))
    return hit ? { id: hit.id, name: hit.name } : null
  },
}

describe('voice commands', () => {
  it('opens tabs by name, alone or with a verb', () => {
    expect(parseCommand('Maps', ctx)?.to).toBe('/maps')
    expect(parseCommand('flea market', ctx)?.to).toBe('/flea')
    expect(parseCommand('open the flea market please', ctx)?.to).toBe('/flea')
    expect(parseCommand('go to quests', ctx)?.to).toBe('/quests')
    expect(parseCommand('take me to the hideout', ctx)?.to).toBe('/hideout')
    expect(parseCommand('show me the map', ctx)?.to).toBe('/maps')
    expect(parseCommand('home', ctx)?.to).toBe('/')
    expect(parseCommand('go back', ctx)?.to).toBe('back')
  })

  it('opens a map', () => {
    expect(parseCommand('customs', ctx)).toMatchObject({ to: '/maps', mapKey: 'customs' })
    expect(parseCommand('open the streets map', ctx)).toMatchObject({ to: '/maps', mapKey: 'streets-of-tarkov' })
    expect(parseCommand('labs', ctx)).toMatchObject({ mapKey: 'the-lab' })
  })

  it('opens a quest, a key, an item on the flea', () => {
    expect(parseCommand('show quest debut', ctx)).toMatchObject({ to: '/quests', params: { q: 'Debut' } })
    expect(parseCommand('open gunsmith part 1', ctx)).toMatchObject({ to: '/quests', params: { q: 'Gunsmith - Part 1' } })
    expect(parseCommand('debut quest', ctx)).toMatchObject({ to: '/quests' })
    expect(parseCommand('show key dorm 314', ctx)).toMatchObject({ to: '/keys', params: { key: 'k314' } })
    expect(parseCommand('search gpu on the flea', ctx)).toMatchObject({ to: '/flea', flea: 'Graphics card' })
    expect(parseCommand('flea market ledx', ctx)).toMatchObject({ to: '/flea', flea: 'LEDX Skin Transilluminator' })
    expect(parseCommand('ledx in my collection', ctx)).toMatchObject({ to: '/items', params: { q: 'LEDX Skin Transilluminator' } })
  })

  it('ignores questions and chatter', () => {
    for (const s of ['which maps do you like', 'extracts on customs', 'how much is a gpu', 'show me the extracts on customs', 'customs is so annoying', 'debut', 'push left', 'dorms marked key', 'where can i find the gpu']) expect(parseCommand(s, ctx), s).toBeNull()
  })

  it('lists the words the always-on recogniser needs', () => {
    const w = commandWords(ctx)
    for (const x of ['open', 'maps', 'flea', 'market', 'customs', 'streets', 'labs', 'quest']) expect(w).toContain(x)
  })
})
