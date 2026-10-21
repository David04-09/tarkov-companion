import { describe, expect, it } from 'vitest'
import { buildSoundNames, snapToNames, soundKey } from './phonetic'

const names = buildSoundNames(['Poxeram cocktail injector', 'Poxeram', 'Tetriz', 'Salewa', 'Graphics card', 'GPU', 'LEDX', 'Golden Star balm', 'Golden', 'Ibuprofen', 'Morphine', 'Customs', 'Crackhouse', 'Gas analyzer', 'Water', 'Bolts', 'Kollontay', 'Reshala', 'Shturman', 'Dorm room 314 marked key'])

describe('sound keys', () => {
  it('sounds alike when written differently', () => {
    expect(soundKey('pox a ram')).toBe(soundKey('poxeram'))
    expect(soundKey('salewa')).toBe(soundKey('sally wa'))
    expect(soundKey('reshalla')).toBe(soundKey('reshala'))
  })
})

describe('snapToNames', () => {
  it('puts the game name in place of what the speech model wrote', () => {
    expect(snapToNames('Where can I find pox a ram?', names).text).toBe('where can i find poxeram')
    expect(snapToNames('price of a poxy ram', names).text).toBe('price of a poxeram')
    expect(snapToNames('where does reshalla spawn', names).text).toBe('where does reshala spawn')
    expect(snapToNames('how much is sally wah worth', names).text).toBe('how much is salewa worth')
    expect(snapToNames('where is collin tie', names).text).toBe('where is kollontay')
    expect(snapToNames('price of annuljan', buildSoundNames(['Analgin painkillers', 'Analgin']))).toMatchObject({ text: 'price of analgin' })
    expect(snapToNames('price of a propitle', buildSoundNames(['Propital']))).toMatchObject({ text: 'price of a propital' })
    expect(snapToNames('how much is vaseline bomb', buildSoundNames(['Vaseline balm']))).toMatchObject({ text: 'how much is vaseline balm' })
  })

  it('leaves ordinary questions and exact names alone', () => {
    expect(snapToNames('how much is a gpu worth', names).fixed).toEqual([])
    expect(snapToNames('where can i find water', names).fixed).toEqual([])
    expect(snapToNames('what should i play tonight', names).fixed).toEqual([])
    expect(snapToNames('where is the closest extract', names).fixed).toEqual([])
    expect(snapToNames('extracts on customs', names).fixed).toEqual([])
  })
})
