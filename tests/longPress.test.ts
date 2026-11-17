import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnPlace } from '../src/features/map/picking'
import { LONG_PRESS_MS, LONG_PRESS_TOLERANCE_PX, createLongPress, exceedsTolerance } from '../src/features/map/longPress'
import { useAppStore } from '../src/store/useAppStore'

describe('long press', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const make = () => {
    const fired: [number, number][] = []
    return { fired, lp: createLongPress({ onLongPress: (x, y) => fired.push([x, y]) }) }
  }

  it('fires at the start position after the delay', () => {
    const { fired, lp } = make()
    lp.start(1, 10, 20)
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(fired).toEqual([])
    vi.advanceTimersByTime(1)
    expect(fired).toEqual([[10, 20]])
  })
  it('does not fire when released early', () => {
    const { fired, lp } = make()
    lp.start(1, 0, 0)
    vi.advanceTimersByTime(LONG_PRESS_MS - 50)
    lp.end(1)
    vi.advanceTimersByTime(1000)
    expect(fired).toEqual([])
  })
  it('tolerates small movement but cancels past the threshold', () => {
    const a = make()
    a.lp.start(1, 0, 0)
    a.lp.move(1, LONG_PRESS_TOLERANCE_PX, 0)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(a.fired).toHaveLength(1)
    const b = make()
    b.lp.start(1, 0, 0)
    b.lp.move(1, LONG_PRESS_TOLERANCE_PX + 1, 0)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(b.fired).toEqual([])
  })
  it('a second pointer (pinch) cancels and blocks the press', () => {
    const { fired, lp } = make()
    lp.start(1, 0, 0)
    lp.start(2, 50, 50)
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
    lp.end(2)
    lp.end(1)
    lp.start(3, 5, 5)
    vi.advanceTimersByTime(LONG_PRESS_MS)
    expect(fired).toEqual([[5, 5]])
  })
  it('ignores movement of other pointers and explicit cancel stops it', () => {
    const { fired, lp } = make()
    lp.start(1, 0, 0)
    lp.move(9, 500, 500)
    lp.cancel()
    vi.advanceTimersByTime(2000)
    expect(fired).toEqual([])
  })
  it('measures distance in both axes', () => {
    expect(exceedsTolerance(0, 0, 4, 4, 6)).toBe(false)
    expect(exceedsTolerance(0, 0, 5, 5, 6)).toBe(true)
  })
})

describe('picked point shows like a typed coordinate', () => {
  afterEach(() => useAppStore.getState().setDroppedPin(null))
  it('sets the same droppedPin without moving the camera', () => {
    const before = useAppStore.getState().cameraRequest
    useAppStore.getState().showPoint({ lat: 35.79, lon: -78.78 }, false)
    expect(useAppStore.getState().droppedPin).toEqual({ lat: 35.79, lon: -78.78 })
    expect(useAppStore.getState().cameraRequest).toBe(before)
  })
  it('typed coordinates also request the camera, and Clear works the same', () => {
    useAppStore.getState().showPoint({ lat: 35.79, lon: -78.78 }, true, 16)
    expect(useAppStore.getState().cameraRequest).toMatchObject({ center: [-78.78, 35.79], zoom: 16 })
    useAppStore.getState().setDroppedPin(null)
    expect(useAppStore.getState().droppedPin).toBeNull()
  })
})

describe('isOnPlace (what counts as a place under a picked spot)', () => {
  const cat = (id: string) => ({ ws: 'water', creek: 'water', park: 'park' })[id as 'ws']
  it('a watershed area alone is not a place', () => {
    expect(isOnPlace([{ kind: 'area', placeId: 'ws' }], cat)).toBe(false)
    expect(isOnPlace([], cat)).toBe(false)
  })
  it('a creek line or pin inside a watershed counts', () => {
    expect(isOnPlace([{ kind: 'area', placeId: 'ws' }, { kind: 'line', placeId: 'creek' }], cat)).toBe(true)
    expect(isOnPlace([{ kind: 'area', placeId: 'ws' }, { kind: 'pin' }], cat)).toBe(true)
  })
  it('a park outline counts', () => {
    expect(isOnPlace([{ kind: 'area', placeId: 'ws' }, { kind: 'area', placeId: 'park' }], cat)).toBe(true)
  })
})
