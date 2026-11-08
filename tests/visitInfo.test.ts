import { describe, expect, it } from 'vitest'
// @ts-expect-error untyped .mjs pipeline modules
import { validateRelease } from '../pipeline/lib/validate.mjs'
import { AMENITY_KEYS, amenitiesOf, buildVisitFields, validateDetail, VISIT_KEYS } from '../pipeline/lib/visit.mjs'
import { buildDetails, joinEntrances } from '../pipeline/scripts/build-catalog.mjs'

const dates = { wake: '2026-09-01', entrances: '2026-09-02', caryFeatures: '2026-10-31', greenways: '2026-11-01', wakeGreenways: '2026-02-18' }
const byKey = (fields: ReturnType<typeof buildVisitFields>) => Object.fromEntries(fields.map((f) => [f.key, f]))
const ORDER = [
  'address', 'entrances', 'parking', 'restrooms', 'pavedSurface', 'stepsSlope', 'wheelchair',
  'hours', 'water', 'dogPark', 'playground', 'picnicShelter', 'walkingTrails', 'phone',
]

describe('buildVisitFields', () => {
  it('always returns all 14 fields in order with labels, all unknown when there is no data', () => {
    const fields = buildVisitFields({ dates })
    expect(fields.map((f) => f.key)).toEqual(ORDER)
    expect(VISIT_KEYS).toEqual(ORDER)
    expect(fields.map((f) => f.label)).toEqual([
      'Address', 'Entrances', 'Parking', 'Restrooms', 'Paved surface', 'Steps and slope', 'Wheelchair access',
      'Hours', 'Drinking water', 'Dog park', 'Playground', 'Picnic shelter', 'Walking trails', 'Phone',
    ])
    expect(fields.every((f) => f.status === 'unknown' && f.value === undefined)).toBe(true)
  })

  it('treats "No", null and empty as unknown, never "no"', () => {
    const f = byKey(
      buildVisitFields({
        wake: { RESTROOMS: 'No', PLAYGROUND: null, DOGPARK: '', PICNICSHELTER: 'N', WALKINGTRAILS: 'Maybe', ADDRESS: null, PHONE: ' ' },
        dates,
      }),
    )
    for (const k of ['restrooms', 'playground', 'dogPark', 'picnicShelter', 'walkingTrails', 'address', 'phone']) {
      expect(f[k].status).toBe('unknown')
    }
  })

  it('reads Yes flags and address/phone from a Wake park, carrying source and date', () => {
    const fields = buildVisitFields({
      wake: { RESTROOMS: 'Yes', PLAYGROUND: 'Yes', DOGPARK: 'No', ADDRESS: '1 Main St, Cary, NC', Address2: '1 Main St, Cary, NC', PHONE: '919-555-0100' },
      dates,
    })
    const f = byKey(fields)
    expect(f.restrooms).toMatchObject({ status: 'known', value: 'Yes', sourceId: 'wake-parks', verifiedAt: '2026-09-01' })
    expect(f.address.value).toBe('1 Main St, Cary, NC')
    expect(f.phone.value).toBe('919-555-0100')
    expect(f.dogPark.status).toBe('unknown')
    for (const x of fields.filter((x) => x.status === 'known')) {
      expect(x.sourceId).toBeTruthy()
      expect(x.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('uses Cary park points for cary parks and entrances only as a fallback', () => {
    const f = byKey(buildVisitFields({ caryPoints: [{ restroom: 'Yes', playground: 'No', dogpark: 'Yes' }], entrances: [{ PLAYGROUND: 'Yes' }], dates }))
    expect(f.restrooms).toMatchObject({ sourceId: 'cary-park-features', verifiedAt: '2026-10-31' })
    expect(f.dogPark.sourceId).toBe('cary-park-features')
    expect(f.playground).toMatchObject({ status: 'known', sourceId: 'wake-park-entrances' })
  })

  it('summarises joined entrances and prefers a parking lot over street parking', () => {
    const entrances = [
      { VEHICLEENTRANCE: 'Yes', PEDESTRIANENTRANCE: 'Yes', PARKINGLOT: 'Yes', ADDRESS: '9 Oak Ln' },
      { VEHICLEENTRANCE: 'No', GREENWAYENTRANCE: 'No', PEDESTRIANENTRANCE: 'Yes', PARKINGSTREET: 'Yes', ADDRESS: '9 Oak Ln' },
      { VEHICLEENTRANCE: 'No', PEDESTRIANENTRANCE: 'Yes', PARKINGLOT: 'No' },
    ]
    const f = byKey(buildVisitFields({ entrances, dates }))
    expect(f.entrances.value).toBe('3 entrances (1 vehicle, 2 pedestrian)')
    expect(f.parking.value).toBe('Parking lot')
    expect(f.address).toMatchObject({ status: 'known', value: '9 Oak Ln', sourceId: 'wake-park-entrances' })
    const street = byKey(buildVisitFields({ entrances: [entrances[1]], dates }))
    expect(street.parking.value).toBe('Street parking')
    expect(street.entrances.value).toBe('1 entrance (1 pedestrian)')
    expect(byKey(buildVisitFields({ entrances: [{ PARKINGLOT: 'No', PARKINGSTREET: 'No' }], dates })).parking.status).toBe('unknown')
  })

  it('does not guess an address when entrances disagree', () => {
    const f = byKey(buildVisitFields({ entrances: [{ ADDRESS: '1 A St' }, { ADDRESS: '2 B St' }], dates }))
    expect(f.address.status).toBe('unknown')
  })

  it('a paved trail with no ada field has wheelchair unknown', () => {
    const f = byKey(buildVisitFields({ segments: [{ surftype: 'Asphalt', ada: null }, { surftype: 'Concrete' }], dates }))
    expect(f.pavedSurface).toMatchObject({ status: 'known', value: 'Paved (asphalt/concrete)', sourceId: 'cary-greenways' })
    expect(f.wheelchair.status).toBe('unknown')
    expect(f.wheelchair.value).toBeUndefined()
    expect(f.stepsSlope.status).toBe('unknown')
  })

  it('states wheelchair access only from an explicit ada flag', () => {
    const all = byKey(buildVisitFields({ segments: [{ surftype: 'Asphalt', ada: 'Y' }, { surftype: 'Asphalt', ada: 'yes' }], dates }))
    expect(all.wheelchair).toMatchObject({ status: 'known', value: 'Accessible (per Town of Cary greenway data)', sourceId: 'cary-greenways' })
    const some = byKey(buildVisitFields({ segments: [{ surftype: 'Asphalt', ada: 'Y' }, { surftype: 'Asphalt', ada: null }], dates }))
    expect(some.wheelchair.value).toBe('Accessible on some segments (per Town of Cary greenway data)')
  })

  it('describes mixed and unrecorded surfaces honestly', () => {
    const mixed = byKey(buildVisitFields({ segments: [{ surftype: 'Aggregate' }, { surftype: 'Limestone' }, { surftype: 'Asphalt' }], dates }))
    expect(mixed.pavedSurface.value).toBe('Mixed: aggregate, asphalt, limestone')
    const partial = byKey(buildVisitFields({ segments: [{ surftype: 'Asphalt' }, { surftype: null }], dates }))
    expect(partial.pavedSurface.value).toContain('surface not recorded for some segments')
    expect(byKey(buildVisitFields({ segments: [{ surftype: null }], dates })).pavedSurface.status).toBe('unknown')
  })
})

describe('Wake regional trails (wake-greenways)', () => {
  const wake = (wakeSegments: { surface?: string | null; access?: string | null }[]) => byKey(buildVisitFields({ wakeSegments, dates }))

  it('maps paved values, including combined and misspelled ones, to a human value', () => {
    for (const raw of ['ASPHALT', 'Asphalt', 'concrete', 'Boardwalk']) {
      expect(wake([{ surface: raw }]).pavedSurface).toMatchObject({ status: 'known', sourceId: 'wake-greenways', verifiedAt: '2026-02-18' })
    }
    expect(wake([{ surface: 'ASPHALT' }, { surface: 'Concrete' }]).pavedSurface.value).toBe('Paved (asphalt/concrete)')
    expect(wake([{ surface: 'Asphalt/Concrete/Boardwlk' }]).pavedSurface.value).toBe('Paved (asphalt/boardwalk/concrete)')
    expect(wake([{ surface: 'Boardwalk/Concrete' }]).pavedSurface.value).toBe('Paved (boardwalk/concrete)')
  })

  it('maps natural surfaces to "Unpaved (natural surface)"', () => {
    for (const raw of ['NATIVE MATERIAL', 'Natural', 'Natural Surface', 'IMPORTED LOOSE MATERIAL', 'CHUNK WOOD', 'Mulch', 'Gravel']) {
      expect(wake([{ surface: raw }]).pavedSurface.value).toBe('Unpaved (natural surface)')
    }
  })

  it('says "Paved on some segments" for mixed surfaces and when others are not recorded', () => {
    expect(wake([{ surface: 'Asphalt' }, { surface: 'Natural' }]).pavedSurface.value).toBe('Paved on some segments')
    expect(wake([{ surface: 'Asphalt' }, { surface: ' ' }]).pavedSurface.value).toBe('Paved on some segments')
    expect(wake([{ surface: 'Natural' }, { surface: null }]).pavedSurface.value).toBe('Unpaved (natural surface) on some segments')
  })

  it('leaves blank, null, "Other" and unrecognised surfaces unknown', () => {
    for (const raw of [' ', null, undefined, 'OTHER', 'Wooden Bridge']) {
      const f = wake([{ surface: raw as string | null }]).pavedSurface
      expect(f.status).toBe('unknown')
      expect(f.value).toBeUndefined()
    }
  })

  it('states wheelchair access only when ACCESSIBILITY_STATUS says Accessible', () => {
    expect(wake([{ access: 'ACCESSIBLE' }, { access: 'Accessible' }]).wheelchair).toMatchObject({
      status: 'known',
      value: 'Accessible (per Wake County greenway data)',
      sourceId: 'wake-greenways',
      verifiedAt: '2026-02-18',
    })
    expect(wake([{ access: 'ACCESSIBLE' }, { access: 'NOT ACCESSIBLE' }]).wheelchair.value).toBe('Accessible on some segments (per Wake County greenway data)')
    expect(wake([{ access: 'ACCESSIBLE' }, { access: null }]).wheelchair.value).toBe('Accessible on some segments (per Wake County greenway data)')
  })

  it('keeps negative, unknown and blank accessibility values unknown, never "no"', () => {
    for (const raw of ['NOT ACCESSIBLE', 'NOT EVALUATED', ' ', null, undefined, 'Inaccessible']) {
      const f = wake([{ access: raw as string | null }, { access: 'NOT ACCESSIBLE' }]).wheelchair
      expect(f.status).toBe('unknown')
      expect(f.value).toBeUndefined()
    }
  })

  it('never infers wheelchair access from the surface', () => {
    const f = wake([{ surface: 'Asphalt', access: 'NOT EVALUATED' }, { surface: 'Concrete', access: null }])
    expect(f.pavedSurface.status).toBe('known')
    expect(f.wheelchair.status).toBe('unknown')
  })

  it('lists pavedSurface and wheelchair amenities only when fully confirmed', () => {
    expect(amenitiesOf(buildVisitFields({ wakeSegments: [{ surface: 'Asphalt', access: 'ACCESSIBLE' }], dates }))).toEqual(['pavedSurface', 'wheelchair'])
    // partial values stay known on the card but do not match a filter
    const partial = buildVisitFields({ wakeSegments: [{ surface: 'Asphalt', access: 'ACCESSIBLE' }, { surface: 'Natural', access: 'NOT ACCESSIBLE' }], dates })
    expect(byKey(partial).pavedSurface.status).toBe('known')
    expect(byKey(partial).wheelchair.status).toBe('known')
    expect(amenitiesOf(partial)).toEqual([])
    expect(amenitiesOf(buildVisitFields({ wakeSegments: [{ surface: 'Natural', access: 'NOT ACCESSIBLE' }], dates }))).toEqual([])
  })

  it('excludes Cary partial wheelchair and "Mostly paved" values from the filter too', () => {
    const some = buildVisitFields({ segments: [{ surftype: 'Asphalt', ada: 'Y' }, { surftype: 'Asphalt', ada: null }], dates })
    expect(amenitiesOf(some)).toEqual(['pavedSurface'])
    const mostly = buildVisitFields({ segments: [{ surftype: 'Asphalt' }, { surftype: 'Asphalt' }, { surftype: 'Limestone' }], dates })
    expect(byKey(mostly).pavedSurface.value).toMatch(/^Mostly paved/)
    expect(amenitiesOf(mostly)).toEqual([])
    expect(amenitiesOf(buildVisitFields({ segments: [{ surftype: 'Asphalt', ada: 'Y' }], dates }))).toEqual(['pavedSurface', 'wheelchair'])
  })

  it('validates wake-greenways wheelchair values only when affirmative', () => {
    const ids = new Set(['wake-greenways'])
    const detail = (value: string) => ({
      id: 'a',
      fields: buildVisitFields({ dates }).map((f) =>
        f.key === 'wheelchair' ? { ...f, status: 'known', value, sourceId: 'wake-greenways', verifiedAt: '2026-02-18' } : f,
      ),
    })
    expect(validateDetail(detail('Accessible on some segments (per Wake County greenway data)'), 'a', ids)).toEqual([])
    expect(validateDetail(detail('Not accessible'), 'a', ids).join()).toContain('affirmative')
  })
})

describe('entrance join', () => {
  const sq = [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
  const pt = (name: string, x: number, y: number) => ({ geometry: { coordinates: [x, y] }, properties: { NAME: name } })
  const place = { name: 'Oak Park', centroid: [-78.8, 35.8] as number[] }

  it('joins by park name near the place and by point inside the parcels, not adjacent parks', () => {
    const near = pt('oak  park', -78.8005, 35.8)
    const sameNameFar = pt('Oak Park', -78.0, 35.8)
    const inside = pt('Unnamed Gate', 0.5, 0.5)
    const adjacent = pt('Elm Park', 0.4, 0.4)
    const got = joinEntrances(place, { polygons: [sq] }, [near, sameNameFar, inside, adjacent], [], new Set(['elm park']))
    expect(got).toEqual([near, inside])
  })

  it('buildDetails writes one 14-field record per place', () => {
    const p = { id: 'wake-park-oak-park', name: 'Oak Park', aliases: [], centroid: place.centroid }
    const d = buildDetails([p], new Map([[p.id, { wake: { RESTROOMS: 'Yes' } }]]), [pt('Oak Park', -78.8005, 35.8)], {}, dates)
    expect(Object.keys(d)).toEqual([p.id])
    expect(d[p.id].fields.map((f: { key: string }) => f.key)).toEqual(ORDER)
    expect(byKey(d[p.id].fields).entrances.value).toBe('1 entrance (1 other)')
  })
})

describe('validation', () => {
  const fields = () => buildVisitFields({ wake: { RESTROOMS: 'Yes' }, dates })
  const sources = new Set(['wake-parks'])

  it('accepts a well-formed detail file', () => {
    expect(validateDetail({ id: 'a', fields: fields() }, 'a', sources)).toEqual([])
  })

  it('rejects a detail file missing a key, out of order, or with unevidenced known fields', () => {
    const missing = fields().filter((f) => f.key !== 'hours')
    expect(validateDetail({ id: 'a', fields: missing }, 'a', sources).join()).toContain('exactly')
    const swapped = fields()
    ;[swapped[0], swapped[1]] = [swapped[1], swapped[0]]
    expect(validateDetail({ id: 'a', fields: swapped }, 'a', sources).length).toBeGreaterThan(0)
    const noSource = fields().map((f) => (f.status === 'known' ? { ...f, sourceId: undefined } : f))
    expect(validateDetail({ id: 'a', fields: noSource }, 'a', sources).join()).toContain('sourceId')
    const noDate = fields().map((f) => (f.status === 'known' ? { ...f, verifiedAt: undefined } : f))
    expect(validateDetail({ id: 'a', fields: noDate }, 'a', sources).join()).toContain('verifiedAt')
    expect(validateDetail({ id: 'b', fields: fields() }, 'a', sources).join()).toContain('does not match')
  })

  it('rejects a known wheelchair value that is not from an accessibility source', () => {
    const bad = fields().map((f) =>
      f.key === 'wheelchair' ? { ...f, status: 'known', value: 'Accessible', sourceId: 'wake-parks', verifiedAt: '2026-09-01' } : f,
    )
    expect(validateDetail({ id: 'a', fields: bad }, 'a', sources).join()).toContain('wheelchair')
  })

  it('validateRelease requires a detail file per place and rejects orphans', () => {
    const src = { id: 'wake-parks', title: 'Parks in Wake County', name: 'W', url: 'https://example.org', license: 'CC0 1.0', retrievedAt: '2026-11-06T12:00:00.000Z' }
    const place = (id: string) => ({ id, name: id, aliases: [], category: 'park', county: 'Wake', centroid: [-78.8, 35.8], sourceIds: ['wake-parks'] })
    const catalog = { sources: [src], places: [place('a'), place('b')] }
    const res = validateRelease({ catalog, details: { a: { id: 'a', fields: fields() }, ghost: { id: 'ghost', fields: fields() } } })
    expect(res.errors.join('\n')).toContain('place "b" has no places/b.json')
    expect(res.errors.join('\n')).toContain('"ghost" is not in the catalog')
  })
})

describe('catalog amenities', () => {
  const src = { id: 'wake-parks', title: 'Parks in Wake County', name: 'W', url: 'https://example.org', license: 'CC0 1.0', retrievedAt: '2026-11-06T12:00:00.000Z' }
  const mk = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, aliases: [], category: 'park', county: 'Wake', centroid: [-78.8, 35.8], sourceIds: ['wake-parks'], ...extra })
  const det = (wake: Record<string, string>) => ({ id: 'a', fields: buildVisitFields({ wake, dates }) })
  const check = (place: object, details: object) => validateRelease({ catalog: { sources: [src], places: [place] }, details: { a: details } })

  it('lists known amenity keys in the fixed order and omits the list when empty', () => {
    const fields = buildVisitFields({ wake: { WALKINGTRAILS: 'Yes', PLAYGROUND: 'Yes', RESTROOMS: 'Yes', DOGPARK: 'No' }, dates })
    expect(amenitiesOf(fields)).toEqual(['restrooms', 'playground', 'walkingTrails'])
    expect(amenitiesOf(buildVisitFields({ dates }))).toEqual([])
    expect(AMENITY_KEYS).toEqual(['restrooms', 'parking', 'playground', 'picnicShelter', 'dogPark', 'walkingTrails', 'pavedSurface', 'wheelchair', 'water'])
  })

  it('passes when the catalog list equals the known detail fields', () => {
    expect(check(mk('a', { amenities: ['restrooms', 'playground'] }), det({ RESTROOMS: 'Yes', PLAYGROUND: 'Yes' })).errors).toEqual([])
    expect(check(mk('a'), det({})).errors).toEqual([])
  })

  it('fails when an amenity is listed but not known, missing, misordered or empty', () => {
    const d = det({ RESTROOMS: 'Yes', PLAYGROUND: 'Yes' })
    expect(check(mk('a', { amenities: ['restrooms', 'playground', 'dogPark'] }), d).errors.join()).toContain('do not match')
    expect(check(mk('a', { amenities: ['restrooms'] }), d).errors.join()).toContain('do not match')
    expect(check(mk('a'), d).errors.join()).toContain('do not match')
    expect(check(mk('a', { amenities: ['playground', 'restrooms'] }), d).errors.join()).toContain('do not match')
    expect(check(mk('a', { amenities: [] }), det({})).errors.join()).toContain('omitted when empty')
  })

  it('requires a dataset title on every catalog source', () => {
    const { title: _t, ...untitled } = src
    const res = validateRelease({ catalog: { sources: [untitled, { ...src, id: 'x', title: '  ' }], places: [mk('a')] } })
    expect(res.errors.join('\n')).toContain('source "wake-parks": dataset title missing')
    expect(res.errors.join('\n')).toContain('source "x": dataset title missing')
  })
})

