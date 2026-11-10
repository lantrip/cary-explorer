import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALONG_MIN_M,
  alongLengthM,
  creekDescription,
  creekPin,
  creekRelationships,
  groupCreeks,
  midpoint,
  simplifyCreekLines,
} from '../pipeline/lib/creeks.mjs'
import { haversineM, prepare } from '../pipeline/lib/geo.mjs'
import { readRelease } from '../pipeline/lib/release.mjs'
import { validateRegistry } from '../pipeline/lib/snapshot-core.mjs'
import { mapWatersheds, prepareWatershed, watershedRelationships } from '../pipeline/lib/watersheds.mjs'
import { parseLayerFeatures } from '../src/features/map/layers'
import { parseCatalog } from '../src/features/places/catalog'
import { connectionsFor, indexRelationships, moreWatershedsNote, parseRelationships } from '../src/features/places/relationships'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import type { Place } from '../src/types/place'

const box = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
})
const scope = { nearby: prepare(box(-78.9, 35.7, -78.6, 35.9)) }
const line = (x0: number, x1: number, y = 35.8) => [[x0, y], [(x0 + x1) / 2, y], [x1, y]]
const feature = (name: string, id: string, coordinates: number[][], gnisid = 1) => ({
  properties: { gnisidlabel: name, gnisid, id3dhp: id },
  geometry: { type: 'LineString', coordinates },
})

describe('grouping named flowlines into creeks', () => {
  it('chains segments within 200 m and keeps far-apart same-name streams separate', () => {
    const creeks = groupCreeks(
      [
        feature('Foo Creek', 'a', line(-78.8, -78.79)),
        feature('Foo Creek', 'b', line(-78.789, -78.78)), // ~90 m gap: same creek
        feature('Foo Creek', 'c', line(-78.7, -78.69)), // kilometres away: another creek of the same name
        feature('Bar Branch', 'd', line(-78.75, -78.745), 2),
      ],
      scope,
    )
    expect(creeks.map((c) => [c.name, c.ids])).toEqual([
      ['Foo Creek', ['a', 'b']],
      ['Foo Creek', ['c']],
      ['Bar Branch', ['d']],
    ])
    expect(creeks[0].lengthM).toBeGreaterThan(creeks[1].lengthM)
  })
  it('splits at a gap over 200 m and keeps only the part inside the study area', () => {
    const gap = groupCreeks([feature('Foo Creek', 'a', line(-78.8, -78.79)), feature('Foo Creek', 'b', line(-78.7875, -78.78))], scope)
    expect(gap).toHaveLength(2) // ~230 m apart
    const clipped = groupCreeks([feature('Foo Creek', 'a', line(-79.0, -78.95)), feature('Foo Creek', 'b', line(-78.99, -78.93))], scope)
    expect(clipped).toEqual([]) // wholly outside the nearby polygon
    const part = groupCreeks([feature('Foo Creek', 'a', [[-78.95, 35.8], [-78.85, 35.8]])], scope)
    expect(part[0].lines[0].every((p: number[]) => p[0] >= -78.9001)).toBe(true)
  })
  it('puts the pin on the line, near its middle, in an allowed place only', () => {
    const l = line(-78.8, -78.79)
    const m = midpoint(l)
    expect(m[1]).toBeCloseTo(35.8, 6)
    expect(haversineM(l[0], m)).toBeCloseTo(haversineM(m, l[2]), -1)
    expect(creekPin([l], () => true)).toEqual(m)
    expect(creekPin([l], () => false)).toBeNull()
    expect(simplifyCreekLines([[[0, 0], [0, 0]]], 10)).toEqual([[[0, 0], [0, 0]]])
  })
  it('describes length only: no flow, downstream or quality claim', () => {
    expect(creekDescription('Swift Creek', 7700)).toBe('Stream, about 4.8 miles in this area (USGS hydrography).')
    expect(creekDescription('Foo Creek', 1609.344)).toBe('Stream, about 1 mile in this area (USGS hydrography).')
    expect(creekDescription('Neuse River', 20000)).toMatch(/^River, about 12\.4 miles/)
    expect(creekDescription('Swift Creek', 7700)).not.toMatch(/flow|downstream|upstream|quality|clean|polluted/i)
  })
})

describe('trail and park links', () => {
  const creek = { id: 'creek-foo', lines: [line(-78.8, -78.79)] } // ~900 m
  const trail = (id: string, x0: number, x1: number, y: number) => ({ id, kind: 'trail' as const, lines: [line(x0, x1, y)] })
  const park = (id: string, x0: number, x1: number) => ({
    id,
    kind: 'park' as const,
    polygons: [box(x0, 35.799, x1, 35.801).coordinates],
  })

  it('measures how much of a trail lies within 50 m of the creek', () => {
    const m = alongLengthM([line(-78.8, -78.795, 35.8003)], creek.lines)
    expect(m).toBeGreaterThan(430)
    expect(m).toBeLessThan(470)
    expect(alongLengthM([line(-78.8, -78.795, 35.8015)], creek.lines)).toBe(0) // ~165 m away
  })
  it('links a trail only when 300 m or more lies within 50 m of the creek', () => {
    const links = creekRelationships(
      [creek],
      [
        trail('long-near', -78.8, -78.795, 35.8003),
        trail('short-near', -78.8, -78.7975, 35.8003), // ~230 m
        trail('far', -78.8, -78.795, 35.8015), // ~165 m away
      ],
    )
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ from: 'long-near', to: 'creek-foo', kind: 'nearby', basis: 'along' })
    expect(links[0].alongM).toBeGreaterThanOrEqual(ALONG_MIN_M)
    expect(links[0].alongM! % 10).toBe(0)
  })
  it('links a creek to a park when at least 100 m of it is inside', () => {
    const links = creekRelationships([creek], [park('big', -78.8, -78.795), park('tiny', -78.795, -78.7940), park('away', -78.7, -78.69)])
    expect(links).toEqual([{ from: 'creek-foo', to: 'big', kind: 'contained' }]) // tiny holds ~90 m
  })
  it('puts a creek in the watershed(s) that hold its length (15% / 80% rule)', () => {
    const sq = (x: number) => ({ type: 'Polygon', coordinates: box(x, 35.7, x + 0.0075, 35.9).coordinates })
    const ws = mapWatersheds({
      huc12: {
        features: [
          { properties: { huc12: '030202010101', name: 'West' }, geometry: sq(-78.8) },
          { properties: { huc12: '030202010102', name: 'East' }, geometry: sq(-78.7925) },
        ],
      },
      huc8: { features: [] },
      huc6: { features: [] },
    }).map(prepareWatershed)
    const ids = new Map([['030202010101', 'w-west'], ['030202010102', 'w-east']])
    const dense = [Array.from({ length: 13 }, (_, i) => [-78.8 + i * 0.001 * (10 / 12), 35.8])] // 12 equal steps over the creek's ~0.0083 degrees
    const r = watershedRelationships([{ id: 'creek-foo', kind: 'creek', centroid: [-78.795, 35.8], lines: dense }], ws, ids)
    expect(r.relationships.map((x) => [x.to, x.share])).toEqual([['w-west', 0.75], ['w-east', 0.25]])
  })
})

const place = (id: string, name: string, category: Place['category'] = 'park'): Place => ({
  id,
  name,
  aliases: [],
  category,
  theme: CATEGORY_THEME[category],
  municipality: 'Cary',
  centroid: [-78.8, 35.8],
  description: '',
  sourceIds: ['s'],
})

describe('creek wording and the connected slots', () => {
  const rels = parseRelationships({
    relationships: [
      { from: 'trail', to: 'creek', kind: 'nearby', basis: 'along', alongM: 1610 },
      { from: 'creek', to: 'park', kind: 'contained' },
      { from: 'creek', to: 'w1', kind: 'contained', basis: 'watershed', share: 0.7 },
      { from: 'creek', to: 'w2', kind: 'contained', basis: 'watershed', share: 0.3 },
      { from: 'bad', to: 'creek', kind: 'nearby', basis: 'along', alongM: -5 },
    ],
  })
  const byId = new Map(
    [
      place('trail', 'Swift Creek Greenway', 'trail'),
      place('creek', 'Swift Creek', 'water'),
      place('park', 'Hemlock Bluffs Nature Preserve'),
      place('w1', 'Lake Wheeler-Swift Creek watershed', 'water'),
      place('w2', 'Lake Benson-Swift Creek watershed', 'water'),
      place('bad', 'Bad', 'trail'),
    ].map((p) => [p.id, p]),
  )
  const index = indexRelationships(rels)

  it('parses the along basis and drops a bad length', () => {
    expect(rels[0]).toEqual({ from: 'trail', to: 'creek', kind: 'nearby', basis: 'along', alongM: 1610 })
    expect(rels[4]).not.toHaveProperty('alongM')
    expect(parseRelationships({ relationships: [{ from: 'a', to: 'b', kind: 'nearby', alongM: 500 }] })[0]).not.toHaveProperty('alongM')
  })
  it('labels the trail side and the creek side of an along link', () => {
    expect(connectionsFor('trail', index, byId)[0]).toMatchObject({ place: { id: 'creek' }, label: 'Follows Swift Creek for about 1.0 mi' })
    expect(connectionsFor('creek', index, byId).map((c) => c.label)).toContain('Swift Creek Greenway follows this creek')
  })
  it('labels a park and a creek without a flow claim', () => {
    const labels = connectionsFor('creek', index, byId).map((c) => c.label)
    expect(labels).toContain('Runs through Hemlock Bluffs Nature Preserve')
    expect(connectionsFor('park', index, byId)[0].label).toBe('Swift Creek runs through this park')
    for (const l of labels) expect(l).not.toMatch(/flows?\b|downstream|upstream/i)
  })
  it('shows one watershed line, then contained/along links, and notes the rest in plain text', () => {
    const c = connectionsFor('creek', index, byId)
    expect(c.map((x) => x.place.id)).toEqual(['w1', 'trail', 'park'])
    expect(c[0].label).toBe('Passes through the Lake Wheeler-Swift Creek watershed')
    expect(c.filter((x) => /watershed/.test(x.label))).toHaveLength(1)
    expect(moreWatershedsNote('creek', index, byId)).toBe('and 1 more watershed')
    expect(moreWatershedsNote('trail', index, byId)).toBeNull()
  })
  it('keeps nearby places on a long trail that crosses several watersheds', () => {
    const many = indexRelationships(
      parseRelationships({
        relationships: [
          { from: 't', to: 'w1', kind: 'contained', basis: 'watershed', share: 0.4 },
          { from: 't', to: 'w2', kind: 'contained', basis: 'watershed', share: 0.35 },
          { from: 't', to: 'w3', kind: 'contained', basis: 'watershed', share: 0.25 },
          { from: 'p1', to: 't', kind: 'nearby', distanceM: 120, basis: 'within-400m' },
          { from: 'p2', to: 't', kind: 'nearby', distanceM: 40, basis: 'within-400m' },
          { from: 't', to: 'p3', kind: 'contained' },
          { from: 't', to: 'c1', kind: 'nearby', basis: 'along', alongM: 900 },
        ],
      }),
    )
    const names = new Map(
      [
        place('t', 'Long Greenway', 'trail'),
        place('w1', 'A watershed', 'water'),
        place('w2', 'B watershed', 'water'),
        place('w3', 'C watershed', 'water'),
        place('p1', 'Park One'),
        place('p2', 'Park Two'),
        place('p3', 'Park Three'),
        place('c1', 'Some Creek', 'water'),
      ].map((p) => [p.id, p]),
    )
    const c = connectionsFor('t', many, names)
    expect(c).toHaveLength(3)
    expect(c[0].place.id).toBe('w1')
    expect(c.slice(1).map((x) => x.place.id).sort()).toEqual(['c1', 'p3']) // contained and along beat nearby
    expect(moreWatershedsNote('t', many, names)).toBe('and 2 more watersheds')
    // With no contained or along link, the closest nearby places fill the slots.
    const near = indexRelationships(rels.slice(0, 0).concat(parseRelationships({ relationships: [
      { from: 't', to: 'w1', kind: 'contained', basis: 'watershed' },
      { from: 'p1', to: 't', kind: 'nearby', distanceM: 120, basis: 'within-400m' },
      { from: 'p2', to: 't', kind: 'nearby', distanceM: 40, basis: 'within-400m' },
    ] })))
    expect(connectionsFor('t', near, names).map((x) => x.place.id)).toEqual(['w1', 'p2', 'p1'])
  })
})

describe('creek source', () => {
  it('registers the 3DHP snapshot with an open licence, a bbox and the named-channel filter', () => {
    const reg = JSON.parse(readFileSync(new URL('../pipeline/sources.config.json', import.meta.url), 'utf8'))
    const s = reg.find((x: { id: string }) => x.id === 'usgs-3dhp-streams')
    expect([s.licenceStatus, s.enabled, s.bbox.length]).toEqual(['open', true, 4])
    expect(s.where).toMatch(/gnisidlabel IS NOT NULL/)
    expect(validateRegistry([s]).filter((e: string) => !/duplicate/.test(e))).toEqual([])
  })
})

describe('published creeks', () => {
  const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
  const catalog = parseCatalog(read(release.catalogPath))
  const rels = read(release.relationshipsPath).relationships as {
    from: string
    to: string
    kind: string
    basis?: string
    alongM?: number
  }[]
  const creeks = catalog.places.filter((p) => p.id.startsWith('creek-'))
  const byId = new Map(catalog.places.map((p) => [p.id, p]))
  const find = (name: string) => creeks.filter((p) => p.name === name)
  const links = (id: string) => rels.filter((r) => r.from === id || r.to === id)

  it('has creek Water places with a stream line in the water layer and the USGS source', () => {
    expect(creeks.length).toBeGreaterThan(100)
    expect(catalog.sources.some((s) => s.id === 'usgs-3dhp-streams' && s.license)).toBe(true)
    const water = read(release.layerPaths.water)
    const features = water.features as { properties: { placeId: string }; geometry: { type: string } }[]
    const kinds = new Map<string, string>()
    for (const f of features) kinds.set(f.properties.placeId, f.geometry.type)
    for (const c of creeks) {
      expect(c.category).toBe('water')
      expect(c.sourceIds).toEqual(['usgs-3dhp-streams'])
      expect(c.description).toMatch(/^(Stream|River), about [\d.]+ miles? in this area \(USGS hydrography\)\.$/)
      expect(kinds.get(c.id), c.id).toBe('MultiLineString')
    }
    expect(parseLayerFeatures(water).filter((f) => f.get('kind') === 'line').length).toBeGreaterThanOrEqual(creeks.length)
    expect(new Set(creeks.map((c) => c.id)).size).toBe(creeks.length)
  })
  it('puts every creek in at least one watershed, with no flow wording', () => {
    for (const c of creeks) {
      const ws = rels.filter((r) => r.from === c.id && r.basis === 'watershed')
      expect(ws.length, c.name).toBeGreaterThanOrEqual(1)
      for (const r of ws) expect(byId.get(r.to)?.name, c.name).toMatch(/watershed$/i)
      expect(c.description).not.toMatch(/flow|downstream|upstream|quality/i)
    }
  })
  it('only links a trail to a creek when the trail follows it, and a creek to a park by containment', () => {
    for (const r of rels.filter((x) => x.basis === 'along')) {
      expect(byId.get(r.from)?.category).toBe('trail')
      expect(r.to.startsWith('creek-')).toBe(true)
      expect(r.alongM).toBeGreaterThanOrEqual(ALONG_MIN_M)
    }
    for (const r of rels.filter((x) => x.from.startsWith('creek-') && x.kind === 'contained' && x.basis !== 'watershed')) {
      expect(byId.get(r.to)?.category).toBe('park')
    }
  })
  it('spot check: Swift Creek and Swift Creek Greenway follow each other', () => {
    const trail = catalog.places.find((p) => p.name === 'Swift Creek Greenway' && p.category === 'trail')!
    const along = rels.filter((r) => r.basis === 'along' && r.from === trail.id && byId.get(r.to)?.name === 'Swift Creek')
    expect(along.length).toBeGreaterThanOrEqual(1)
    expect(along[0].alongM).toBeGreaterThanOrEqual(ALONG_MIN_M)
    const index = indexRelationships(parseRelationships({ relationships: rels }))
    const fromTrail = connectionsFor(trail.id, index, byId).map((c) => c.label)
    expect(fromTrail.some((l) => /^Follows Swift Creek for about [\d.]+ mi$/.test(l))).toBe(true)
    const creekId = along[0].to
    expect(connectionsFor(creekId, index, byId).some((c) => c.label === 'Swift Creek Greenway follows this creek')).toBe(true)
  })
  it('spot check: Black Creek Greenway follows the stream USGS names Coles Branch, not Black Creek', () => {
    // Cary's greenway is named Black Creek Greenway, but the USGS name of the stream it runs beside is Coles Branch;
    // the Black Creek in the 3DHP data is a different stream in southern Wake County, so no link is made to it.
    const trail = catalog.places.find((p) => p.name === 'Black Creek Greenway' && p.category === 'trail')!
    const followed = links(trail.id)
      .filter((r) => r.basis === 'along')
      .map((r) => byId.get(r.to)?.name)
    expect(followed).toContain('Coles Branch')
    expect(followed).not.toContain('Black Creek')
    for (const c of find('Black Creek')) expect(links(c.id).some((r) => r.basis === 'along' && r.from === trail.id)).toBe(false)
  })
  it('includes the well-known creeks', () => {
    for (const n of ['Swift Creek', 'Crabtree Creek', 'Black Creek', 'White Oak Creek', 'Walnut Creek', 'Middle Creek', 'Reedy Branch']) {
      expect(find(n).length, n).toBeGreaterThanOrEqual(1)
    }
  })
})
