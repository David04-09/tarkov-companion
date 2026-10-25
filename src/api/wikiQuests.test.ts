import { describe, expect, it } from 'vitest'
import type { GameMap, Task, Trader } from './types'
import { levelFor, missingTitles, normQuestName, parseWikiQuest, questInMode, toWikiTask, wikiRenames, wikiText } from './wikiQuests'
import { withRenamed } from '../store/progress'

// Shortened from the real EFT Wiki pages (2026-10-25).
const NUMBER = `{{Event content}}
{{Infobox quest
|image         =Number Temporarily Unavailable Banner.png
|location      =[[Lighthouse]]
|given by      =[[Prapor]]
|previous      =[[Fog of War]]
|leads to      =[[All-Inclusive Support]]
|reqkappa      =<font color="green">No</font>
}}

'''{{PAGENAME}}''' is a [[Quests|Quest]] in ''[[Escape from Tarkov]]''.

==Dialogue==
;Description
:Some talk.

==Objectives==
* Stash 3 [[Electronic components]] at Prapor's new camp on [[Lighthouse]]
* Stash a [[Military cable]] at Prapor's new camp on [[Lighthouse]]

==Rewards==
* +15,000 [[EXP]]
* 300,000 Roubles
** 315,000 Roubles with [[Hideout#Modules|Intelligence Center]] Level 1
* 2× [[6B45 armored rig (Medic, EMR)]]
{{quote|Whatcha think of our camp?}}

==Guide==
{|class="wikitable"
|}

{{Navbox quests}}
[[Category:Quests]]`

const HONEST = `{{Infobox quest
|location      =[[Lighthouse]]
|given by      =[[BTR Driver]]
|previous      =
|leads to      =[[I'm Something of a BTR Myself]]
|reqkappa      =<font color="green">No</font>
}}
==Objectives==
* Scout the intersection at the village on [[Lighthouse]]
* Share your feedback with the [[BTR Driver]]

==Rewards==
* +15,000 [[EXP]]`

const page = (_title: string, fields: Record<string, string>, sections: Record<string, string[]>) =>
  `{{Infobox quest\n${Object.entries(fields).map(([k, v]) => `|${k} =${v}`).join('\n')}\n}}\n` +
  Object.entries(sections).map(([k, lines]) => `==${k}==\n${lines.map((l) => `* ${l}`).join('\n')}\n`).join('\n')

const map = (name: string): GameMap => ({ id: name.toLowerCase(), name, normalizedName: name.toLowerCase().replace(/\s+/g, '-') }) as GameMap
const trader = (name: string): Trader => ({ id: `t-${name.toLowerCase()}`, name, normalizedName: name.toLowerCase(), imageLink: null, currency: 'RUB', resetTime: null, maxLevel: 4, levels: [] })
const data = {
  tasks: [{ id: 'debut', name: 'Debut' }, { id: 'fog', name: 'Fog of War' }] as Task[],
  traders: ['Prapor', 'Therapist', 'Skier', 'Ragman'].map(trader),
  maps: ['Lighthouse', 'Customs', 'The Lab', 'Night Factory'].map(map),
}

describe('parseWikiQuest', () => {
  it('reads an event quest page', () => {
    const p = parseWikiQuest('Number Temporarily Unavailable', NUMBER, { historical: false, event: true })
    expect(p).toMatchObject({ giver: 'Prapor', locations: ['Lighthouse'], previous: ['Fog of War'], leadsTo: ['All-Inclusive Support'], kappa: false, kind: 'event' })
    expect(p.objectives).toEqual(["Stash 3 Electronic components at Prapor's new camp on Lighthouse", "Stash a Military cable at Prapor's new camp on Lighthouse"])
    // Intelligence Center variants (** lines) and the quote are left out.
    expect(p.rewards).toEqual(['+15,000 EXP', '300,000 Roubles', '2× 6B45 armored rig (Medic, EMR)'])
  })

  it('tells the kinds apart', () => {
    expect(parseWikiQuest('Honest Review', HONEST, { historical: false, event: false }).kind).toBe('regular')
    expect(parseWikiQuest('Old', HONEST, { historical: true, event: true }).kind).toBe('past')
    const seasonal = page('Cast the Net', { location: '[[Shoreline]]' }, { Requirements: ['Must be playing in the [[Seasons#Seasonal mode|Seasonal mode]].'] })
    expect(parseWikiQuest('Cast the Net', seasonal, { historical: false, event: false }).kind).toBe('seasonal')
    const arena = page('Advertising Business - Part 1', { location: '[[Arena]]', 'given by': '[[Ref]]' }, {})
    expect(parseWikiQuest('Advertising Business - Part 1', arena, { historical: false, event: false }).kind).toBe('arena')
    expect(parseWikiQuest('Advertising Business - Part 1', arena, { historical: true, event: false }).kind).toBe('past')
  })
})

describe('names and markup', () => {
  it('compares names the way both sources write them', () => {
    expect(normQuestName('Uninvited Guests – Part 2')).toBe(normQuestName('Uninvited Guests - Part 2'))
    expect(normQuestName('The Punisher (quest)')).toBe('the punisher')
    expect(normQuestName('Gunsmith  -  Part 1')).toBe('gunsmith - part 1')
    expect(normQuestName('Debut [PVE ZONE]')).toBe('debut')
    expect(normQuestName('Easy Money - Part 1 [PVP ZONE]')).toBe('easy money - part 1')
  })

  it('turns wiki markup into text', () => {
    expect(wikiText("Hand over '''3''' [[Gas analyzer|Gas analyzers]] {{FIR}}<br>now")).toBe('Hand over 3 Gas analyzers now')
  })

  it('lists only the quests the game data lacks', () => {
    const index = { all: ['Debut', 'Honest Review', 'Old one'], historical: ['Old one'], event: [] }
    expect(missingTitles(index, [{ name: 'Debut' }], false)).toEqual(['Honest Review'])
    expect(missingTitles(index, [{ name: 'Debut' }], true)).toEqual(['Honest Review', 'Old one'])
  })
})

describe('toWikiTask', () => {
  it('links prerequisites to real quests and other wiki quests', () => {
    const p = parseWikiQuest('Number Temporarily Unavailable', NUMBER, { historical: false, event: true })
    const t = toWikiTask(p, data, new Set(['Number Temporarily Unavailable']), 'pve')
    expect(t).toMatchObject({ id: 'wiki:Number Temporarily Unavailable', experience: 15000, minPlayerLevel: 0, map: { id: 'lighthouse' }, trader: { id: 't-prapor' } })
    expect(t.taskRequirements).toEqual([{ taskId: 'fog', status: ['complete'] }])
    expect(t.objectives[0]).toMatchObject({ type: 'wiki', maps: [{ id: 'lighthouse' }] })
    expect(t.wiki?.kind).toBe('event')
  })

  it('keeps a giver the game data does not know (BTR Driver)', () => {
    const t = toWikiTask(parseWikiQuest('Honest Review', HONEST, { historical: false, event: false }), data, new Set(), 'pve')
    expect(t.trader).toMatchObject({ name: 'BTR Driver', id: 'wiki-trader:BTR Driver' })
  })

  it('reads accept-only prerequisites, story steps and self-references', () => {
    const after = page('Afterparty', { previous: '[[Debut]]' }, { Requirements: ["Must accept Prapor's quest [[Debut]] to obtain this quest."] })
    const a = toWikiTask(parseWikiQuest('Afterparty', after, { historical: false, event: true }), data, new Set(), 'pve')
    expect(a.taskRequirements).toEqual([{ taskId: 'debut', status: ['active'] }])
    expect(a.otherRequirements).toEqual([])

    const guests = page('Uninvited Guests - Part 1', { previous: '[[Tour]]' }, { Requirements: ['Must reach Loyalty Level 2 with [[Prapor]] to obtain this quest.'] })
    const g = toWikiTask(parseWikiQuest('Uninvited Guests - Part 1', guests, { historical: false, event: false }), data, new Set(), 'regular')
    expect(g.taskRequirements).toEqual([])
    expect(g.otherRequirements).toEqual(['Finish Tour first'])
    expect(g.traderRequirements).toEqual([{ traderId: 't-prapor', type: 'level', compare: '>=', value: 2 }])

    const trust = page('To the Light - Trust but Verify', { previous: '[[To the Light - Trust but Verify]]' }, { Requirements: ['Reach Loyalty Level 3 with [[Therapist]], [[Skier]] and [[Ragman]].'] })
    const tr = toWikiTask(parseWikiQuest('To the Light - Trust but Verify', trust, { historical: false, event: false }), data, new Set(['To the Light - Trust but Verify']), 'pve')
    expect(tr.taskRequirements).toEqual([])
    expect(tr.traderRequirements.map((r) => r.traderId)).toEqual(['t-therapist', 't-skier', 't-ragman'])
  })

  it('reads the giver loyalty level from the infobox', () => {
    const easy = page('Easy Money - Part 1', { 'given by': '[[Skier]]', 'LL requirement': '2' }, {})
    const t = toWikiTask(parseWikiQuest('Easy Money - Part 1', easy, { historical: false, event: false }), data, new Set(), 'regular')
    expect(t.traderRequirements).toEqual([{ traderId: 't-skier', type: 'level', compare: '>=', value: 2 }])
  })

  it('uses the level of the mode you play and leaves Arena levels out', () => {
    const reqs = ['Must be level 30 to start this quest (20 in the PvE mode).', 'Must have Prestige level 1']
    expect(levelFor(reqs, 'regular')).toBe(30)
    expect(levelFor(reqs, 'pve')).toBe(20)
    expect(levelFor(['Must have Prestige level 1'], 'pve')).toBe(0)
    const prestige = page('New Beginning (Prestige 2)', {}, { Requirements: reqs })
    const t = toWikiTask(parseWikiQuest('New Beginning (Prestige 2)', prestige, { historical: false, event: false }), data, new Set(), 'pve')
    expect(t.minPlayerLevel).toBe(20)
    expect(t.otherRequirements).toEqual(['Must have Prestige level 1'])
  })

  it('drops quests that belong to the other mode', () => {
    const pvp = parseWikiQuest('New Beginning (Prestige 1)', page('x', {}, { Requirements: ['Must be playing the [[PvP]] game mode.'] }), { historical: false, event: false })
    expect(questInMode(pvp, 'pve')).toBe(false)
    expect(questInMode(pvp, 'regular')).toBe(true)
  })
})

describe('ticks carry over', () => {
  it('maps wiki ids to the real quest once the data has it', () => {
    expect(wikiRenames(['wiki:Honest Review', 'wiki:Gone', 'debut'], [{ id: 'real-hr', name: 'Honest Review' }])).toEqual({ 'wiki:Honest Review': 'real-hr' })
  })

  it('moves every mark to the new id', () => {
    const p = { playerLevel: 1, faction: 'USEC' as const, completedTaskIds: new Set(['wiki:A', 'x']), activeTaskIds: new Set(['wiki:B', 'real-a']), failedTaskIds: new Set<string>() }
    const next = withRenamed(p, { 'wiki:A': 'real-a', 'wiki:B': 'real-b' })
    expect([...next.completedTaskIds].sort()).toEqual(['real-a', 'x'])
    // Done wins over started.
    expect([...next.activeTaskIds]).toEqual(['real-b'])
    expect(withRenamed(p, { 'wiki:C': 'c' })).toBe(p)
  })
})
