import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRelease } from '../pipeline/lib/release.mjs'
import { parseCatalog } from '../src/features/places/catalog'
import { createPlaceSearch } from '../src/features/search/searchIndex'
import {
  assignIds,
  carynUrl,
  centroid,
  groupGreenways,
  groupParks,
  normalize,
  pointInPolygon,
  registryTitle,
  slug,
  vertexNearestBboxCentre,
} from '../pipeline/scripts/build-catalog.mjs'
import type { Place } from '../src/types/place'


const readAbs = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))

const square = (x: number, y: number, s = 1) => [
  [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
    [x, y],
  ],
]
const parcel = (name: string | null, level: string, acres = 1, x = 0) => ({
  properties: { name, uselevel2: level, calcacreag: acres },
  geometry: { type: 'Polygon', coordinates: square(x, 0) },
})
const seg = (name: string, status: string, miles: number) => ({
  properties: { name, status, length_in_miles: miles / 5280 },
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
})

describe('normalize and slug', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalize('  Fred  G.\tBond   Metro Park ')).toBe('fred g. bond metro park')
    expect(normalize(null)).toBe('')
  })
  it('makes lowercase ascii hyphen slugs', () => {
    expect(slug("Annie L. Jones Park")).toBe('annie-l-jones-park')
    expect(slug("Mills & Café's  Park!")).toBe('mills-and-cafes-park')
  })
})

describe('carynUrl', () => {
  it('rewrites the old Cary domain to carync.gov and keeps the path', () => {
    const path = 'recreation-enjoyment/parks-greenways-environment/parks/dorothy-park'
    expect(carynUrl(`http://www.townofcary.org/${path}`)).toBe(`https://www.carync.gov/${path}`)
    expect(carynUrl(`https://www.townofcary.org/${path}`)).toBe(`https://www.carync.gov/${path}`)
    expect(carynUrl('https://www.carync.gov/x')).toBe('https://www.carync.gov/x')
    expect(carynUrl('http://example.org/x')).toBe('http://example.org/x')
  })
})

describe('assignIds', () => {
  it('reuses existing ids, adds new ones and sorts', () => {
    const out = assignIds({ 'p:b': 'keep-me' }, [
      { key: 'p:b', prefix: 'cary-park', name: 'B Renamed' },
      { key: 'p:a', prefix: 'cary-park', name: 'A Park' },
    ])
    expect(out).toEqual({ 'p:a': 'cary-park-a-park', 'p:b': 'keep-me' })
    expect(Object.keys(out)).toEqual(['p:a', 'p:b'])
  })
  it('throws when two keys would share an id', () => {
    expect(() =>
      assignIds({}, [
        { key: 'p:a b', prefix: 'x', name: 'A B' },
        { key: 'p:a-b', prefix: 'x', name: 'A-B' },
      ]),
    ).toThrow(/collision/i)
    expect(() => assignIds({ k1: 'same', k2: 'same' }, [])).toThrow(/share id/)
  })
})

describe('groupParks', () => {
  const groups = groupParks([
    parcel('Alpha Park', 'Existing Park', 2, 0),
    parcel(' alpha  park ', 'Natural Area', 3, 2),
    parcel('Beta Preserve', 'Natural Area'),
    parcel('Gamma Center', 'Community Use Facility'),
    parcel('Southbridge Greenway', 'Greenway Corridor'),
    parcel('Future Place', 'Future Park'),
    parcel(null, 'Existing Park'),
  ])
  it('excludes corridors, future parks and nameless records', () => {
    expect(groups.map((g) => g.key)).toEqual(['alpha park', 'beta preserve', 'gamma center'])
  })
  it('groups by normalized name, sums acres and prefers park', () => {
    const alpha = groups[0]
    expect(alpha.parcels).toBe(2)
    expect(alpha.acres).toBe(5)
    expect(alpha.polygons).toHaveLength(2)
    expect(alpha.category).toBe('park')
    expect(groups[1]).toMatchObject({ category: 'park', kind: 'natural area' })
    expect(groups[2]).toMatchObject({ category: 'community' })
  })
})

describe('groupGreenways', () => {
  const { kept, dropped } = groupGreenways([
    seg('Big Creek Greenway', 'Existing', 0.3),
    seg('big creek  greenway', 'Existing', 0.4),
    seg('Tiny Greenway', 'Existing', 0.2),
    seg('Main St Street-Side Trail', 'Existing', 5),
    seg('Foo Connector', 'Existing', 5),
    seg('Bar Sidewalk', 'Existing', 5),
    seg('Baz Side Path', 'Existing', 5),
    seg('Proposed Greenway', 'Proposed', 9),
  ])
  it('keeps existing groups of at least half a mile without excluded words', () => {
    expect(kept.map((g) => g.key)).toEqual(['big creek greenway'])
    expect(kept[0].miles).toBeCloseTo(0.7, 6)
  })
  it('drops short and excluded groups, and ignores proposed ones', () => {
    expect(dropped.map((g) => g.key).sort()).toEqual([
      'bar sidewalk',
      'baz side path',
      'foo connector',
      'main st street-side trail',
      'tiny greenway',
    ])
  })
})

describe('geometry helpers', () => {
  it('tests point in polygon with holes', () => {
    const outer = square(0, 0, 10)[0]
    const hole = square(4, 4, 2)[0]
    expect(pointInPolygon([1, 1], [outer])).toBe(true)
    expect(pointInPolygon([11, 1], [outer])).toBe(false)
    expect(pointInPolygon([5, 5], [outer, hole])).toBe(false)
  })
  it('area-weights the centroid', () => {
    expect(centroid([square(0, 0, 2)])).toEqual([1, 1])
    const [x] = centroid([square(0, 0, 1), square(10, 0, 3)])
    expect(x).toBeGreaterThan(10)
  })
  it('puts the trail pin on a vertex', () => {
    expect(vertexNearestBboxCentre([[0, 0], [1, 1], [10, 10]])).toEqual([1, 1])
  })
})

describe('generated catalog', () => {
  const catalog = readAbs(release.catalogPath)
  const places: Place[] = parseCatalog(catalog).places
  const ids = new Set(places.map((p) => p.id))
  const layers = {
    park: readAbs(release.layerPaths.parks).features,
    trail: readAbs(release.layerPaths.greenways).features,
  }

  it('has no sample source or places', () => {
    expect(catalog.sources.map((s: { id: string }) => s.id)).not.toContain('sample')
    expect(places.some((p) => p.sourceIds.includes('sample'))).toBe(false)
  })

  it('links every layer feature to a catalog place, with a core and an outside-core part at most per place and status (trails)', () => {
    const seen = new Map<string, number>()
    for (const f of [...layers.park, ...layers.trail]) {
      const isTrail = layers.trail.includes(f)
      expect(Object.keys(f.properties)).toEqual(isTrail ? ['placeId', 'status', 'outsideCore'] : ['placeId', 'outsideCore'])
      expect(typeof f.properties.outsideCore).toBe('boolean')
      expect(ids.has(f.properties.placeId)).toBe(true)
      seen.set(f.properties.placeId, (seen.get(f.properties.placeId) ?? 0) + 1)
    }
    for (const p of places.filter((x) => x.sourceIds.some((s) => s.startsWith('cary-')))) {
      expect(seen.get(p.id), p.id).toBeGreaterThanOrEqual(1)
      expect(seen.get(p.id), p.id).toBeLessThanOrEqual(layers.trail.some((f: any) => f.properties.placeId === p.id) ? 4 : 2)
    }
  })

  it('gives every place a coverage and drops outside ones', () => {
    for (const p of catalog.places) expect(['core', 'nearby']).toContain(p.coverage)
  })

  it('writes relationships that point at catalog places', () => {
    const { relationships } = readAbs(release.relationshipsPath)
    expect(relationships.length).toBeGreaterThan(0)
    for (const r of relationships) {
      expect(ids.has(r.from) && ids.has(r.to), JSON.stringify(r)).toBe(true)
      expect(['contained', 'nearby', 'curated']).toContain(r.kind)
      if (r.kind === 'nearby' && r.basis === 'along') {
        // Trail follows a creek: at least 300 m, no straight-line distance.
        expect(r.alongM, JSON.stringify(r)).toBeGreaterThanOrEqual(300)
        expect(r.from.startsWith('creek-'), JSON.stringify(r)).toBe(false)
        expect(r.to.startsWith('creek-'), JSON.stringify(r)).toBe(true)
      } else if (r.kind === 'nearby') {
        expect(Number.isInteger(r.distanceM), JSON.stringify(r)).toBe(true)
        expect(['within-400m', 'nearest']).toContain(r.basis)
        expect(r.distanceM).toBeLessThanOrEqual(r.basis === 'nearest' ? 2000 : 400)
      }
    }
  })

  it('does not accept localOnly from JSON', () => {
    const bad = { ...catalog, places: [{ ...catalog.places[0], localOnly: true }] }
    expect(parseCatalog(bad).places[0].localOnly).toBeUndefined()
  })

  it('rejects non-https place urls', () => {
    const bad = { ...catalog, places: [{ ...catalog.places[0], url: 'http://example.org' }] }
    expect(() => parseCatalog(bad)).toThrow(/url/)
  })

  it('answers the brief search cases', () => {
    const search = createPlaceSearch(places)
    expect(search('Hemlok Blufs')[0].name).toBe('Hemlock Bluffs Nature Preserve')
    expect(search('Bond park')[0].name).toBe('Fred G. Bond Metro Park')
    const att = places.find((p) => p.name === 'American Tobacco Trail')
    if (att) expect(search('ATT')[0].id).toBe(att.id)
  })
})

describe('catalog source titles', () => {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL('../pipeline/sources.config.json', import.meta.url)), 'utf8')) as {
    id: string
    title: string
  }[]
  const titleOf = (id: string) => registry.find((r) => r.id === id)?.title

  it('maps catalog ids to the registry entry title', () => {
    expect(registryTitle(registry, 'cary-parks')).toBe(titleOf('parks-and-recreation-feature-polygons'))
    expect(registryTitle(registry, 'cary-greenways')).toBe(titleOf('proposed-greenway-trails'))
    expect(registryTitle(registry, 'cary-park-features')).toBe(titleOf('parks-and-recreation-feature-map'))
    expect(registryTitle(registry, 'wake-greenways')).toBe(titleOf('wake-greenways'))
    expect(() => registryTitle(registry, 'nope')).toThrow()
  })

  it('the built catalog gives every source its registry title', () => {
    // The published release, not pipeline/.staging (git-ignored, absent in CI).
    const catalog = JSON.parse(readFileSync(release.catalogPath, 'utf8'))
    const registryIds: Record<string, string> = {
      'cary-parks': 'parks-and-recreation-feature-polygons',
      'cary-greenways': 'proposed-greenway-trails',
      'cary-park-features': 'parks-and-recreation-feature-map',
    }
    for (const s of catalog.sources) expect(s.title).toBe(titleOf(registryIds[s.id] ?? s.id))
  })
})
