import { describe, expect, it } from 'vitest'
import { followUp } from './followUp'

const ledx = { masked: 'price of the item', slots: { item: 'LEDX Skin Transilluminator' } }
const customsExtracts = { masked: 'extracts on map', slots: { map: 'Customs' } }

describe('follow-up questions', () => {
  it('knows what "it" is', () => {
    expect(followUp('how much is it worth', { masked: 'how much is it worth', slots: {} }, ledx)).toBe('how much is LEDX Skin Transilluminator worth')
    expect(followUp('and where can I find it', { masked: 'and where can i find it', slots: {} }, ledx)).toBe('where can i find LEDX Skin Transilluminator')
  })

  it('asks the last question again with the new name', () => {
    expect(followUp('and on Woods?', { masked: 'and on map', slots: { map: 'Woods' } }, customsExtracts)).toBe('extracts on Woods')
    expect(followUp('what about the GPU', { masked: 'what about the item', slots: { item: 'Graphics card' } }, ledx)).toBe('price of the Graphics card')
  })

  it('leaves new questions alone', () => {
    expect(followUp('where is crackhouse', { masked: 'where is place', slots: { place: 'Crackhouse' } }, ledx)).toBeNull()
    expect(followUp('how much is a gpu worth', { masked: 'how much is a item worth', slots: { item: 'Graphics card' } }, ledx)).toBeNull()
    expect(followUp('how much is it worth', { masked: 'how much is it worth', slots: {} }, null)).toBeNull()
    expect(followUp('what time is it in tarkov', { masked: 'what time is it in tarkov', slots: {} }, ledx)).toBeNull()
    expect(followUp('is it night on customs', { masked: 'is it night on map', slots: { map: 'Customs' } }, ledx)).toBeNull()
    // A different kind of name than last time is a new question.
    expect(followUp('and crackhouse', { masked: 'and place', slots: { place: 'Crackhouse' } }, customsExtracts)).toBeNull()
  })
})
