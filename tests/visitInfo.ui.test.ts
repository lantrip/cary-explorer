import { describe, expect, it } from 'vitest'
import {
  formatVerifiedDate,
  isValidPlaceId,
  parsePlaceDetails,
  placeDetailsUrl,
  splitFields,
} from '../src/features/places/placeDetails'

const known = { key: 'parking', label: 'Parking', status: 'known', value: ' Lot A ', sourceId: 's', verifiedAt: '2026-11-02' }

describe('parsePlaceDetails', () => {
  it('drops unknown keys and rejects bad shapes', () => {
    const d = parsePlaceDetails({ id: 'x', fields: [known, { key: 'bogus', label: 'B', status: 'known' }] }, 'x')
    expect(d?.fields.map((f) => f.key)).toEqual(['parking'])
    expect(d?.fields[0].value).toBe('Lot A')
    expect(parsePlaceDetails({}, 'x')).toBeNull()
  })
  it('downgrades unsourced known fields and trims long values', () => {
    const d = parsePlaceDetails(
      { fields: [{ ...known, sourceId: undefined }, { ...known, key: 'hours', verifiedAt: 'soon' }, { ...known, key: 'phone', value: 'x'.repeat(500) }] },
      'x',
    )
    expect(d?.fields.map((f) => f.status)).toEqual(['unknown', 'unknown', 'known'])
    expect(d?.fields.find((f) => f.key === 'phone')?.value).toHaveLength(200)
  })
})

describe('ids and dates', () => {
  it('validates ids and encodes the url', () => {
    expect(isValidPlaceId('bond-park')).toBe(true)
    for (const bad of ['', 'A', '../x', 'a/b', 'a'.repeat(121)]) expect(isValidPlaceId(bad)).toBe(false)
    expect(placeDetailsUrl('/data/places/abc123/', 'bond-park')).toBe('/data/places/abc123/bond-park.json')
  })
  it('formats dates in UTC', () => {
    expect(formatVerifiedDate('2026-11-02')).toBe('Nov 2, 2026')
    expect(formatVerifiedDate('garbage')).toBe('garbage')
  })
})

describe('splitFields', () => {
  it('splits known/unknown and always surfaces wheelchair', () => {
    const d = parsePlaceDetails({ fields: [known, { key: 'hours', label: 'Hours', status: 'unknown' }, { key: 'wheelchair', label: 'Wheelchair access', status: 'unknown' }] }, 'x')!
    const s = splitFields(d.fields)
    expect(s.known.map((f) => f.key)).toEqual(['parking'])
    expect(s.unknown.map((f) => f.key)).toEqual(['hours'])
    expect(s.wheelchairUnknown).toBe(true)
    expect(splitFields([]).wheelchairUnknown).toBe(true)
    const w = parsePlaceDetails({ fields: [{ ...known, key: 'wheelchair' }] }, 'x')!
    expect(splitFields(w.fields).wheelchairUnknown).toBe(false)
  })
})
