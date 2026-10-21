import { describe, expect, it } from 'vitest'
import { heardName, isEndPhrase } from './wake'

describe('wake word phrases', () => {
  it('hears the name with or without "hey"', () => {
    expect(heardName('hey ranger', 'ranger')).toBe(true)
    expect(heardName('[unk] ranger [unk]', 'ranger')).toBe(true)
    expect(heardName('[unk] hey [unk]', 'ranger')).toBe(false)
  })

  it('ends the conversation on thanks / that is all, not on questions that mention them', () => {
    expect(isEndPhrase("thanks, that's all")).toBe(true)
    expect(isEndPhrase('that is all')).toBe(true)
    expect(isEndPhrase('thank you')).toBe(true)
    expect(isEndPhrase('stop listening')).toBe(true)
    expect(isEndPhrase('ok goodbye')).toBe(true)
    expect(isEndPhrase("thanks that's awl")).toBe(true)
    expect(isEndPhrase('thanks mate')).toBe(true)
    expect(isEndPhrase('where can i find a gpu')).toBe(false)
    expect(isEndPhrase('thanks, where is crackhouse')).toBe(false)
  })
})
