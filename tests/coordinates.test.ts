import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStraightLine } from '../src/features/location/distance'
import {
  formatPoint,
  isOutsideArea,
  nearestPlaces,
  parseCoordinates,
} from '../src/features/search/coordinates'
import { useAppStore } from '../src/store/useAppStore'

const near = (p: { lat: number; lon: number } | null, lat: number, lon: number) => {
  expect(p).not.toBeNull()
  expect(p!.lat).toBeCloseTo(lat, 6)
  expect(p!.lon).toBeCloseTo(lon, 6)
}

describe('parseCoordinates formats', () => {
  it.each(['35.79, -78.78', '35.79 -78.78', '35.79,-78.78', '  35.79 ,  -78.78  ', '35.79,   -78.78'])(
    'decimal %j',
    (t) => near(parseCoordinates(t), 35.79, -78.78),
  )
  it.each(['35.79 N 78.78 W', '35.79N, 78.78W', 'N35.79 W78.78', '78.78W 35.79N', '35.79° N, 78.78° W'])(
    'hemisphere %j',
    (t) => near(parseCoordinates(t), 35.79, -78.78),
  )
  it('degrees-minutes-seconds', () => {
    near(parseCoordinates('35°47\'24"N 78°46\'48"W'), 35 + 47 / 60 + 24 / 3600, -(78 + 46 / 60 + 48 / 3600))
    near(parseCoordinates('35°47′24″N, 78°46′48″W'), 35.79, -78.78)
  })
  it('degrees-decimal-minutes', () => {
    near(parseCoordinates('35 47.4 N 78 46.8 W'), 35.79, -78.78)
  })
})

describe('parseCoordinates hemisphere sign', () => {
  it('S and W are negative, N and E positive', () => {
    near(parseCoordinates('10.5 S 20.25 E'), -10.5, 20.25)
    near(parseCoordinates('10.5 N 20.25 W'), 10.5, -20.25)
    near(parseCoordinates('10.5 S 20.25 W'), -10.5, -20.25)
  })
  it('refuses a sign together with a letter', () => {
    expect(parseCoordinates('35.79 N -78.78 W')).toBeNull()
  })
})

describe('parseCoordinates validation', () => {
  it.each(['91, 100', '-91 -100', '35.79, 181', '35.79, -181', '95.5, 190.5', '35.79 N 181 W', '91 N 10 E'])(
    'out of range %j',
    (t) => expect(parseCoordinates(t)).toBeNull(),
  )
  it('rejects bad minutes and seconds', () => {
    expect(parseCoordinates('35 60 N 78 10 W')).toBeNull()
    expect(parseCoordinates('35 10 60 N 78 10 10 W')).toBeNull()
    expect(parseCoordinates('35.5 10 10 N 78 10 10 W')).toBeNull()
  })
  it('swaps only when the first value cannot be a latitude', () => {
    near(parseCoordinates('-78.78, 35.79'), -78.78, 35.79) // both could be a latitude: keep lat, lon order
  })
  it('swaps an impossible-latitude first value', () => {
    near(parseCoordinates('-120.5, 35.79'), 35.79, -120.5)
  })
})

describe('parseCoordinates ambiguity returns null', () => {
  it.each([
    '',
    '   ',
    '35.79',
    '35.79, -78.78, 12',
    '35, -78, 12',
    '12 34', // bare integers, likely an address or name
    'Bond Park',
    '100 Main St',
    '35.79 N 78.78',
    '35.79 N 78.78 N',
    '35.79 E 78.78 W',
    '35.79 N, 78.78 W, 4',
    'N 35.79',
    '35.79 abc -78.78',
    '35.79,, -78.78',
    ',35.79 -78.78',
    '95, 100.5',
  ])('%j', (t) => expect(parseCoordinates(t)).toBeNull())
})

describe('point helpers', () => {
  it('formats to five decimals', () => {
    expect(formatPoint({ lat: 35.79, lon: -78.78 })).toBe('35.79000, -78.78000')
  })
  it('outside-area check uses the rough bbox', () => {
    expect(isOutsideArea({ lat: 35.79, lon: -78.78 })).toBe(false)
    expect(isOutsideArea({ lat: 35.4, lon: -79.2 })).toBe(false)
    expect(isOutsideArea({ lat: 36.21, lon: -78.78 })).toBe(true)
    expect(isOutsideArea({ lat: 35.39, lon: -78.78 })).toBe(true)
    expect(isOutsideArea({ lat: 35.79, lon: -79.3 })).toBe(true)
    expect(isOutsideArea({ lat: 35.79, lon: -78.1 })).toBe(true)
    expect(isOutsideArea({ lat: 40.7, lon: -74 })).toBe(true)
  })
})

describe('nearestPlaces', () => {
  const places = [
    { id: 'far', centroid: [-78.9, 35.9] as [number, number] },
    { id: 'a', centroid: [-78.78, 35.795] as [number, number] },
    { id: 'c', centroid: [-78.78, 35.81] as [number, number] },
    { id: 'b', centroid: [-78.78, 35.80] as [number, number] },
  ]
  const p = { lat: 35.79, lon: -78.78 }
  it('returns the 3 nearest, nearest first', () => {
    const r = nearestPlaces(places, p, 3)
    expect(r.map((x) => x.place.id)).toEqual(['a', 'b', 'c'])
    expect(r[0].meters).toBeLessThan(r[1].meters)
    expect(r[0].meters).toBeCloseTo(556, -1) // 0.005 deg of latitude
  })
  it('returns fewer when the catalog is small', () => {
    expect(nearestPlaces(places.slice(0, 2), p, 3)).toHaveLength(2)
    expect(nearestPlaces([], p, 3)).toEqual([])
  })
  it('formats the distance as straight-line miles', () => {
    expect(formatStraightLine(nearestPlaces(places, p, 1)[0].meters)).toBe('0.3 mi straight-line')
  })
})

describe('no network', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAppStore.getState().setDroppedPin(null)
  })
  it('parsing and applying coordinates never calls fetch', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const p = parseCoordinates('35.79, -78.78')!
    nearestPlaces([{ centroid: [-78.78, 35.8] as [number, number] }], p, 3)
    isOutsideArea(p)
    const s = useAppStore.getState()
    s.setDroppedPin(p)
    s.requestCamera([p.lon, p.lat], 16)
    expect(useAppStore.getState().droppedPin).toEqual(p)
    expect(useAppStore.getState().cameraRequest?.zoom).toBe(16)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('selecting a place clears the dropped pin', () => {
    useAppStore.getState().setDroppedPin({ lat: 35.79, lon: -78.78 })
    useAppStore.getState().setSelectedPlaceId('some-place')
    expect(useAppStore.getState().droppedPin).toBeNull()
    useAppStore.getState().setSelectedPlaceId(null)
  })
})
