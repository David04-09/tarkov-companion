import { describe, expect, it } from 'vitest'
import { retryUrl } from './retryUrl'

describe('retryUrl', () => {
  it('keeps the first try unchanged and makes every retry a new URL', () => {
    const src = 'https://static.wikia.nocookie.net/x/images/a/ab/P.png/revision/latest/scale-to-width-down/480?cb=1'
    expect(retryUrl(src, 0)).toBe(src)
    expect(retryUrl(src, 2)).toBe(`${src}&tcretry=2`)
    expect(retryUrl('https://a.test/p.png', 1)).toBe('https://a.test/p.png?tcretry=1')
  })
})
