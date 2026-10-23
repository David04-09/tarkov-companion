import { describe, expect, it } from 'vitest'
import { itemQuestionKind, keyWorthText } from './items'

describe('item answers', () => {
  it('gives the short card when only a name is said', () => {
    expect(itemQuestionKind('dorms marked key')).toBe('card')
    expect(itemQuestionKind('ledx')).toBe('card')
    expect(itemQuestionKind('what is the ledx for')).toBe('info')
    expect(itemQuestionKind('price of the ledx')).toBe('price')
    expect(itemQuestionKind('where can i find a gpu')).toBe('where')
  })

  it('says in one line whether a key is worth it', () => {
    expect(keyWorthText({ kind: 'yes', lootWorth: true, score: 6, reasons: ['LEDX spawn', 'safe', 'drawer'] })).toBe('Worth it: LEDX spawn, safe.')
    expect(keyWorthText({ kind: 'no', lootWorth: false, score: 1, reasons: ['drawer'] })).toBe('Not really worth it: only drawer.')
    expect(keyWorthText({ kind: 'quest', lootWorth: false, score: 0, reasons: [] })).toBe('You need it for a quest.')
    expect(keyWorthText({ kind: 'unknown', lootWorth: null, score: 0, reasons: [] })).toBeNull()
  })
})
