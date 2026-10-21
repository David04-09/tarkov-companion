import { describe, expect, it } from 'vitest'
import { EXAMPLES, pickTemplate, slotsOf, TEMPLATES } from './understand'
import { encodeWordPieces } from './wordPiece'

describe('word pieces', () => {
  it('splits words into the longest known pieces, framed by [CLS] and [SEP]', () => {
    const vocab = new Map(['[PAD]', '[UNK]', '[CLS]', '[SEP]', 'led', '##die', '##s', 'is', '?', 'the'].map((t, i) => [t, i]))
    expect(encodeWordPieces('Is the leddies?', vocab)).toEqual([2, 7, 9, 4, 5, 6, 8, 3])
    expect(encodeWordPieces('zzz', vocab)).toEqual([2, 1, 3])
  })
})

describe('picking the question that is meant', () => {
  // Fake meanings: one direction per template, so a sentence "means" the template it points at.
  const dims = TEMPLATES.length
  const unit = (i: number) => {
    const v = new Float32Array(dims)
    v[i] = 1
    return v
  }
  const vectors = EXAMPLES.map((e) => unit(e.template))
  const price = TEMPLATES.findIndex((t) => t.ask === 'how much is {item} worth')

  it('fills in the names and needs every name the question uses', () => {
    expect(pickTemplate(unit(price), vectors, { item: 'LEDX' }, 'yo what is a ledx going for')).toMatchObject({ ask: 'how much is LEDX worth', slots: 1 })
    // No item in the question: the price question cannot be asked.
    expect(pickTemplate(unit(price), vectors, {}, 'what is it going for')).toBeNull()
  })

  it('says nothing when nothing is close enough', () => {
    const between = new Float32Array(dims).fill(0.1)
    expect(pickTemplate(between, vectors, { item: 'LEDX' }, 'banana pancakes')).toBeNull()
  })

  it('has everyday examples for every question, each naming the slots its question needs', () => {
    for (const t of TEMPLATES) {
      expect(t.say.length).toBeGreaterThanOrEqual(3)
      for (const s of slotsOf(t.ask)) expect(t.say.some((x) => x.includes(s)), `${t.ask}: ${s}`).toBe(true)
    }
  })
})
