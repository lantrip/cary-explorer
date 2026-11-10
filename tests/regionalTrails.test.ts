import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchHub } from '../pipeline/lib/fetch-hub.mjs'
import { haversineM, simplifyLine } from '../pipeline/lib/geo.mjs'
import type { Source } from '../pipeline/lib/snapshot-core.mjs'
import { snapshotSource, validateRegistry } from '../pipeline/lib/snapshot-core.mjs'
import {
  dominantSurface,
  findTrailTwin,
  groupWakeGreenways,
  lineLengthM,
  normalize,
  wakeGreenwayStatus,
  wakeOwnerLabel,
} from '../pipeline/scripts/build-catalog.mjs'
import { builtCatalog } from './helpers/builtCatalog'

type Json = Record<string, unknown>

// ---------- fetchHub ----------

const ITEM = '3f75595edc244c35812675b226021258'
const hubSource: Source = {
  id: 'hub-src',
  publisher: 'Test',
  title: 'Test',
  type: 'arcgis-hub',
  url: 'https://example.test/rest/services/X/MapServer/0',
  hubItemId: ITEM,
  hubLayer: 0,
  licence: 'CC-BY-4.0',
  licenceStatus: 'open',
  attribution: 'Test',
  cadence: 'monthly',
  fields: ['TRAIL_NAME'],
  dir: 'test/hub',
  enabled: true,
}

const line = { type: 'LineString', coordinates: [[-78.123456789012, 35.123456789012], [-78.2, 35.2]] }
const hubFeature = (id: number) => ({ type: 'Feature', geometry: line, properties: { OBJECTID: id, TRAIL_NAME: `T${id}`, OWNER: 'x' } })

function hubFetch(opts: { license?: string; count?: number; features?: number; statuses?: string[]; host?: string } = {}) {
  const { license = 'CC-BY-4.0', count = 2, features = 2, statuses = ['Pending', 'PagingData', 'Completed'], host = 'https://hub.arcgis.com' } = opts
  const calls: string[] = []
  let poll = 0
  const fn = async (url: string | URL) => {
    const u = new URL(String(url))
    calls.push(u.pathname + u.search)
    const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
    if (u.pathname === `/api/v3/datasets/${ITEM}_0`) return reply({ data: { attributes: { license, recordCount: count, itemModified: 1788273402334 } } })
    if (u.pathname === `/api/download/v1/items/${ITEM}/geojson`) {
      const status = statuses[Math.min(poll++, statuses.length - 1)]
      return reply({ status, resultUrl: status === 'Completed' ? `${host}/api/v3/datasets/${ITEM}_0/downloads/data?format=geojson&where=OBJECTID%3E0` : undefined })
    }
    if (u.pathname.endsWith('/downloads/data')) return reply({ type: 'FeatureCollection', features: Array.from({ length: features }, (_, i) => hubFeature(i + 1)) })
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return { fn: fn as never, calls }
}
const noSleep = async () => {}

describe('fetchHub', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hub-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('polls the export job, uses a non-default where, rounds coordinates and reports the record count', async () => {
    const { fn, calls } = hubFetch()
    const raw = await fetchHub(hubSource, { fetch: fn, sleep: noSleep })
    expect(raw.features).toHaveLength(2)
    expect(raw.expectedCount).toBe(2)
    expect(raw.idField).toBe('OBJECTID')
    expect(raw.sourceModified).toBe(new Date(1788273402334).toISOString())
    expect(calls.filter((c) => c.includes('/api/download/v1/')).length).toBe(3)
    expect(calls.some((c) => c.includes('where=OBJECTID%3E0'))).toBe(true)
    expect(raw.features[0].geometry.coordinates[0]).toEqual([-78.123457, 35.123457])
  })

  it('refuses a dataset whose Hub licence differs from the registry licence', async () => {
    await expect(fetchHub(hubSource, { fetch: hubFetch({ license: 'none' }).fn, sleep: noSleep })).rejects.toThrow(/licence is "none"/)
  })

  it('refuses an export host other than hub.arcgis.com', async () => {
    await expect(fetchHub(hubSource, { fetch: hubFetch({ host: 'https://evil.example' }).fn, sleep: noSleep })).rejects.toThrow(/unexpected export host/)
  })

  it('fails a failed export job and a truncated export (count check in snapshotSource)', async () => {
    await expect(fetchHub(hubSource, { fetch: hubFetch({ statuses: ['Failed'] }).fn, sleep: noSleep })).rejects.toThrow(/export failed/)
    await expect(snapshotSource(hubSource, { fetch: hubFetch({ count: 5, features: 2, statuses: ['Completed'] }).fn, outRoot: dir })).rejects.toThrow(/expected 5/)
  })

  it('snapshots through snapshotSource, applying the allowlist', async () => {
    const meta = await snapshotSource(hubSource, { fetch: hubFetch({ statuses: ['Completed'] }).fn, outRoot: dir })
    expect(meta).toMatchObject({ sourceId: 'hub-src', recordCount: 2, expectedCount: 2, licenceStatus: 'open' })
    const geo = JSON.parse(readFileSync(join(dir, 'test/hub/data.geojson'), 'utf8'))
    expect(geo.features[0].properties).toEqual({ TRAIL_NAME: 'T1' })
  })

  it('validateRegistry needs a hubItemId on arcgis-hub sources', () => {
    expect(validateRegistry([hubSource])).toEqual([])
    expect(validateRegistry([{ ...hubSource, hubItemId: undefined }]).join()).toMatch(/hubItemId/)
    expect(validateRegistry([{ ...hubSource, licenceStatus: 'unclear' }]).join()).toMatch(/must have licenceStatus "open"/)
  })

  it('the committed registry enables wake-greenways only with an open licence', () => {
    const reg = JSON.parse(readFileSync(new URL('../pipeline/sources.config.json', import.meta.url), 'utf8')) as Source[]
    const s = reg.find((x) => x.id === 'wake-greenways')!
    expect(s).toMatchObject({ enabled: true, licence: 'CC-BY-4.0', licenceStatus: 'open', type: 'arcgis-hub' })
    expect(validateRegistry(reg)).toEqual([])
  })
})

// ---------- geometry ----------

describe('simplifyLine', () => {
  it('drops vertices within tolerance, keeps both ends and real corners', () => {
    const lat = 35.8
    const m = (east: number, north: number) => [-78.8 + east / (111320 * Math.cos((lat * Math.PI) / 180)), lat + north / 110574]
    const wiggly = [m(0, 0), m(50, 1), m(100, -1), m(150, 0), m(150, 100)]
    const out = simplifyLine(wiggly, 5)
    expect(out).toEqual([wiggly[0], wiggly[3], wiggly[4]])
    expect(simplifyLine(wiggly, 0)).toBe(wiggly)
    expect(simplifyLine([wiggly[0], wiggly[1]], 5)).toHaveLength(2)
  })
  it('stays within the tolerance of the original line', () => {
    const pts = Array.from({ length: 200 }, (_, i) => [-78.8 + i * 0.0001, 35.8 + Math.sin(i / 5) * 0.0002])
    const out = simplifyLine(pts, 5)
    expect(out.length).toBeLessThan(pts.length)
    expect(out[0]).toEqual(pts[0])
    expect(out.at(-1)).toEqual(pts.at(-1))
    expect(lineLengthM([out])).toBeLessThanOrEqual(lineLengthM([pts]) + 1e-6)
  })
})

// ---------- mapping and grouping ----------

const km = (n: number) => n / 111.32 // degrees of longitude at the equator-ish; the test only needs lengths in miles
const seg = (props: Json, miles: number, x = -78.7) => ({
  type: 'Feature',
  properties: { TRAIL_STATUS: 'EXISTING', TRAIL_SURFACE: 'ASPHALT', ...props },
  geometry: { type: 'LineString', coordinates: [[x, 35.8], [x + km(miles * 1.609344) / Math.cos((35.8 * Math.PI) / 180), 35.8]] },
})

describe('Wake greenway mapping', () => {
  it('maps TRAIL_STATUS and owners', () => {
    expect(wakeGreenwayStatus('EXISTING')).toBe('existing')
    expect(wakeGreenwayStatus(' Proposed ')).toBe('proposed')
    expect(wakeGreenwayStatus('PLANNED')).toBeUndefined()
    expect(wakeGreenwayStatus(null)).toBeUndefined()
    expect(wakeOwnerLabel('City of Raleigh')).toBe('Raleigh')
    expect(wakeOwnerLabel('COR')).toBe('Raleigh')
    expect(wakeOwnerLabel('Holly Springs')).toBe('Holly Springs')
    expect(wakeOwnerLabel(' ')).toBeUndefined()
  })

  it('picks the surface that covers most of the length and ignores blank and "other"', () => {
    expect(dominantSurface([{ surface: 'ASPHALT', lengthM: 100 }, { surface: 'Concrete', lengthM: 300 }, { surface: 'OTHER', lengthM: 900 }])).toBe('concrete')
    expect(dominantSurface([{ surface: ' ', lengthM: 5 }, { surface: null, lengthM: 5 }])).toBeUndefined()
  })

  it('groups by name, leaves out Cary-owned, private and unnamed segments and applies the Cary keep rules', () => {
    const { kept, dropped, skipped } = groupWakeGreenways([
      seg({ TRAIL_NAME: 'Neuse River Trail', OWNER: 'City of Raleigh' }, 0.4),
      seg({ TRAIL_NAME: ' Neuse  River Trail', OWNER: 'COR' }, 0.4, -78.6),
      seg({ TRAIL_NAME: 'Flat Branch Greenway', OWNER: 'Town of Cary' }, 2),
      seg({ TRAIL_NAME: 'Cary Greenway', OWNER: 'Cary' }, 2),
      seg({ TRAIL_NAME: 'Gated HOA Path', OWNER: 'Private' }, 2),
      seg({ TRAIL_NAME: '', CORRIDOR_NAME: '', OWNER: 'Apex' }, 2),
      seg({ TRAIL_NAME: '', CORRIDOR_NAME: 'Beaver Creek Greenway', OWNER: 'Apex' }, 0.6),
      seg({ TRAIL_NAME: 'Short Trail', OWNER: 'Garner' }, 0.3),
      seg({ TRAIL_NAME: 'Davis Drive', OWNER: 'Morrisville' }, 1),
      seg({ TRAIL_NAME: 'Heritage Lake Rd Sidepath', OWNER: 'Wake Forest' }, 1),
      seg({ TRAIL_NAME: 'Morrisville Parkway South Side', OWNER: 'Morrisville' }, 1),
      seg({ TRAIL_NAME: 'Gardner Street Trail', OWNER: 'City of Raleigh' }, 0.8),
      seg({ TRAIL_NAME: 'Planned Trail', OWNER: 'Apex', TRAIL_STATUS: 'PLANNED' }, 2),
    ])
    expect(kept.map((g) => g.name).sort()).toEqual(['Beaver Creek Greenway', 'Gardner Street Trail', 'Neuse River Trail'])
    expect(dropped.map((g) => g.name).sort()).toEqual(['Davis Drive', 'Heritage Lake Rd Sidepath', 'Morrisville Parkway South Side', 'Short Trail'])
    expect(skipped).toEqual({ cary: 2, private: 1, unnamed: 1, notExisting: 1 })
    const neuse = kept.find((g) => g.key === 'neuse river trail')!
    expect(neuse.segments).toBe(2)
    expect(neuse.miles).toBeGreaterThan(0.75)
    expect(neuse.owners).toEqual(['Raleigh'])
    expect(neuse.surface).toBe('asphalt')
  })

  it('keeps proposed lines on a group but never makes a proposed-only place', () => {
    const { kept } = groupWakeGreenways([
      seg({ TRAIL_NAME: 'Mill Creek Greenway', OWNER: 'Apex' }, 1),
      seg({ TRAIL_NAME: 'Mill Creek Greenway', OWNER: 'Apex', TRAIL_STATUS: 'PROPOSED' }, 1, -78.5),
      seg({ TRAIL_NAME: 'Future Greenway', OWNER: 'Apex', TRAIL_STATUS: 'PROPOSED' }, 3),
    ])
    expect(kept.map((g) => g.name)).toEqual(['Mill Creek Greenway'])
    expect(kept[0].proposedLines).toHaveLength(1)
    expect(kept[0].segments).toBe(1)
  })
})

describe('findTrailTwin', () => {
  const centroid = [-78.7, 35.8]
  const cands = [{ id: 'cary-greenway-ncsu-trail', centroid, names: new Set([normalize('Lake Trail')]) }]
  const near = [[[-78.7 + 0.005, 35.8], [-78.7 + 0.02, 35.8]]] // 0.43 km from the centroid
  const far = [[[-78.7 + 0.02, 35.8], [-78.7 + 0.03, 35.8]]] // 1.8 km
  it('matches the same name when any vertex is within 1 km of the place', () => {
    const hit = findTrailTwin('  lake  TRAIL ', near, cands)
    expect(hit?.twin.id).toBe('cary-greenway-ncsu-trail')
    expect(hit!.distanceM).toBe(Math.round(haversineM(centroid, near[0][0])))
  })
  it('does not match a different name or a same name farther than 1 km', () => {
    expect(findTrailTwin('Other Trail', near, cands)).toBeUndefined()
    expect(findTrailTwin('Lake Trail', far, cands)).toBeUndefined()
  })
})

// ---------- built release ----------

describe('built regional trails', () => {
  const out = builtCatalog()
  const places = out.catalog.places as { id: string; name: string; category: string; municipality: string; sourceIds: string[]; centroid: number[] }[]
  const regional = places.filter((p) => p.sourceIds.includes('wake-greenways'))
  const layer = JSON.parse(out.outputs['layers/greenways.geojson']) as { features: { properties: { placeId: string; status: string; outsideCore: boolean }; geometry: { type: string } }[] }

  it('adds trail places outside Cary, each with an existing layer feature, a town and the Wake source', () => {
    expect(regional.length).toBeGreaterThan(40)
    const source = (out.catalog.sources as { id: string; license: string }[]).find((s) => s.id === 'wake-greenways')
    expect(source?.license).toBe('CC BY 4.0')
    for (const p of regional) {
      expect(p.category).toBe('trail')
      expect(p.municipality).not.toBe('Cary')
      const fs = layer.features.filter((f) => f.properties.placeId === p.id)
      expect(fs.length).toBeGreaterThan(0)
      for (const f of fs) {
        expect(f.properties.status).toBe('existing')
        expect(typeof f.properties.outsideCore).toBe('boolean')
        expect(f.geometry.type).toBe('MultiLineString')
      }
    }
    expect(new Set(regional.map((p) => p.municipality)).size).toBeGreaterThan(5)
  })

  it('does not import Cary-owned segments, and skips a Cary greenway name only when the trail is within 1 km of it', () => {
    const cary = places.filter((p) => p.sourceIds.includes('cary-greenways'))
    for (const p of regional) {
      const lines = layer.features.filter((f) => f.properties.placeId === p.id).flatMap((f) => (f.geometry as unknown as { coordinates: number[][][] }).coordinates)
      for (const c of cary.filter((c) => normalize(c.name) === normalize(p.name))) {
        const nearest = Math.min(...lines.flat().map((v) => haversineM(c.centroid as [number, number], v as [number, number])))
        expect(nearest).toBeGreaterThan(1000)
      }
    }
    expect(out.trailDedupeSkips.some((d) => d.twinId === 'cary-greenway-american-tobacco-trail')).toBe(true)
    expect(out.trailDedupeSkips.every((d) => d.distanceM <= 1000)).toBe(true)
    expect(out.wakeGreenways.skipped.cary).toBeGreaterThan(400)
  })

  it('has unique ids and one place per normalized regional trail name', () => {
    expect(new Set(places.map((p) => p.id)).size).toBe(places.length)
    expect(new Set(regional.map((p) => normalize(p.name))).size).toBe(regional.length)
  })

  it('keeps the greenways layer inside its gzip budget', () => {
    const budget = JSON.parse(readFileSync(new URL('../pipeline/budgets.json', import.meta.url), 'utf8')).layer as number
    expect(gzipSync(out.outputs['layers/greenways.geojson']).length).toBeLessThanOrEqual(budget)
  })

  it('does not turn Wake park entrances into places', () => {
    expect(places.some((p) => p.sourceIds.includes('wake-park-entrances'))).toBe(false)
    expect(places.every((p) => p.id.startsWith('cary-') || p.id.startsWith('wake-park-') || p.id.startsWith('wake-greenway-') || p.id.startsWith('wake-fire-') || p.id.startsWith('watershed-') || p.id.startsWith('creek-'))).toBe(true)
  })
})
