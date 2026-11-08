import { describe, expect, it } from 'vitest'
import { clampSheetHeight, pickSnap, snapAnimationMs, velocityFromSamples } from '../src/features/places/sheetDrag'

const W = 800 // peek 112, half 400, full 720
const base = { startState: 'half' as const, startHeight: 400, velocityPxPerMs: 0, windowHeight: W }

describe('pickSnap', () => {
  it('snaps to the nearest state', () => {
    expect(pickSnap({ ...base, currentHeight: 150 })).toBe('peek')
    expect(pickSnap({ ...base, currentHeight: 300 })).toBe('half')
    expect(pickSnap({ ...base, currentHeight: 600 })).toBe('full')
    expect(pickSnap({ ...base, currentHeight: 700 })).toBe('full')
  })
  it('returns null for a tap', () => {
    expect(pickSnap({ ...base, currentHeight: 403 })).toBeNull()
    expect(pickSnap({ ...base, currentHeight: 395, velocityPxPerMs: 2 })).toBeNull()
  })
  it('moves one state on a fast flick', () => {
    expect(pickSnap({ ...base, currentHeight: 430, velocityPxPerMs: 0.9 })).toBe('full')
    expect(pickSnap({ ...base, currentHeight: 370, velocityPxPerMs: -0.9 })).toBe('peek')
  })
  it('clamps flicks at peek and full', () => {
    expect(pickSnap({ ...base, startState: 'full', startHeight: 720, currentHeight: 740, velocityPxPerMs: 1 })).toBe('full')
    expect(pickSnap({ ...base, startState: 'peek', startHeight: 112, currentHeight: 90, velocityPxPerMs: -1 })).toBe('peek')
  })
  it('ignores slow releases for flick purposes', () => {
    expect(pickSnap({ ...base, currentHeight: 430, velocityPxPerMs: 0.3 })).toBe('half')
  })
})

describe('helpers', () => {
  it('clamps height', () => {
    expect(clampSheetHeight(50, W)).toBe(112)
    expect(clampSheetHeight(50, W, 34)).toBe(146)
    expect(clampSheetHeight(900, W)).toBe(720)
    expect(clampSheetHeight(300, W)).toBe(300)
  })
  it('computes upward velocity from recent samples', () => {
    expect(velocityFromSamples([])).toBe(0)
    expect(velocityFromSamples([{ y: 500, t: 0 }, { y: 400, t: 50 }])).toBe(2)
    expect(velocityFromSamples([{ y: 900, t: 0 }, { y: 300, t: 500 }, { y: 320, t: 550 }])).toBeCloseTo(-0.4)
  })
  it('skips animation for reduced motion', () => {
    expect(snapAnimationMs(true)).toBe(0)
    expect(snapAnimationMs(false)).toBe(200)
  })
})
