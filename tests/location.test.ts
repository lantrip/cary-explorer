import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  distanceMeters,
  formatMilesShort,
  formatStraightLine,
  sortByDistance,
} from '../src/features/location/distance'
import { useLocationStore } from '../src/features/location/locationStore'

// Cary Town Hall (approx.) and the NC State Capitol in Raleigh: about 13.3 km (8.3 mi) apart.
const CARY_TOWN_HALL: [number, number] = [-78.7811, 35.7915]
const RALEIGH_CAPITOL: [number, number] = [-78.639, 35.7804]

describe('distanceMeters', () => {
  it('matches a known pair within tolerance', () => {
    const d = distanceMeters(CARY_TOWN_HALL, RALEIGH_CAPITOL)
    expect(d).toBeGreaterThan(12_800)
    expect(d).toBeLessThan(13_300)
  })
  it('is zero for the same point and symmetric', () => {
    expect(distanceMeters(CARY_TOWN_HALL, CARY_TOWN_HALL)).toBe(0)
    expect(distanceMeters(CARY_TOWN_HALL, RALEIGH_CAPITOL)).toBeCloseTo(distanceMeters(RALEIGH_CAPITOL, CARY_TOWN_HALL), 6)
  })
  it('one degree of latitude is about 111.2 km', () => {
    expect(distanceMeters([0, 0], [0, 1])).toBeCloseTo(111_195, -1)
  })
})

describe('formatStraightLine', () => {
  it('uses one decimal and miles', () => {
    expect(formatStraightLine(1931)).toBe('1.2 mi straight-line')
    expect(formatMilesShort(1931)).toBe('1.2 mi')
  })
  it('never goes below 0.1 mi', () => {
    expect(formatStraightLine(0)).toBe('0.1 mi straight-line')
    expect(formatStraightLine(20)).toBe('0.1 mi straight-line')
  })
})

describe('sortByDistance', () => {
  const origin: [number, number] = [-78.78, 35.79]
  const items = [
    { id: 'far', centroid: [-78.6, 35.78] as [number, number] },
    { id: 'none1' },
    { id: 'near', centroid: [-78.781, 35.791] as [number, number] },
    { id: 'tieA', centroid: [-78.7, 35.79] as [number, number] },
    { id: 'tieB', centroid: [-78.7, 35.79] as [number, number] },
    { id: 'none2' },
  ]
  it('sorts nearest first, stable on ties, and puts places without coordinates last in order', () => {
    const out = sortByDistance(items, origin)
    expect(out.map((r) => r.item.id)).toEqual(['near', 'tieA', 'tieB', 'far', 'none1', 'none2'])
    expect(out[4].meters).toBeNull()
    expect(out[0].meters).toBeGreaterThan(0)
  })
  it('does not mutate the input', () => {
    const copy = [...items]
    sortByDistance(items, origin)
    expect(items).toEqual(copy)
  })
})

describe('location store', () => {
  type Ok = (p: { coords: { longitude: number; latitude: number; accuracy: number } }) => void
  type Fail = (e: { code: number }) => void
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

  function mockNavigator(geolocation: unknown) {
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation }, configurable: true })
  }

  beforeEach(() => {
    useLocationStore.getState().stop()
  })
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete (globalThis as { navigator?: unknown }).navigator
  })

  it('is idle and does not call geolocation until request()', () => {
    const getCurrentPosition = vi.fn()
    mockNavigator({ getCurrentPosition })
    expect(useLocationStore.getState().status).toBe('idle')
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('success: requesting then on, with coords, accuracy and the expected options', () => {
    let ok: Ok = () => {}
    const getCurrentPosition = vi.fn((s: Ok, _f?: Fail, _o?: object) => {
      ok = s
    })
    mockNavigator({ getCurrentPosition })
    useLocationStore.getState().request()
    expect(useLocationStore.getState().status).toBe('requesting')
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 60_000,
    })
    ok({ coords: { longitude: -78.78, latitude: 35.79, accuracy: 25 } })
    const s = useLocationStore.getState()
    expect(s.status).toBe('on')
    expect(s.coords).toEqual([-78.78, 35.79])
    expect(s.accuracy).toBe(25)
    s.stop()
    expect(useLocationStore.getState()).toMatchObject({ status: 'idle', coords: null, accuracy: null })
  })

  it('denied (code 1)', () => {
    mockNavigator({ getCurrentPosition: (_s: Ok, f: Fail) => f({ code: 1 }) })
    useLocationStore.getState().request()
    expect(useLocationStore.getState()).toMatchObject({ status: 'denied', coords: null })
  })

  it('unavailable: no geolocation, and code 2', () => {
    mockNavigator(undefined)
    useLocationStore.getState().request()
    expect(useLocationStore.getState().status).toBe('unavailable')
    useLocationStore.getState().stop()
    mockNavigator({ getCurrentPosition: (_s: Ok, f: Fail) => f({ code: 2 }) })
    useLocationStore.getState().request()
    expect(useLocationStore.getState().status).toBe('unavailable')
  })

  it('timeout (code 3) is an error', () => {
    mockNavigator({ getCurrentPosition: (_s: Ok, f: Fail) => f({ code: 3 }) })
    useLocationStore.getState().request()
    expect(useLocationStore.getState().status).toBe('error')
  })

  it('a late answer after stop() is ignored', () => {
    let ok: Ok = () => {}
    mockNavigator({
      getCurrentPosition: (s: Ok) => {
        ok = s
      },
    })
    useLocationStore.getState().request()
    useLocationStore.getState().stop()
    ok({ coords: { longitude: 1, latitude: 2, accuracy: 3 } })
    expect(useLocationStore.getState()).toMatchObject({ status: 'idle', coords: null })
  })
})
