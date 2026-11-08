import { describe, expect, it } from 'vitest'
import {
  availableAmenities,
  emptyAmenitiesText,
  filterByAmenities,
  normalizeAmenities,
  parseAmenities,
} from '../src/features/places/amenities'
import { parseCatalog } from '../src/features/places/catalog'
import { ALL_THEME_IDS, parseUrlState, serializeUrlState, type UrlState } from '../src/lib/urlState'
import { useAppStore } from '../src/store/useAppStore'
import type { AmenityKey } from '../src/types/place'

const a = (id: string, amenities?: AmenityKey[]) => ({ id, amenities })

describe('parseAmenities', () => {
  it('keeps known keys in fixed order and drops duplicates and unknown strings', () => {
    expect(parseAmenities(['parking', 'bogus', 'restrooms', 'parking', 42, null])).toEqual(['restrooms', 'parking'])
  })
  it('is undefined when absent, malformed or empty after cleaning', () => {
    expect(parseAmenities(undefined)).toBeUndefined()
    expect(parseAmenities('restrooms')).toBeUndefined()
    expect(parseAmenities([])).toBeUndefined()
    expect(parseAmenities(['nope'])).toBeUndefined()
  })
  it('is applied by the catalog parser', () => {
    const base = {
      id: 'p',
      name: 'P',
      aliases: [],
      category: 'park',
      municipality: 'Cary',
      county: 'Wake',
      centroid: [-78.8, 35.8],
      description: '',
      sourceIds: ['s'],
    }
    const source = { id: 's', name: 'S', url: 'https://example.org', retrievedAt: '2026-11-02T12:00:00Z', license: 'CC0' }
    const { places } = parseCatalog({
      sources: [source],
      places: [{ ...base, amenities: ['water', 'x', 'water'] }, { ...base, id: 'q' }],
    })
    expect(places[0].amenities).toEqual(['water'])
    expect(places[1].amenities).toBeUndefined()
  })
})

describe('filterByAmenities', () => {
  const places = [a('both', ['restrooms', 'parking']), a('one', ['restrooms']), a('none'), a('empty', [])]
  it('returns everything when no filter is on', () => {
    expect(filterByAmenities(places, [])).toHaveLength(4)
  })
  it('requires every selected amenity (AND)', () => {
    expect(filterByAmenities(places, ['restrooms']).map((p) => p.id)).toEqual(['both', 'one'])
    expect(filterByAmenities(places, ['restrooms', 'parking']).map((p) => p.id)).toEqual(['both'])
  })
  it('never passes a place that lacks the key (unknown is not a match)', () => {
    expect(filterByAmenities(places, ['water'])).toEqual([])
    expect(filterByAmenities([a('none')], ['restrooms'])).toEqual([])
  })
})

describe('availableAmenities', () => {
  it('lists only amenities some place has, with counts, in fixed order', () => {
    const list = availableAmenities([a('1', ['parking', 'restrooms']), a('2', ['parking']), a('3')])
    expect(list).toEqual([
      { key: 'restrooms', count: 1 },
      { key: 'parking', count: 2 },
    ])
  })
  it('is empty without data', () => {
    expect(availableAmenities([a('1')])).toEqual([])
  })
})

describe('amenities in the URL', () => {
  const base: UrlState = { place: null, themes: [...ALL_THEME_IDS], view: 'map', q: '', town: null, map: null }
  it('serialises in fixed order and omits when empty', () => {
    expect(serializeUrlState({ ...base, amenities: ['parking', 'restrooms'] })).toBe('?amenities=restrooms,parking')
    expect(serializeUrlState({ ...base, amenities: [] })).toBe('')
    expect(serializeUrlState(base)).toBe('')
  })
  it('round-trips and drops invalid values', () => {
    expect(parseUrlState('?amenities=wheelchair,restrooms').amenities).toEqual(['restrooms', 'wheelchair'])
    expect(parseUrlState('?amenities=bogus,parking,parking,<x>').amenities).toEqual(['parking'])
    expect(parseUrlState('?amenities=bogus').amenities).toBeUndefined()
    expect(parseUrlState('?place=a-b').amenities).toBeUndefined()
  })
})

describe('amenity store actions', () => {
  it('toggles in fixed order and clears', () => {
    useAppStore.setState({ amenityFilters: [] })
    useAppStore.getState().toggleAmenity('parking')
    useAppStore.getState().toggleAmenity('restrooms')
    expect(useAppStore.getState().amenityFilters).toEqual(['restrooms', 'parking'])
    useAppStore.getState().toggleAmenity('parking')
    expect(useAppStore.getState().amenityFilters).toEqual(['restrooms'])
    useAppStore.getState().clearAmenities()
    expect(useAppStore.getState().amenityFilters).toEqual([])
  })
})

describe('emptyAmenitiesText', () => {
  it('is null without filters', () => {
    expect(emptyAmenitiesText([])).toBeNull()
  })
  it('names the amenities', () => {
    expect(emptyAmenitiesText(['restrooms'])).toBe(
      "No places with confirmed restrooms. Many places don't have this information yet.",
    )
    expect(emptyAmenitiesText(['restrooms', 'parking', 'water'])).toBe(
      "No places with confirmed restrooms, parking and drinking water. Many places don't have this information yet.",
    )
  })
  it('normalizeAmenities is stable', () => {
    expect(normalizeAmenities(['water', 'restrooms'])).toEqual(['restrooms', 'water'])
  })
})
