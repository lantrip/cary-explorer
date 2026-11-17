import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fetchArcgis } from '../pipeline/lib/fetch-arcgis.mjs'
import { findCaryTwin, municipalityOf, pointInGeometry, TOWNS, UNINCORPORATED_WAKE } from '../pipeline/scripts/build-catalog.mjs'
import { parseCatalog } from '../src/features/places/catalog'
import { builtCatalog } from './helpers/builtCatalog'

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
const towns = read('pipeline/sources/census/places/data.geojson')
const limits = read('pipeline/sources/boundaries/cary-corporate-limits.geojson')

const APEX_DOWNTOWN: [number, number] = [-78.8503, 35.7327]
const WAKE_COUNTRYSIDE: [number, number] = [-78.4, 35.62]

describe('municipality by polygon', () => {
  it('uses the twelve Census towns', () => {
    expect(towns.features.map((f: { properties: { BASENAME: string } }) => f.properties.BASENAME).sort()).toEqual([...TOWNS].sort())
  })
  it('puts a point in Apex into "Apex"', () => {
    expect(municipalityOf(APEX_DOWNTOWN, towns, 'Wake')).toBe('Apex')
  })
  it('puts a Wake point outside every town into Unincorporated Wake County', () => {
    expect(municipalityOf(WAKE_COUNTRYSIDE, towns, 'Wake')).toBe(UNINCORPORATED_WAKE)
  })
  it('names the county outside Wake', () => {
    expect(municipalityOf(WAKE_COUNTRYSIDE, towns, 'Chatham')).toBe('Chatham County')
  })
  it('ignores ZIP/postal-style properties', () => {
    const fake = { features: [{ properties: { BASENAME: 'Apex', ZIP: '27502' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }] }
    expect(municipalityOf([5, 5], fake, 'Wake')).toBe(UNINCORPORATED_WAKE)
  })
})

describe('built catalog', () => {
  const { catalog } = builtCatalog()
  const places = catalog.places as { id: string; municipality: string; county: string; centroid: [number, number]; sourceIds: string[] }[]

  it('gives every place a county and a municipality from the known set', () => {
    const allowed = new Set([...TOWNS, UNINCORPORATED_WAKE, 'Chatham County', 'Durham County'])
    for (const p of places) {
      expect(p.county).toBeTruthy()
      expect(allowed.has(p.municipality), `${p.id}: ${p.municipality}`).toBe(true)
    }
  })
  it('skips Wake parks inside Cary limits (Cary data wins)', () => {
    const wake = places.filter((p) => p.sourceIds.includes('wake-parks'))
    expect(wake.length).toBeGreaterThan(100)
    for (const p of wake) {
      expect(limits.features.some((f: { geometry: unknown }) => pointInGeometry(p.centroid, f.geometry)), p.id).toBe(false)
    }
  })
  it('keeps the existing Abbotts Creek Park id', () => {
    expect(places.some((p) => p.id === 'wake-park-abbotts-creek-park')).toBe(true)
  })
})

describe('county is required by the parser', () => {
  const base = { id: 'a', name: 'A', aliases: [], category: 'park', municipality: 'Apex', centroid: [-78.8, 35.7], description: '', sourceIds: ['s'] }
  const source = { id: 's', name: 'S', url: 'https://example.org/', license: 'CC0', retrievedAt: '2026-01-01T00:00:00Z' }
  it('rejects a missing or empty county', () => {
    expect(() => parseCatalog({ sources: [source], places: [base] })).toThrow(/county/)
    expect(() => parseCatalog({ sources: [source], places: [{ ...base, county: '' }] })).toThrow(/county/)
    expect(parseCatalog({ sources: [source], places: [{ ...base, county: 'Wake' }] }).places[0].county).toBe('Wake')
  })
})

describe('ArcGIS where option', () => {
  it('passes the registry where clause to count and page queries', async () => {
    const seen: string[] = []
    const fetchFn = async (url: string | URL) => {
      const u = new URL(String(url))
      const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
      if (!u.pathname.endsWith('/query')) return reply({ objectIdField: 'OBJECTID', maxRecordCount: 10 })
      seen.push(u.searchParams.get('where') ?? '')
      return u.searchParams.get('returnCountOnly') ? reply({ count: 0 }) : reply({ features: [] })
    }
    await fetchArcgis({ url: 'https://example.test/MapServer/4', fields: [], where: "STATE='37'" }, { fetch: fetchFn as never })
    expect(seen).toEqual(["STATE='37'"])
    seen.length = 0
    await fetchArcgis({ url: 'https://example.test/MapServer/4', fields: [] }, { fetch: fetchFn as never })
    expect(seen).toEqual(['1=1'])
  })
})

describe('Wake duplicate of a Cary park', () => {
  // A park about 0.02 degrees square (roughly 2 km) around the centroid.
  const ring = [[-78.81, 35.79], [-78.79, 35.79], [-78.79, 35.81], [-78.81, 35.81], [-78.81, 35.79]]
  const cary = [{ id: 'cary-park-x', centroid: [-78.8, 35.8], polygons: [[ring]], names: new Set(['x trailhead park', 'x tp']) }]
  it('skips a Wake park with the same name whose point lies inside the Cary polygon', () => {
    expect(findCaryTwin('X Trailhead  Park', [-78.8, 35.805], cary)?.candidate.id).toBe('cary-park-x')
    expect(findCaryTwin('X TP', [-78.8, 35.805], cary)?.candidate.id).toBe('cary-park-x')
  })
  it('keeps it when the names differ or the point is outside the polygon, however near', () => {
    expect(findCaryTwin('Y Park', [-78.8, 35.8], cary)).toBeUndefined()
    expect(findCaryTwin('X Trailhead Park', [-78.8, 35.82], cary)).toBeUndefined()
    // same name, 300 m outside the polygon (inside the old 1 km rule's reach): no longer a merge
    expect(findCaryTwin('X Trailhead Park', [-78.79, 35.81 + 0.0027], cary)).toBeUndefined()
  })
  it('drops the New Hope Church Road Trailhead duplicate from the real build', () => {
    const { catalog, dedupeSkips } = builtCatalog()
    const ids = catalog.places.map((p) => p.id as string)
    expect(ids).toContain('cary-park-new-hope-church-road-trailhead-park')
    expect(ids).not.toContain('wake-park-new-hope-church-road-trailhead-park')
    expect(dedupeSkips.map((d: { caryId: string }) => d.caryId)).toContain('cary-park-new-hope-church-road-trailhead-park')
  })
})
