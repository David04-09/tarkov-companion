import { describe, expect, it } from 'vitest'
import { GameLogInterpreter, LogEntrySplitter, logFileRole, logFolderTime, normalizeSessionMode } from './parser'

// Real line shapes from EFT 1.1.5 logs (ids and names replaced with placeholders).
const APPLICATION_LOG = [
  '2026-09-11 17:54:04.711|1.1.5.0.47242|Info|application|Session mode: Regular',
  '2026-09-11 17:54:36.021|1.1.5.0.47242|Info|application|Session mode: Pve',
  '2026-09-11 17:58:15.298|1.1.5.0.47242|Info|application|PrepareSelectedProfileLocally ProfileId:aaaaaaaaaaaaaaaaaaaaaaaa AccountId:12345678',
  '2026-09-11 17:58:15.298|1.1.5.0.47242|Info|application|CompleteSelectedProfile ProfileId:aaaaaaaaaaaaaaaaaaaaaaaa AccountId:12345678',
  '2026-09-11 17:58:25.172|1.1.5.0.47242|Debug|application|Init: pstrGameVersion: Escape from Tarkov 1.1.5.0.47242, uiAddress: 0, usPort: 0',
  '2026-09-11 18:09:59.748|1.1.5.0.47242|Info|application|scene preset path:maps/shopping_mall.bundle rcid:Shopping_Mall.ScenesPreset.asset',
  '2026-09-11 18:10:28.403|1.1.5.0.47242|Info|application|LocationLoaded:20.71 real:29.51 diff:8.8',
  "2026-09-11 18:26:20.853|1.1.5.0.47242|Debug|application|TRACE-NetworkGameCreate profileStatus: 'Profileid: aaaaaaaaaaaaaaaaaaaaaaaa, Status: Busy, RaidMode: Online, Ip: 10.0.0.1, Port: 17003, Location: Interchange, Sid: rsa-jbg02lgs003_x_11.09.26_18-16-25, GameMode: deathmatch, shortId: 2BSJSK'",
  '2026-09-11 18:26:38.519|1.1.5.0.47242|Info|application|GameStarting:239.43(0) real:251.59(0) diff:12.16',
  '2026-09-11 18:26:38.519|1.1.5.0.47242|Info|application|GameStarted:239.43(0) real:251.59(0) diff:12.16',
  '2026-09-11 18:30:00.000|1.1.5.0.47242|Info|application|Network game matching aborted',
  '',
].join('\r\n')

const NOTIFICATIONS_LOG = [
  '2026-09-11 18:12:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | ChatMessageReceived',
  '{',
  '  "type": "new_message",',
  '  "eventId": "bbbbbbbbbbbbbbbbbbbbbbbb",',
  '  "dialogId": "54cb57776803fa99248b456e",',
  '  "message": {',
  '    "_id": "cccccccccccccccccccccccc",',
  '    "uid": "54cb57776803fa99248b456e",',
  '    "type": 10,',
  '    "dt": 1789146245,',
  '    "text": "quest started",',
  '    "templateId": "596a0e1686f7741ddf17dbee description",',
  '    "hasRewards": false,',
  '    "maxStorageTime": 604800',
  '  }',
  '}',
  '2026-09-11 18:40:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | ChatMessageReceived',
  '{',
  '  "type": "new_message",',
  '  "message": {',
  '    "type": 12,',
  '    "dt": 1789148899,',
  '    "text": "quest started",',
  '    "templateId": "5ae449c386f7744bde357697 successMessageText",',
  '    "items": {',
  '      "stash": "dddddddddddddddddddddddd",',
  '      "data": [',
  '        {',
  '          "_id": "eeeeeeeeeeeeeeeeeeeeeeee",',
  '          "_tpl": "5449016a4bdc2d6f028b456f",',
  '          "upd": { "StackObjectsCount": 80000 },',
  '          "parentId": "dddddddddddddddddddddddd",',
  '          "slotId": "main"',
  '        }',
  '      ]',
  '    },',
  '    "maxStorageTime": 172800,',
  '    "profileChangeEvents": [],',
  '    "hasRewards": true',
  '  }',
  '}',
  '2026-09-11 18:41:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | ChatMessageReceived',
  '{',
  '  "message": {',
  '    "type": 11,',
  '    "templateId": "669fa38fad7f1eac2607ed46 failMessageText",',
  '    "text": "quest started"',
  '  }',
  '}',
  '2026-09-11 18:42:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | ChatMessageReceived',
  '{',
  '  "message": {',
  '    "type": 4,',
  '    "text": "",',
  '    "templateId": "5bdabfb886f7743e152e867e 0",',
  '    "systemData": {',
  '      "buyerNickname": "Buyer",',
  '      "soldItem": "5d403f9186f7743cac3f229b",',
  '      "itemCount": 1',
  '    }',
  '  }',
  '}',
  '2026-09-11 18:50:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | UserMatchOver',
  '{',
  '  "type": "userMatchOver",',
  '  "profileid": "aaaaaaaaaaaaaaaaaaaaaaaa",',
  '  "status": "Free",',
  '  "location": "Interchange",',
  '  "raidMode": "Online",',
  '  "mode": "deathmatch",',
  '  "shortId": "2ZKV08",',
  '  "additional_info": []',
  '}',
  '',
].join('\r\n')

function parseAll(text: string) {
  const s = new LogEntrySplitter()
  return [...s.push(text), ...s.flush()]
}

describe('LogEntrySplitter', () => {
  it('splits header lines and attaches JSON blocks', () => {
    const entries = parseAll(NOTIFICATIONS_LOG)
    expect(entries).toHaveLength(5)
    expect(entries[0].rest).toContain('ChatMessageReceived')
    expect(entries[0].json).toContain('"type": 10')
    expect(entries[4].rest).toContain('UserMatchOver')
    expect(JSON.parse(entries[4].json as string).shortId).toBe('2ZKV08')
    expect(entries[0].line).toBe(1)
    expect(entries[1].line).toBe(17)
  })

  it('handles chunks that split lines and JSON blocks', () => {
    const s = new LogEntrySplitter()
    const all: ReturnType<typeof s.push> = []
    for (let i = 0; i < NOTIFICATIONS_LOG.length; i += 37) all.push(...s.push(NOTIFICATIONS_LOG.slice(i, i + 37)))
    all.push(...s.flush())
    expect(all.map((e) => e.line)).toEqual(parseAll(NOTIFICATIONS_LOG).map((e) => e.line))
    expect(all[1].json).toContain('successMessageText')
  })

  it('parses timestamps as local time and accepts an optional timezone offset', () => {
    const [a] = parseAll('2026-09-11 17:54:04.711|1.1.5.0.47242|Info|application|Session mode: Regular\n')
    expect(new Date(a.at).getHours()).toBe(17)
    expect(new Date(a.at).getMilliseconds()).toBe(711)
    const [b] = parseAll('2024-01-02 03:04:05.006 +02:00|Info|application|Session mode: Pve\n')
    expect(b.rest).toBe('Info|application|Session mode: Pve')
  })
})

describe('GameLogInterpreter', () => {
  it('extracts session mode, profile, version and raid events from the application log', () => {
    const it_ = new GameLogInterpreter()
    const events = parseAll(APPLICATION_LOG).flatMap((e) => it_.interpret(e, 'application_000.log', true))
    expect(events.map((e) => e.kind)).toEqual([
      'sessionMode',
      'sessionMode',
      'profile',
      'gameVersion',
      'mapLoading',
      'raidMatched',
      'raidStarting',
      'raidStarted',
      'matchingAborted',
    ])
    const matched = events.find((e) => e.kind === 'raidMatched')
    expect(matched).toMatchObject({ location: 'Interchange', raidId: '2BSJSK', online: true, gameMode: 'deathmatch', mode: 'pve' })
    expect(events.find((e) => e.kind === 'profile')).toMatchObject({ profileId: 'aaaaaaaaaaaaaaaaaaaaaaaa', accountId: '12345678' })
    expect(events.find((e) => e.kind === 'gameVersion')).toMatchObject({ version: '1.1.5.0.47242' })
    expect(events.find((e) => e.kind === 'mapLoading')).toMatchObject({ scenePath: 'maps/shopping_mall.bundle' })
    expect(it_.currentMode).toBe('pve')
  })

  it('extracts task, flea and raid-end events from notifications and attributes the session mode by time', () => {
    const it_ = new GameLogInterpreter()
    for (const e of parseAll(APPLICATION_LOG)) it_.interpret(e, 'application_000.log', true)
    const events = parseAll(NOTIFICATIONS_LOG).flatMap((e) => it_.interpret(e, 'push-notifications_000.log', false))
    expect(events.map((e) => e.kind)).toEqual(['taskStarted', 'taskFinished', 'taskFailed', 'fleaSold', 'raidEnded'])
    expect(events[0]).toMatchObject({ taskId: '596a0e1686f7741ddf17dbee', mode: 'pve', historical: false })
    expect(events[1]).toMatchObject({ taskId: '5ae449c386f7744bde357697' })
    expect(events[2]).toMatchObject({ taskId: '669fa38fad7f1eac2607ed46' })
    expect(events[3]).toMatchObject({ itemId: '5d403f9186f7743cac3f229b', count: 1, buyer: 'Buyer' })
    expect(events[4]).toMatchObject({ location: 'Interchange', raidId: '2ZKV08' })
  })

  it('uses the mode that was active at the notification time', () => {
    const it_ = new GameLogInterpreter()
    for (const e of parseAll(APPLICATION_LOG)) it_.interpret(e, 'application_000.log', true)
    // Between the Regular and Pve lines (17:54:04 .. 17:54:36)
    expect(it_.modeAt(new Date(2026, 8, 11, 17, 54, 20).getTime())).toBe('regular')
    expect(it_.modeAt(new Date(2026, 8, 11, 19, 0, 0).getTime())).toBe('pve')
    // Before any mode line: fall back to the session's first mode
    expect(it_.modeAt(new Date(2026, 8, 11, 17, 0, 0).getTime())).toBe('regular')
  })

  it('ignores player chat messages and unknown notifications', () => {
    const it_ = new GameLogInterpreter()
    const text = [
      '2026-09-11 18:12:00.000|1.1.5.0.47242|Info|push-notifications|Got notification | ChatMessageReceived',
      '{ "message": { "type": 1, "text": "hello" } }',
      '2026-09-11 18:12:01.000|1.1.5.0.47242|Info|push-notifications|Got notification | GroupMatchRaidReady',
      '{ "type": "groupMatchRaidReady" }',
      '',
    ].join('\n')
    expect(parseAll(text).flatMap((e) => it_.interpret(e, 'n.log', false))).toEqual([])
  })
})

describe('helpers', () => {
  it('normalises session modes', () => {
    expect(normalizeSessionMode('Pve')).toBe('pve')
    expect(normalizeSessionMode('PVE')).toBe('pve')
    expect(normalizeSessionMode('Regular')).toBe('regular')
    expect(normalizeSessionMode('PvpSeason')).toBe('seasonal')
    expect(normalizeSessionMode('Whatever')).toBe('unknown')
  })

  it('recognises the log files worth reading, with and without the timestamp prefix', () => {
    expect(logFileRole('2026.10.02_18-30-59_1.1.5.1.47510 application_000.log')).toBe('application')
    expect(logFileRole('2026.10.02_18-30-59_1.1.5.1.47510 push-notifications_000.log')).toBe('notifications')
    expect(logFileRole('notifications.log')).toBe('notifications')
    expect(logFileRole('application.log')).toBe('application')
    expect(logFileRole('2026.10.02_18-30-59_1.1.5.1.47510 output_000.log')).toBeNull()
    expect(logFileRole('backend_000.log')).toBeNull()
  })

  it('parses log folder timestamps', () => {
    const t = logFolderTime('log_2026.09.11_17-53-50_1.1.5.0.47242') as number
    expect(new Date(t).getFullYear()).toBe(2026)
    expect(new Date(t).getMinutes()).toBe(53)
    expect(logFolderTime('something_else')).toBeNull()
  })
})
