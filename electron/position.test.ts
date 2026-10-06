import { describe, expect, it, vi } from 'vitest'

vi.mock('./capture', () => ({ gameScreenshotsDir: () => 'C:/none' }))
const { parseScreenshotName } = await import('./position')

describe('parseScreenshotName', () => {
  it('reads position and facing from an EFT screenshot name', () => {
    const p = parseScreenshotName('2024-08-17[21-42]_-55.45, 2.30, 102.73_0.00000, -0.85211, 0.00000, 0.52335_13.07 (0).png', 1)
    expect(p).toMatchObject({ x: -55.45, y: 2.3, z: 102.73, file: expect.any(String) })
    // Quaternion (0, -0.852, 0, 0.523) is a turn of about -116 degrees around the vertical axis.
    expect(p!.yaw).toBeCloseTo(-116.9, 0)
  })
  it('faces +z with no rotation', () => {
    expect(parseScreenshotName('x_1.0, 2.0, 3.0_0.0, 0.0, 0.0, 1.0_0.0.png', 1)!.yaw).toBeCloseTo(0, 5)
  })
  it('ignores other screenshots', () => {
    expect(parseScreenshotName('Screenshot 2026-10-05 171613.png', 1)).toBeNull()
  })
})
