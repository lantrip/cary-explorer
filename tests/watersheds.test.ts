import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRelease } from '../pipeline/lib/release.mjs'
import {
  intersectsScope,
  mapWatersheds,
  prepareWatershed,
  simplifyPolygons,
  watershedDescription,
  watershedPlaceName,
  watershedRelationships,
  watershedsFor,
} from '../pipeline/lib/watersheds.mjs'
import { validateRegistry } from '../pipeline/lib/snapshot-core.mjs'
// @ts-expect-error no declaration file for the validator
import { validateRelease } from '../pipeline/lib/validate.mjs'
import { LAYER_NAMES, parseLayerFeatures } from '../src/features/map/layers'
import { parseCatalog } from '../src/features/places/catalog'
import { connectionsFor, divideNote, indexRelationships, parseRelationships } from '../src/features/places/relationships'
import { isGeometryShown } from '../src/features/themes/layerSelection'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import type { Place } from '../src/types/place'

const sq = (x: number, y: number, s = 1) => [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]]
const f12 = (huc12: string, name: string, x: number) => ({
  properties: { huc12, name },
  geometry: { type: 'Polygon', coordinates: sq(x, 0) },
})
const names8 = { features: [{ properties: { huc8: '03020201', name: 'Upper Neuse' }, geometry: null }] }
const names6 = { features: [{ properties: { huc6: '030202', name: 'Neuse' }, geometry: null }] }
const mapped = mapWatersheds({
  huc12: { features: [f12('030202010102', 'Crabtree Creek', 0), f12('030202010101', 'Upper Foo Watershed', 1), f12('bad', 'x', 5)] },
  huc8: names8,
  huc6: names6,
})
const prepared = mapped.map(prepareWatershed)

describe('WBD mapping', () => {
  it('names, describes and sorts watersheds from the data only', () => {
    expect(mapped.map((w) => w.huc12)).toEqual(['030202010101', '030202010102'])
    expect(watershedPlaceName('Crabtree Creek')).toBe('Crabtree Creek watershed')
    expect(watershedPlaceName('Upper Foo Watershed')).toBe('Upper Foo Watershed')
    expect(mapped[1].placeName).toBe('Crabtree Creek watershed')
    expect(watershedDescription(mapped[1])).toBe('Part of the Neuse River Basin (HUC-8 Upper Neuse).')
    expect(watershedDescription({ huc12: '1', huc6Name: undefined, huc8Name: undefined })).not.toMatch(/flow|downstream/i)
  })
  it('keeps the polygons valid when simplified and tests scope overlap', () => {
    const out = simplifyPolygons(mapped[1].polygons, 10)
    expect(out[0][0].length).toBeGreaterThanOrEqual(4)
    const scope = { polys: [{ polygon: sq(0.5, 0.5, 0.2), bbox: [0.5, 0.5, 0.7, 0.7] }], bbox: [0.5, 0.5, 0.7, 0.7] }
    expect(intersectsScope(prepared[1], scope)).toBe(true)
    expect(intersectsScope(prepared[0], { polys: [{ polygon: sq(9, 9, 1), bbox: [9, 9, 10, 10] }], bbox: [9, 9, 10, 10] })).toBe(false)
  })
  it('registers the three WBD snapshots with an open licence and a bbox', () => {
    const reg = JSON.parse(readFileSync(new URL('../pipeline/sources.config.json', import.meta.url), 'utf8'))
    const wbd = reg.filter((s: { id: string }) => s.id.startsWith('usgs-wbd-'))
    expect(wbd).toHaveLength(3)
    for (const s of wbd) expect([s.licenceStatus, s.enabled, s.bbox.length]).toEqual(['open', true, 4])
    expect(validateRegistry([{ ...wbd[0], bbox: [1, 2] }]).join()).toMatch(/bbox/)
  })
})

describe('park to watershed assignment', () => {
  const ids = new Map(mapped.map((w, i) => [w.huc12, `ws-${i}`]))
  it('puts a park inside one watershed in one watershed', () => {
    const park = { id: 'p', kind: 'park' as const, centroid: [1.5, 0.5], polygons: [sq(1.4, 0.4, 0.2)] }
    expect(watershedsFor(park, prepared)).toEqual(['030202010101'])
  })
  it('lists both watersheds when a park crosses the divide', () => {
    const park = { id: 'p', kind: 'park' as const, centroid: [0.95, 0.5], polygons: [sq(0.8, 0.4, 0.3)] }
    expect(watershedsFor(park, prepared).sort()).toEqual(['030202010101', '030202010102'])
  })
  it('uses the centroid for a trail and reports places with no watershed', () => {
    const items = [
      { id: 't', kind: 'trail' as const, centroid: [0.5, 0.5] },
      { id: 'far', kind: 'park' as const, centroid: [50, 50] },
    ]
    const r = watershedRelationships(items, prepared, ids)
    expect(r.relationships).toEqual([{ from: 't', to: 'ws-1', kind: 'contained', basis: 'watershed' }])
    expect(r.notDetermined).toEqual(['far'])
  })
})

describe('trail to watershed shares', () => {
  const ids = new Map(mapped.map((w, i) => [w.huc12, `ws-${i}`]))
  // x runs west to east: 0-1 is 030202010102 (ws-1), 1-2 is 030202010101 (ws-0). Vertices every 0.1 degree.
  const trail = (x0: number, x1: number) =>
    [Array.from({ length: Math.round((x1 - x0) / 0.1) + 1 }, (_, i) => [Math.round((x0 + i * 0.1) * 10) / 10, 0.5])]
  const link = (lines: number[][][], centroid = lines[0][0]) =>
    watershedRelationships([{ id: 't', kind: 'trail' as const, centroid, lines }], prepared, ids).relationships

  it('links every watershed holding at least 15% of the length, each with its share', () => {
    expect(link(trail(0.3, 1.9))).toEqual([
      { from: 't', to: 'ws-0', kind: 'contained', basis: 'watershed', share: 0.56 },
      { from: 't', to: 'ws-1', kind: 'contained', basis: 'watershed', share: 0.44 },
    ])
    expect(link(trail(0.1, 1.3)).map((r) => [r.to, r.share])).toEqual([['ws-1', 0.75], ['ws-0', 0.25]])
  })
  it('keeps a single link, without a share, when one watershed holds 80% or more', () => {
    const r = link(trail(0.1, 1.1)) // 90% in ws-1
    expect(r).toEqual([{ from: 't', to: 'ws-1', kind: 'contained', basis: 'watershed' }])
  })
  it('measures the whole trail, not the centroid', () => {
    expect(link(trail(0.1, 1.1), [1.5, 0.5]).map((x) => x.to)).toEqual(['ws-1'])
  })
  it('never reports a trail outside every watershed as linked', () => {
    const r = watershedRelationships([{ id: 'far', kind: 'trail' as const, centroid: [50, 50], lines: trail(50, 50.5) }], prepared, ids)
    expect(r.relationships).toEqual([])
    expect(r.notDetermined).toEqual(['far'])
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

describe('watershed relationship wording', () => {
  const rels = parseRelationships({
    relationships: [
      { from: 'park', to: 'w1', kind: 'contained', basis: 'watershed' },
      { from: 'park', to: 'w2', kind: 'contained', basis: 'watershed' },
      { from: 'park', to: 'n1', kind: 'nearby', distanceM: 50, basis: 'within-400m' },
      { from: 'park', to: 'n2', kind: 'nearby', distanceM: 60, basis: 'within-400m' },
      { from: 'trail', to: 'park', kind: 'contained' },
    ],
  })
  const byId = new Map(
    [
      place('park', 'Example Park'),
      place('w1', 'Crabtree Creek watershed', 'water'),
      place('w2', 'Walnut Creek watershed', 'water'),
      place('n1', 'Near One'),
      place('n2', 'Near Two'),
      place('trail', 'Example Greenway', 'trail'),
    ].map((p) => [p.id, p]),
  )
  const index = indexRelationships(rels)

  it('keeps the watershed basis and says "In the ... watershed", never "runs through"', () => {
    expect(rels[0].basis).toBe('watershed')
    const c = connectionsFor('park', index, byId)
    expect(c.map((x) => x.label).slice(0, 2)).toEqual(['In the Crabtree Creek watershed', 'In the Walnut Creek watershed'])
    expect(c).toHaveLength(3)
    expect(c.slice(0, 2).some((x) => /runs through/i.test(x.label))).toBe(false)
  })
  it('puts watershed links before the other links', () => {
    expect(connectionsFor('park', index, byId).map((x) => x.place.id).slice(0, 2)).toEqual(['w1', 'w2'])
  })
  it('labels the watershed side with the park name and does not claim flow', () => {
    expect(connectionsFor('w1', index, byId)[0].label).toBe('Example Park is in this watershed')
    for (const x of connectionsFor('park', index, byId)) expect(x.label).not.toMatch(/flow|downstream|upstream/i)
  })
  it('labels a trail by how many watersheds it crosses and never claims flow', () => {
    const multi = indexRelationships(
      parseRelationships({
        relationships: [
          { from: 'trail', to: 'w1', kind: 'contained', basis: 'watershed', share: 0.6 },
          { from: 'trail', to: 'w2', kind: 'contained', basis: 'watershed', share: 0.4 },
          { from: 'solo', to: 'w1', kind: 'contained', basis: 'watershed' },
        ],
      }),
    )
    const names = new Map([...byId, ['solo', place('solo', 'Solo Greenway', 'trail')]])
    expect(connectionsFor('trail', multi, names).map((x) => x.label)).toEqual([
      'Passes through the Crabtree Creek watershed',
      'Passes through the Walnut Creek watershed',
    ])
    expect(connectionsFor('solo', multi, names)[0].label).toBe('In the Crabtree Creek watershed')
    expect(connectionsFor('w1', multi, names).map((x) => x.label)).toEqual([
      'Example Greenway passes through this watershed',
      'Solo Greenway passes through this watershed',
    ])
    expect(parseRelationships({ relationships: [{ from: 'a', to: 'b', kind: 'nearby', share: 0.5 }] })[0]).not.toHaveProperty('share')
  })
  it('explains a divide only for parks in two watersheds', () => {
    expect(divideNote('park', index, byId)).toBe('This park sits on a divide between two watersheds.')
    expect(divideNote('trail', index, byId)).toBeNull()
    expect(divideNote('w1', index, byId)).toBeNull()
  })
})

describe('water layer', () => {
  it('is a named layer whose polygons parse as areas and show with the Water theme', () => {
    expect(LAYER_NAMES).toContain('water')
    const out = parseLayerFeatures({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { placeId: 'watershed-1', outsideCore: false }, geometry: { type: 'MultiPolygon', coordinates: [sq(-78.9, 35.8, 0.1)] } },
      ],
    })
    expect(out.map((f) => [f.get('placeId'), f.get('kind')])).toEqual([['watershed-1', 'area']])
    expect(isGeometryShown('area', 'existing', [], 'water')).toBe(true)
    expect(isGeometryShown('area', 'existing', [])).toBe(false)
  })
})

describe('published data', () => {
  const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
  const catalog = parseCatalog(read(release.catalogPath))
  const rels = read(release.relationshipsPath).relationships as { from: string; to: string; kind: string; basis?: string }[]
  const water = catalog.places.filter((p) => p.category === 'water')
  const waterIds = new Set(water.map((p) => p.id))
  const links = rels.filter((r) => r.basis === 'watershed')

  it('has HUC-12 watershed places with a layer feature each and the USGS source', () => {
    expect(water.length).toBeGreaterThan(30)
    expect(catalog.sources.some((s) => s.id === 'usgs-wbd-huc12' && s.license)).toBe(true)
    const layer = read(release.layerPaths.water)
    expect(new Set(layer.features.map((f: { properties: { placeId: string } }) => f.properties.placeId))).toEqual(waterIds)
    for (const p of water) {
      expect(p.name).toMatch(/watershed$/i)
      expect(p.description).toMatch(/^Part of the .+ River Basin \(HUC-8 .+\)\.$/)
    }
  })
  it('gives every catalog park and trail a watershed link, or counts it as not determined', () => {
    const linked = new Set(links.map((r) => r.from))
    const notDetermined = catalog.places.filter((p) => (p.category === 'park' || p.category === 'trail') && !linked.has(p.id))
    expect(notDetermined.length).toBe(0)
    for (const r of links) {
      expect(r.kind).toBe('contained')
      expect(waterIds.has(r.to)).toBe(true)
    }
    const perPark = new Map<string, number>()
    for (const r of links) perPark.set(r.from, (perPark.get(r.from) ?? 0) + 1)
    expect([...perPark.values()].every((n) => n >= 1 && n <= 3)).toBe(true)
    expect([...perPark.values()].some((n) => n === 2)).toBe(true)
  })
  it('passes the release gates for water', () => {
    const layers = Object.fromEntries(Object.entries(release.layerPaths).map(([k, p]) => [k, read(p as string)]))
    const r = validateRelease({ catalog: read(release.catalogPath), layers, relationships: { relationships: rels } })
    expect((r.errors as string[]).filter((e) => /watershed|water/i.test(e))).toEqual([])
  })
})
