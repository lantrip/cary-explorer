import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseCatalog } from '../src/features/places/catalog'
// @ts-expect-error untyped .mjs pipeline modules
import { publish } from '../pipeline/scripts/publish.mjs'
import { readRelease } from '../pipeline/lib/release.mjs'
// @ts-expect-error untyped .mjs pipeline modules
import { validateRelease } from '../pipeline/lib/validate.mjs'

type Json = Record<string, any>
let dir: string
const p = (...s: string[]) => join(dir, ...s)
const write = (path: string, v: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(v))
}

const source = (id: string) => ({
  id,
  title: `${id} dataset`,
  name: id,
  url: 'https://example.org/x',
  license: 'CC0 1.0',
  retrievedAt: '2026-11-06T12:00:00.000Z',
})
const place = (id: string, extra: Json = {}) => ({
  id,
  name: id,
  aliases: [],
  category: 'park',
  municipality: 'Cary',
  county: 'Wake',
  centroid: [-78.8, 35.8],
  bbox: [-78.81, 35.79, -78.79, 35.81],
  description: 'generated',
  sourceIds: ['src-a'],
  ...extra,
})
const feature = (placeId: string) => ({
  type: 'Feature',
  properties: { placeId },
  geometry: { type: 'Polygon', coordinates: [[[-78.8, 35.8], [-78.79, 35.8], [-78.79, 35.81], [-78.8, 35.8]]] },
})

const detailFields = () =>
  [
    ['address', 'Address'], ['entrances', 'Entrances'], ['parking', 'Parking'], ['restrooms', 'Restrooms'],
    ['pavedSurface', 'Paved surface'], ['stepsSlope', 'Steps and slope'], ['wheelchair', 'Wheelchair access'],
    ['hours', 'Hours'], ['water', 'Drinking water'], ['dogPark', 'Dog park'], ['playground', 'Playground'],
    ['picnicShelter', 'Picnic shelter'], ['walkingTrails', 'Walking trails'], ['phone', 'Phone'],
  ].map(([key, label]) => ({ key, label, status: 'unknown' }))

function stage(opts: { places?: Json[]; features?: Json[]; sources?: Json[]; rels?: Json[] } = {}) {
  const places = opts.places ?? [place('a'), place('b')]
  write(p('staging', 'catalog.json'), { sources: opts.sources ?? [source('src-a')], places })
  write(p('staging', 'layers', 'parks.geojson'), {
    type: 'FeatureCollection',
    features: opts.features ?? places.map((x) => feature(x.id)),
  })
  write(p('staging', 'relationships.json'), { relationships: opts.rels ?? [] })
  rmSync(p('staging', 'places'), { recursive: true, force: true })
  for (const x of places) write(p('staging', 'places', `${x.id}.json`), { id: x.id, fields: detailFields() })
}

const run = (extra: Json = {}) =>
  publish({
    stagingDir: p('staging'),
    outDir: p('out'),
    lastRunPath: p('last-run.json'),
    overridesPath: p('overrides.json'),
    env: {},
    ...extra,
  })

const snapshotOut = (root: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else out[f.slice(root.length)] = readFileSync(f, 'utf8')
    }
  }
  walk(root)
  return out
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'publish-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('publish gates', () => {
  it('publishes a valid staging dir with a manifest', () => {
    stage()
    const res = run()
    expect(res.errors).toEqual([])
    expect(res.ok).toBe(true)
    const manifest = JSON.parse(readFileSync(p('out', 'manifest.json'), 'utf8'))
    expect(manifest.sources).toEqual([
      expect.objectContaining({ id: 'src-a', recordCount: 2, licence: 'CC0 1.0', ok: true }),
    ])
    expect(manifest.generatedFrom).toBe('2026-11-06T12:00:00.000Z')
  })

  it('copies places/ with the release and blocks when a place has no detail file', () => {
    stage()
    expect(run().ok).toBe(true)
    expect(readdirSync(readRelease(p('out')).placesDir).sort()).toEqual(['a.json', 'b.json'])
    const v1 = JSON.parse(readFileSync(p('out', 'manifest.json'), 'utf8')).version
    const d = JSON.parse(readFileSync(p('staging', 'places', 'a.json'), 'utf8'))
    d.fields[3] = { ...d.fields[3], status: 'known', value: 'Yes', sourceId: 'src-a', verifiedAt: '2026-11-01' }
    write(p('staging', 'places', 'a.json'), d)
    expect(run().ok).toBe(false) // catalog amenities no longer match the detail file
    stage({ places: [place('a', { amenities: ['restrooms'] }), place('b')] })
    write(p('staging', 'places', 'a.json'), d)
    expect(run().ok).toBe(true)
    expect(JSON.parse(readFileSync(p('out', 'manifest.json'), 'utf8')).version).not.toBe(v1)
    rmSync(p('staging', 'places', 'b.json'))
    const blocked = run()
    expect(blocked.ok).toBe(false)
    expect(blocked.errors.join()).toContain('places/b.json')
  })

  it('curated overrides survive a rebuild and unknown ids only warn', () => {
    write(p('overrides.json'), { a: { description: 'curated', aliases: ['Alpha'] }, ghost: { name: 'x' } })
    stage()
    expect(run().ok).toBe(true)
    // "rebuild": stage regenerated content again, republish
    stage()
    const res = run()
    expect(res.warnings.join('\n')).toContain('unknown placeId "ghost"')
    const cat = JSON.parse(readFileSync(readRelease(p('out')).catalogPath, 'utf8'))
    const a = cat.places.find((x: Json) => x.id === 'a')
    expect(a.description).toBe('curated')
    expect(a.aliases).toEqual(['Alpha'])
    expect(cat.places.find((x: Json) => x.id === 'b').description).toBe('generated')
  })

  it('blocks a 50% record-count drop unless allowed', () => {
    stage({ places: Array.from({ length: 10 }, (_, i) => place(`p${i}`)) })
    expect(run().ok).toBe(true)
    stage({ places: Array.from({ length: 5 }, (_, i) => place(`p${i}`)) })
    const blocked = run()
    expect(blocked.ok).toBe(false)
    expect(blocked.errors.join()).toContain('src-a')
    expect(run({ env: { PIPELINE_ALLOW_COUNT_CHANGE: 'src-a' } }).ok).toBe(true)
  })

  it('blocks on a failed source in lastRun unless --allow-stale', () => {
    stage()
    write(p('last-run.json'), { sources: [{ id: 'src-a', ok: false, error: 'HTTP 500' }] })
    const blocked = run()
    expect(blocked.ok).toBe(false)
    expect(blocked.errors.join()).toContain('HTTP 500')
    const allowed = run({ allowStale: true })
    expect(allowed.ok).toBe(true)
    expect(allowed.warnings.join()).toContain('src-a')
  })

  const check = (catalog: Json, layers: Json, relationships?: Json) =>
    validateRelease({ catalog, layers: { parks: layers }, relationships })
  const fc = (...ids: string[]) => ({ type: 'FeatureCollection', features: ids.map(feature) })

  it('fails on duplicate ids, out-of-range coords and orphan layer features', () => {
    const dup = check({ sources: [source('src-a')], places: [place('a'), place('a')] }, fc('a'))
    expect(dup.errors.join()).toContain('duplicate place id')
    const far = check({ sources: [source('src-a')], places: [place('a', { centroid: [-100, 35.8] })] }, fc('a'))
    expect(far.errors.join()).toContain('outside study area')
    const orphan = check({ sources: [source('src-a')], places: [place('a')] }, fc('a', 'zzz'))
    expect(orphan.errors.join()).toContain('"zzz" not in catalog')
    const cary = (id: string, extra: Json = {}) => place(id, { sourceIds: ['cary-parks'], ...extra })
    const missing = check({ sources: [source('cary-parks')], places: [cary('a'), cary('b')] }, fc('a'))
    expect(missing.errors.join()).toContain('"b" (park) has no layer feature')
    const rel = check({ sources: [source('src-a')], places: [place('a')] }, fc('a'), {
      relationships: [{ from: 'a', to: 'nope', kind: 'nearby' }],
    })
    expect(rel.errors.join()).toContain('"nope"')
    const noWake = check({ sources: [source('src-a')], places: [place('a', { county: 'Chatham' })] }, fc('a'))
    expect(noWake.errors.join()).toContain('Wake')
  })

  it('refuses to publish a source with a missing or blank licence', () => {
    for (const license of [undefined, '', '   ']) {
      const res = check({ sources: [{ ...source('src-a'), license }], places: [place('a')] }, fc('a'))
      expect(res.ok).toBe(false)
      expect(res.errors.join()).toContain('source "src-a": licence missing')
    }
  })

  it('does not publish when a catalog source has no licence', () => {
    stage({ sources: [{ ...source('src-a'), license: '' }] })
    const res = run()
    expect(res.ok).toBe(false)
    expect(res.errors.join()).toContain('licence missing')
  })

  it('allows several features per trail and point-only places without features', () => {
    const trail = place('t', { category: 'trail', sourceIds: ['cary-greenways'] })
    const wakePark = place('w', { sourceIds: ['wake-parks'] })
    const res = check(
      { sources: [source('cary-greenways'), source('wake-parks')], places: [trail, wakePark] },
      fc('t', 't'),
    )
    expect(res.errors).toEqual([])
    expect(res.ok).toBe(true)
  })

  it('requires every greenways feature to have status existing or proposed', () => {
    const trail = place('t', { category: 'trail', sourceIds: ['cary-greenways'] })
    const catalog = { sources: [source('cary-greenways')], places: [trail] }
    const gf = (status?: string) => ({ ...feature('t'), properties: { placeId: 't', ...(status ? { status } : {}) } })
    const run = (...fs: Json[]) =>
      validateRelease({ catalog, layers: { greenways: { type: 'FeatureCollection', features: fs } } })
    expect(run(gf('existing'), gf('proposed')).errors).toEqual([])
    expect(run(gf()).errors.join()).toContain('status must be')
    expect(run(gf('Existing')).errors.join()).toContain('status must be')
    expect(run().errors.join()).toContain('has no layer feature')
  })

  it('leaves the output dir untouched on failure', () => {
    stage()
    expect(run().ok).toBe(true)
    const before = snapshotOut(p('out'))
    stage({ places: [place('a'), place('a')] })
    expect(run().ok).toBe(false)
    expect(snapshotOut(p('out'))).toEqual(before)
  })

  it('is byte-identical across two publishes of the same staging', () => {
    stage()
    run()
    const first = snapshotOut(p('out'))
    run()
    expect(snapshotOut(p('out'))).toEqual(first)
  })
})

describe('hashed release artifacts', () => {
  const files = (root: string) => Object.keys(snapshotOut(root)).sort()

  it('writes hashed artifacts, a manifest with artifacts, and no unhashed files', () => {
    stage()
    expect(run().ok).toBe(true)
    const m = JSON.parse(readFileSync(p('out', 'manifest.json'), 'utf8'))
    expect(Object.keys(m)).toEqual(['version', 'generatedFrom', 'artifacts', 'sources'])
    expect(m.artifacts.catalog).toMatch(/^catalog\.[0-9a-f]{12}\.json$/)
    expect(m.artifacts.relationships).toMatch(/^relationships\.[0-9a-f]{12}\.json$/)
    expect(m.artifacts.layers.parks).toMatch(/^layers\/parks\.[0-9a-f]{12}\.geojson$/)
    expect(m.artifacts.places).toMatch(/^places\/[0-9a-f]{12}\/$/)
    expect(files(p('out'))).toHaveLength(1 + 1 + 1 + 1 + 2)
    const r = readRelease(p('out'))
    expect(readFileSync(r.catalogPath, 'utf8')).toContain('"places"')
  })

  it('keeps the previous release, prunes older ones and legacy files', () => {
    stage()
    write(p('out', 'catalog.json'), {})
    write(p('out', 'relationships.json'), {})
    write(p('out', 'layers', 'parks.geojson'), {})
    write(p('out', 'places', 'old.json'), {})
    write(p('out', 'notes.txt'), {})
    write(p('out', 'manifest.json'), { version: 'legacy', sources: [] })
    expect(run().ok).toBe(true)
    const after1 = files(p('out'))
    expect(after1).not.toContain('/catalog.json')
    expect(after1).not.toContain('/places/old.json')
    expect(after1).toContain('/notes.txt')
    const r1 = readRelease(p('out'))
    const allow = { env: { PIPELINE_ALLOW_COUNT_CHANGE: 'src-a' } }
    stage({ places: [place('a'), place('b'), place('c')] })
    expect(run(allow).ok).toBe(true)
    const r2 = readRelease(p('out'))
    expect(r2.catalogPath).not.toBe(r1.catalogPath)
    expect(readdirSync(r1.placesDir)).toHaveLength(2) // previous release still present
    stage({ places: [place('a'), place('b'), place('c'), place('d')] })
    expect(run(allow).ok).toBe(true)
    expect(() => readdirSync(r1.placesDir)).toThrow() // two releases back is pruned
    expect(readdirSync(r2.placesDir)).toHaveLength(3)
  })

  it('rejects unsafe artifact paths and manifests without artifacts', async () => {
    const { artifactPath } = await import('../pipeline/lib/release.mjs')
    for (const bad of ['/etc/passwd', '../x', 'a/../b', 'https://x/y', 'Upper.json', 'a b.json'])
      expect(() => artifactPath(dir, bad)).toThrow()
    write(p('manifest.json'), { version: 'x' })
    expect(() => readRelease(dir)).toThrow(/artifacts/)
  })
})

describe('source parser provenance', () => {
  it('rejects a source without retrievedAt or license', () => {
    const base = { id: 's', name: 'S', url: 'https://example.org' }
    const withPlace = (s: Json) => ({ sources: [s], places: [] })
    expect(() => parseCatalog(withPlace({ ...base, license: 'CC0 1.0' }))).toThrow(/retrievedAt/)
    expect(() => parseCatalog(withPlace({ ...base, retrievedAt: '2026-11-06' }))).toThrow(/license/)
    expect(() => parseCatalog(withPlace({ ...base, retrievedAt: 'nope', license: 'x' }))).toThrow(/retrievedAt/)
  })
})
