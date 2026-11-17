// Watershed, basin and creek card copy (#22): basin lines, the Cary two-basin line, creek copy and a spot check of the links
// against the committed HUC-12 snapshot (pipeline/sources/usgs/wbd-huc12/, not the git-ignored staging folder).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { creekCardDescription } from '../pipeline/lib/creeks.mjs'
import { pointInPolygon, polygonsOf } from '../pipeline/lib/geo.mjs'
import { readRelease } from '../pipeline/lib/release.mjs'
import { cityBasinLine, cityBasins } from '../pipeline/lib/watersheds.mjs'
import { parseCatalog } from '../src/features/places/catalog'
import {
  basinOf,
  connectionsFor,
  indexRelationships,
  parseRelationships,
  watershedNotDetermined,
} from '../src/features/places/relationships'
import type { Place } from '../src/types/place'

const FORBIDDEN = /\b(flows?|flowing|drains?|draining|downstream|upstream|drinking water|supply|utility|utilities)\b/i
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))
const catalog = parseCatalog(read(release.catalogPath))
const rels = read(release.relationshipsPath).relationships as { from: string; to: string; basis?: string; share?: number }[]
const byId = new Map(catalog.places.map((p) => [p.id, p]))
const watershedPlaces = catalog.places.filter((p) => p.id.startsWith('watershed-'))
const creeks = catalog.places.filter((p) => p.id.startsWith('creek-'))
const wsLinks = rels.filter((r) => r.basis === 'watershed')
const linksOf = (id: string) => wsLinks.filter((r) => r.from === id)

const mk = (id: string, name: string, category: Place['category'], description = ''): Place => ({
  id,
  name,
  aliases: [],
  category,
  theme: 'parks-trails',
  municipality: 'Cary',
  centroid: [0, 0],
  description,
  sourceIds: ['x'],
})

describe('basin on cards', () => {
  const places = new Map(
    [
      mk('p', 'Park', 'park'),
      mk('lonely', 'Lonely Park', 'park'),
      mk('w', 'Upper Crabtree Creek watershed', 'water', 'Part of the Neuse River Basin (HUC-8 Upper Neuse).'),
      mk('w2', 'Foo watershed', 'water', 'USGS subwatershed 1.'),
    ].map((p) => [p.id, p]),
  )
  const idx = indexRelationships(
    parseRelationships({
      relationships: [
        { from: 'p', to: 'w', kind: 'contained', basis: 'watershed' },
        { from: 'p', to: 'w2', kind: 'contained', basis: 'watershed' },
      ],
    }),
  )
  it('reads the basin from the watershed description', () => {
    expect(basinOf(places.get('w')!)).toBe('Neuse')
    expect(basinOf(places.get('w2')!)).toBeNull()
  })
  it('adds the basin to the watershed line', () => {
    expect(connectionsFor('p', idx, places)[0].label).toBe('In the Upper Crabtree Creek watershed · Neuse basin')
  })
  it('flags a park or trail with no watershed link as not determined', () => {
    expect(watershedNotDetermined('lonely', idx, places)).toBe(true)
    expect(watershedNotDetermined('p', idx, places)).toBe(false)
    expect(watershedNotDetermined('w', idx, places)).toBe(false)
  })
  it('published: every park and trail has a watershed and every watershed names its basin', () => {
    for (const p of catalog.places.filter((x) => x.category === 'park' || x.category === 'trail')) {
      expect(linksOf(p.id).length, p.id).toBeGreaterThanOrEqual(1)
    }
    expect(watershedPlaces.length).toBeGreaterThan(40)
    for (const w of watershedPlaces) expect(basinOf(w), w.id).toMatch(/^[A-Z][A-Za-z ]+$/)
  })
})

describe('Cary two-basin line', () => {
  it('needs exactly two basins in the data', () => {
    const links = [
      { from: 'a', to: 'w1' },
      { from: 'a', to: 'w2' },
      { from: 'b', to: 'w1' },
    ]
    const basins = cityBasins(['a', 'b'], links, new Map([['w1', 'Neuse'], ['w2', 'Cape Fear']]))
    expect(basins.map((b) => [b.basin, b.links])).toEqual([['Neuse', 2], ['Cape Fear', 1]])
    expect(cityBasinLine('Cary', basins)).toBe('Cary lies in two river basins, Neuse and Cape Fear.')
    expect(cityBasinLine('Cary', basins.slice(0, 1))).toBeNull()
  })
  it('published: Cary parks and trails sit in watersheds of both HUC-6 basins, and only those watersheds carry the line', () => {
    const cary = new Set(catalog.places.filter((p) => p.municipality === 'Cary' && (p.category === 'park' || p.category === 'trail')).map((p) => p.id))
    const basinById = new Map(watershedPlaces.map((w) => [w.id, basinOf(w) ?? '']))
    const basins = cityBasins(cary, wsLinks, basinById)
    expect(basins.map((b) => b.basin).sort()).toEqual(['Cape Fear', 'Neuse'])
    const linked = new Set(basins.flatMap((b) => b.watersheds))
    for (const w of watershedPlaces) {
      expect(w.description.includes('Cary lies in two river basins, Neuse and Cape Fear.'), w.id).toBe(linked.has(w.id))
    }
  })
})

describe('creek card copy', () => {
  it('builds from watershed, basin, length and the following greenways only', () => {
    const text = creekCardDescription('Swift Creek', 7700, {
      watersheds: [{ name: 'Lake Wheeler-Swift Creek watershed', basin: 'Neuse' }],
      greenways: ['Swift Creek Greenway'],
    })
    expect(text).toBe(
      'Stream, about 4.8 miles in this area (USGS hydrography). In the Lake Wheeler-Swift Creek watershed, part of the Neuse River Basin. Greenways that follow it: Swift Creek Greenway.',
    )
    expect(creekCardDescription('X Creek', 2000)).toBe('Stream, about 1.2 miles in this area (USGS hydrography).')
    expect(text).not.toMatch(/habitat/i)
  })
  it('published: each creek names its watershed and basin, and lists the greenways that follow it', () => {
    for (const c of creeks) {
      expect(c.description, c.id).toMatch(/^(Stream|River), about [\d.]+ miles? in this area \(USGS hydrography\)\. In the .+ watersheds?, part of the .+ River Basins?\./)
      expect(c.description).not.toMatch(/habitat/i)
      const followers = rels.filter((r) => r.to === c.id && r.basis === 'along').map((r) => byId.get(r.from)?.name)
      for (const name of new Set(followers).size <= 3 ? followers : []) expect(c.description, c.id).toContain(String(name))
      expect(/Greenways that follow it/.test(c.description), c.id).toBe(followers.length > 0)
    }
  })
})

describe('forbidden words', () => {
  it('no watershed or creek card copy claims flow, drainage, supply or utility', () => {
    for (const p of [...watershedPlaces, ...creeks]) expect(p.description, p.id).not.toMatch(FORBIDDEN)
  })
})

describe('spot check: linked watershed holds the place (WBD HUC-12 snapshot)', () => {
  const huc12 = read(fileURLToPath(new URL('../pipeline/sources/usgs/wbd-huc12/data.geojson', import.meta.url))).features as {
    properties: { huc12: string }
    geometry: unknown
  }[]
  const polygons = new Map(huc12.map((f) => [f.properties.huc12, polygonsOf(f.geometry)]))
  const holds = (code: string, pt: number[]) => (polygons.get(code) ?? []).some((pg: number[][][]) => pointInPolygon(pt, pg))
  const codeOf = (placeId: string) => placeId.replace('watershed-', '')
  const lines = new Map<string, number[][]>()
  const layerFeatures = [...read(release.layerPaths.greenways).features, ...read(release.layerPaths.water).features]
  for (const f of layerFeatures as { properties: { placeId: string }; geometry: { coordinates: number[][][] } }[]) {
    lines.set(f.properties.placeId, [...(lines.get(f.properties.placeId) ?? []), ...f.geometry.coordinates.flat()])
  }

  // Wake parks and greenways, the one Chatham park, and creeks in Chatham and Durham (the data holds no park or trail in Durham).
  const PICKS = [
    'cary-park-annie-l-jones-park',
    'cary-park-good-hope-farm',
    'cary-park-meeting-place-park',
    'wake-park-abbotts-creek-park',
    'wake-park-ailey-young-park',
    'cary-park-new-hope-church-road-trailhead-park',
    'cary-greenway-american-tobacco-trail',
    'cary-greenway-kit-creek-greenway',
    'cary-greenway-green-level-greenway',
    'wake-greenway-abbotts-creek-trail',
    // Chatham and Durham hold no park or trail beyond the one above, so their checked places are creeks.
    'creek-crooked-creek',
    'creek-folkner-branch',
    'creek-gulf-creek',
    'creek-burdens-creek',
    'creek-chunky-pipe-creek',
    'creek-laurel-creek',
  ]

  it('covers 16 places: 3+ parks, 3+ trails, and 3+ places in each of Wake, Chatham and Durham', () => {
    const picks = PICKS.map((id) => byId.get(id))
    expect(picks.every(Boolean)).toBe(true)
    expect(new Set(PICKS).size).toBe(16)
    expect(picks.filter((p) => p?.category === 'park').length).toBeGreaterThanOrEqual(3)
    expect(picks.filter((p) => p?.category === 'trail').length).toBeGreaterThanOrEqual(3)
    for (const county of ['Wake', 'Chatham', 'Durham']) {
      expect(picks.filter((p) => p?.county === county).length, county).toBeGreaterThanOrEqual(3)
    }
  })
  it('a park’s watershed holds its centroid', () => {
    for (const id of PICKS.filter((x) => byId.get(x)?.category === 'park')) {
      const p = byId.get(id)!
      const linked = linksOf(id).map((r) => codeOf(r.to))
      expect(linked.length, id).toBeGreaterThanOrEqual(1)
      expect(linked.some((c) => holds(c, p.centroid)), id).toBe(true)
    }
  })
  it('every watershed a trail or creek is linked to holds part of its line', () => {
    for (const id of PICKS.filter((x) => byId.get(x)?.category !== 'park')) {
      const pts = lines.get(id) ?? []
      expect(pts.length, id).toBeGreaterThan(0)
      const linked = linksOf(id).map((r) => codeOf(r.to))
      expect(linked.length, id).toBeGreaterThanOrEqual(1)
      for (const c of linked) expect(pts.some((pt) => holds(c, pt)), `${id} in ${c}`).toBe(true)
    }
  })
})
