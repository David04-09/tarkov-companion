import { describe, expect, it } from 'vitest'
import type { OcrWord } from '../../scan/core'
import { matchQuestNames, questListCells, questNameIndex } from './questListMatch'

/** Words of one line; a word starting with "|" begins a new column. */
function line(y: number, text: string, conf = 90): OcrWord[] {
  const out: OcrWord[] = []
  let x = 0
  for (const raw of text.split(' ')) {
    if (raw.startsWith('|')) x += 120
    const t = raw.replace(/^\|/, '')
    const w = t.length * 9
    out.push({ text: t, conf, x0: x, y0: y, x1: x + w, y1: y + 16 })
    x += w + 6
  }
  return out
}

const index = questNameIndex([
  { id: 'debut', name: 'Debut' },
  { id: 'scout', name: 'Scout' },
  { id: 'gs1', name: 'Gunsmith - Part 1' },
  { id: 'gs11', name: 'Gunsmith - Part 11' },
  { id: 'bp', name: 'Background Check' },
  { id: 'dripBear', name: 'Drip-Out - Part 1' },
  { id: 'dripUsec', name: 'Drip-Out - Part 1' },
  { id: 'huntSadist', name: 'The Huntsman Path - Sadist' },
  { id: 'huntSecured', name: 'The Huntsman Path - Secured Perimeter' },
  { id: 'shortage', name: 'Shortage' },
])

describe('questListCells', () => {
  it('splits a line into columns at wide gaps', () => {
    const cells = questListCells(line(0, 'Background Check |Therapist |Customs |Active'))
    expect(cells.map((c) => c.map((w) => w.text).join(' '))).toEqual(['Background Check', 'Therapist', 'Customs', 'Active'])
  })
})

describe('matchQuestNames', () => {
  it('finds names in quest list rows and ignores the other columns', () => {
    const words = [...line(0, 'Debut |Prapor |Customs |Active'), ...line(30, 'Background Check |Therapist |Customs |Active'), ...line(60, 'Gunsmith - Part 11 |Mechanic |Any |Active')]
    const found = matchQuestNames(words, index)
    expect(found.map((f) => f.name)).toEqual(['Background Check', 'Debut', 'Gunsmith - Part 11'])
  })

  it('tolerates a few misread letters in longer names', () => {
    const found = matchQuestNames(line(0, 'Backgr0und Checx'), index)
    expect(found.map((f) => f.ids)).toEqual([['bp']])
  })

  it('needs short names to be a whole cell, spelled exactly', () => {
    expect(matchQuestNames(line(0, 'Scout the area'), index)).toEqual([])
    expect(matchQuestNames(line(0, 'Debat'), index)).toEqual([])
    expect(matchQuestNames(line(0, 'Scout'), index).map((f) => f.name)).toEqual(['Scout'])
  })

  it('returns every quest that shares a name', () => {
    expect(matchQuestNames(line(0, 'Drip-Out - Part 1'), index)[0].ids).toEqual(['dripBear', 'dripUsec'])
  })

  it('reads names the game cut short', () => {
    expect(matchQuestNames(line(0, 'The Huntsman Path - Secu...'), index).map((f) => f.name)).toEqual(['The Huntsman Path - Secured Perimeter'])
  })

  it('skips a read that fits two quests equally well', () => {
    const parts = questNameIndex([
      { id: 'p2', name: 'Gunsmith Master - Part 2' },
      { id: 'p3', name: 'Gunsmith Master - Part 3' },
    ])
    expect(matchQuestNames(line(0, 'Gunsmith Master - Part Z'), parts)).toEqual([])
    expect(matchQuestNames(line(0, 'Gunsmith Master - Part 3'), parts).map((f) => f.ids)).toEqual([['p3']])
    expect(matchQuestNames(line(0, 'The Huntsman Path - S...'), index)).toEqual([])
  })

  it('does not match unrelated text', () => {
    expect(matchQuestNames([...line(0, 'Eliminate Scavs on Customs'), ...line(30, 'Hand over the item: Salewa')], index)).toEqual([])
  })
})
