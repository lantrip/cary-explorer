import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ERROR_FALLBACK, logClientError } from '../src/app/errorFallback'
import { buildCreditsRows } from '../src/features/about/credits'
import { anySourceStale, sourceFreshness, updatedAgoText } from '../src/features/places/freshness'
import { parseManifest } from '../src/features/places/release'
import { cadenceFields, registryEntry, sourceHealth } from '../pipeline/lib/health.mjs'
import { checkFreshness } from '../pipeline/scripts/check-freshness.mjs'
// @ts-expect-error untyped .mjs pipeline module
import { publish } from '../pipeline/scripts/publish.mjs'

const DAY = 86_400_000
const T0 = '2026-11-01T00:00:00.000Z'
const at = (days: number) => new Date(Date.parse(T0) + days * DAY)

describe('sourceHealth', () => {
  it.each([
    ['weekly fresh', 7, 6.9, 'fresh'],
    ['weekly due', 7, 7.1, 'due'],
    ['weekly due at the margin edge', 7, 10, 'due'],
    ['weekly stale', 7, 10.1, 'stale'],
    ['monthly fresh', 31, 30, 'fresh'],
    ['monthly due', 31, 35, 'due'],
    ['monthly due at the margin edge', 31, 38, 'due'],
    ['monthly stale', 31, 38.1, 'stale'],
  ])('%s', (_name, cadenceDays, elapsed, status) => {
    const h = sourceHealth({ lastSuccess: T0, cadenceDays }, at(elapsed))
    expect(h.status).toBe(status)
    expect(h.stale).toBe(status === 'stale')
    // The app computes the same answer.
    expect(sourceFreshness({ lastSuccess: T0, cadenceDays }, at(elapsed))).toBe(status)
  })

  it('reports expectedBy and age, and accepts ms', () => {
    const h = sourceHealth({ lastSuccess: T0, cadenceDays: 7 }, Date.parse(T0) + 3 * DAY)
    expect(h.expectedBy).toBe(at(10).toISOString())
    expect(h.ageDays).toBe(3)
  })

  it('is unknown, never stale, without cadenceDays or lastSuccess', () => {
    expect(sourceHealth({ lastSuccess: T0 }, at(400))).toMatchObject({ status: 'unknown', stale: false, expectedBy: null })
    expect(sourceHealth({ cadenceDays: 7 }, at(400))).toMatchObject({ status: 'unknown', stale: false, ageDays: null })
  })

  it('maps catalog ids to registry cadence', () => {
    const registry = [
      { id: 'parks-and-recreation-feature-polygons', cadence: 'weekly' },
      { id: 'wake-parks', cadence: 'monthly' },
    ]
    expect(cadenceFields(registryEntry(registry, 'cary-parks'))).toEqual({ cadence: 'weekly', cadenceDays: 7 })
    expect(cadenceFields(registryEntry(registry, 'wake-parks'))).toEqual({ cadence: 'monthly', cadenceDays: 31 })
    expect(cadenceFields(registryEntry(registry, 'nope'))).toEqual({})
  })
})

describe('check-freshness', () => {
  const manifest = {
    sources: [
      { id: 'a', lastSuccess: T0, cadenceDays: 7, cadence: 'weekly', ok: true },
      { id: 'b', lastSuccess: T0, cadenceDays: 31, cadence: 'monthly', ok: true },
      { id: 'old', ok: true },
    ],
  }
  it('exits 0 when nothing is stale, including sources without cadence', () => {
    expect(checkFreshness(manifest, at(9)).exitCode).toBe(0)
    expect(checkFreshness(manifest, at(30)).stale.map((r: { id: string }) => r.id)).toEqual(['a'])
  })
  it('exits 1 when any source is stale', () => {
    const r = checkFreshness(manifest, at(40))
    expect(r.exitCode).toBe(1)
    expect(r.stale.map((x: { id: string }) => x.id)).toEqual(['a', 'b'])
  })

  describe('script', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'fresh-test-'))
    })
    afterEach(() => rmSync(dir, { recursive: true, force: true }))
    const run = (now: string) => {
      const file = join(dir, 'manifest.json')
      writeFileSync(file, JSON.stringify(manifest))
      return spawnSync(process.execPath, ['pipeline/scripts/check-freshness.mjs', '--manifest', file, '--now', now], { encoding: 'utf8' })
    }
    it('exit codes: 0 fresh, 1 stale, 2 unreadable manifest', () => {
      expect(run(at(1).toISOString()).status).toBe(0)
      const stale = run(at(40).toISOString())
      expect(stale.status).toBe(1)
      expect(stale.stdout).toContain('STALE')
      const missing = spawnSync(process.execPath, ['pipeline/scripts/check-freshness.mjs', '--manifest', join(dir, 'none.json')], { encoding: 'utf8' })
      expect(missing.status).toBe(2)
    })
  })
})

describe('manifest fields', () => {
  const base = { version: '4188bdab5a4741a2', artifacts: { catalog: 'c.json', relationships: 'r.json', places: 'places/x/' } }
  it('parses cadence and cadenceDays', () => {
    const r = parseManifest({ ...base, sources: [{ id: 'a', ok: true, lastSuccess: T0, cadence: 'weekly', cadenceDays: 7 }] })
    expect(r.sources[0]).toMatchObject({ cadence: 'weekly', cadenceDays: 7 })
  })
  it('still parses an older manifest without them, and ignores bad values', () => {
    const r = parseManifest({ ...base, sources: [{ id: 'a', ok: true }, { id: 'b', cadence: 'daily', cadenceDays: -3 }] })
    expect(r.sources[0].cadenceDays).toBeUndefined()
    expect(r.sources[1]).toMatchObject({ cadence: undefined, cadenceDays: undefined })
  })
})

describe('publish writes cadence fields', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cadence-test-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  it('adds cadence/cadenceDays from the registry and stays deterministic', () => {
    const w = (path: string, v: unknown) => {
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, JSON.stringify(v))
    }
    const place = { id: 'a', name: 'a', aliases: [], category: 'park', municipality: 'Cary', county: 'Wake', centroid: [-78.8, 35.8], bbox: [-78.81, 35.79, -78.79, 35.81], description: 'd', sourceIds: ['src-a'] }
    w(join(dir, 'staging', 'catalog.json'), { sources: [{ id: 'src-a', title: 't', name: 'n', url: 'https://example.org/x', license: 'CC0 1.0', retrievedAt: T0 }], places: [place] })
    w(join(dir, 'staging', 'layers', 'parks.geojson'), { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { placeId: 'a' }, geometry: { type: 'Polygon', coordinates: [[[-78.8, 35.8], [-78.79, 35.8], [-78.79, 35.81], [-78.8, 35.8]]] } }] })
    w(join(dir, 'staging', 'relationships.json'), { relationships: [] })
    const fields = [
      ['address', 'Address'], ['entrances', 'Entrances'], ['parking', 'Parking'], ['restrooms', 'Restrooms'],
      ['pavedSurface', 'Paved surface'], ['stepsSlope', 'Steps and slope'], ['wheelchair', 'Wheelchair access'],
      ['hours', 'Hours'], ['water', 'Drinking water'], ['dogPark', 'Dog park'], ['playground', 'Playground'],
      ['picnicShelter', 'Picnic shelter'], ['walkingTrails', 'Walking trails'], ['phone', 'Phone'],
    ]
    w(join(dir, 'staging', 'places', 'a.json'), { id: 'a', fields: fields.map(([key, label]) => ({ key, label, status: 'unknown' })) })
    w(join(dir, 'registry.json'), [{ id: 'src-a', cadence: 'monthly' }])
    const opts = { stagingDir: join(dir, 'staging'), outDir: join(dir, 'out'), lastRunPath: join(dir, 'none.json'), overridesPath: join(dir, 'none2.json'), registryPath: join(dir, 'registry.json'), env: {} }
    const first = publish(opts)
    expect(first.errors).toEqual([])
    expect(first.manifest.sources[0]).toMatchObject({ cadence: 'monthly', cadenceDays: 31 })
    expect(publish(opts).manifest.version).toBe(first.manifest.version)
  })
})

describe('credits row freshness text', () => {
  const now = at(12)
  const rows = (extra: Record<string, unknown>) =>
    buildCreditsRows(
      parseManifest({
        version: '4188bdab5a4741a2',
        artifacts: { catalog: 'c.json', relationships: 'r.json', places: 'places/x/' },
        sources: [{ id: 'a', ok: true, lastSuccess: T0, retrievedAt: T0, cadence: 'weekly', cadenceDays: 7, ...extra }],
      }).sources,
      [],
      now,
    )
  it('shows "Updated N days ago" and flags stale with the cadence', () => {
    const [row] = rows({})
    expect(row.updatedText).toBe('Updated 12 days ago')
    expect(row.stale).toBe(true)
    expect(row.staleText).toBe('Older than expected (updates weekly)')
  })
  it('has no stale text when fresh, and no stale flag for old manifests', () => {
    expect(rows({ lastSuccess: at(10).toISOString() })[0]).toMatchObject({ updatedText: 'Updated 2 days ago', stale: false, staleText: undefined })
    expect(rows({ cadence: undefined, cadenceDays: undefined })[0]).toMatchObject({ stale: false, staleText: undefined })
  })
  it('pluralises', () => {
    expect(updatedAgoText(0)).toBe('Updated today')
    expect(updatedAgoText(1)).toBe('Updated 1 day ago')
  })
  it('anySourceStale only looks at the place sources', () => {
    const sources = [
      { id: 'a', ok: true, lastSuccess: T0, cadenceDays: 7 },
      { id: 'b', ok: true, lastSuccess: at(11).toISOString(), cadenceDays: 7 },
    ]
    expect(anySourceStale(sources, ['a'], now)).toBe(true)
    expect(anySourceStale(sources, ['b', 'zzz'], now)).toBe(false)
  })
})

describe('error boundary fallback', () => {
  it('has friendly copy with a Reload action', () => {
    expect(ERROR_FALLBACK.title).toBe('Something went wrong')
    expect(ERROR_FALLBACK.action).toBe('Reload')
  })
  it('logs to the supplied console function only', () => {
    const log = vi.fn()
    const err = new Error('boom')
    logClientError(err, 'at Foo', log)
    expect(log).toHaveBeenCalledWith('Unhandled app error:', err, 'at Foo')
  })
})
