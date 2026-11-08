import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchArcgis } from '../pipeline/lib/fetch-arcgis.mjs'
import type { Source } from '../pipeline/lib/snapshot-core.mjs'
import { applyAllowlist, runSnapshots, snapshotSource, validateRegistry } from '../pipeline/lib/snapshot-core.mjs'

type Json = Record<string, unknown>

const feat = (id: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-78, 35] },
  properties: { OBJECTID: id, NAME: `P${id}`, SECRET: 'x' },
})

/** Fake ArcGIS layer with `total` features, page size 2. `dropPage` omits one page's features. */
function arcgisFetch(total: number, opts: { dropPage?: number } = {}) {
  const all = Array.from({ length: total }, (_, i) => feat(i + 1))
  return async (url: string | URL) => {
    const u = new URL(String(url))
    const reply = (body: Json) => ({ ok: true, status: 200, json: async () => body })
    if (!u.pathname.endsWith('/query')) {
      return reply({ objectIdField: 'OBJECTID', maxRecordCount: 2, editingInfo: { dataLastEditDate: 1788273402334 }, advancedQueryCapabilities: { supportsPagination: true } })
    }
    if (u.searchParams.get('returnCountOnly')) return reply({ count: total })
    const offset = Number(u.searchParams.get('resultOffset'))
    const n = Number(u.searchParams.get('resultRecordCount'))
    const page = opts.dropPage !== undefined && offset / n === opts.dropPage ? [] : all.slice(offset, offset + n)
    // return in reverse to prove the core sorts by id
    return reply({ type: 'FeatureCollection', features: [...page].reverse() })
  }
}

const source: Source = {
  id: 'test-src',
  publisher: 'Test',
  title: 'Test',
  type: 'arcgis',
  url: 'https://example.test/rest/services/X/FeatureServer/0',
  licence: 'CC-BY-4.0',
  licenceStatus: 'open',
  attribution: 'Test',
  cadence: 'weekly',
  fields: ['NAME'],
  dir: 'test/src',
  enabled: true,
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'snap-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('pipeline fetch', () => {
  it('pages over 3 pages and passes the count check', async () => {
    const raw = await fetchArcgis(source, { fetch: arcgisFetch(5) as never })
    expect(raw.features).toHaveLength(5)
    expect(raw.expectedCount).toBe(5)
    const meta = await snapshotSource(source, { fetch: arcgisFetch(5) as never, outRoot: dir })
    expect(meta.recordCount).toBe(5)
    const geo = JSON.parse(readFileSync(join(dir, 'test/src/data.geojson'), 'utf8'))
    expect(geo.features.map((f: { properties: Json }) => f.properties.NAME)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
    expect(JSON.parse(readFileSync(join(dir, 'test/src/meta.json'), 'utf8'))).toMatchObject({ sourceId: 'test-src', expectedCount: 5, recordCount: 5, licenceStatus: 'open' })
  })

  it('fails a truncated fetch (one page missing)', async () => {
    await expect(snapshotSource(source, { fetch: arcgisFetch(5, { dropPage: 1 }) as never, outRoot: dir })).rejects.toThrow(/expected 5/)
    expect(existsSync(join(dir, 'test/src/data.geojson'))).toBe(false)
  })

  it('drops properties that are not allowlisted', () => {
    const out = applyAllowlist(feat(1), ['NAME'])
    expect(out.properties).toEqual({ NAME: 'P1' })
  })

  it('leaves previous files untouched when a source fails', async () => {
    mkdirSync(join(dir, 'test/src'), { recursive: true })
    writeFileSync(join(dir, 'test/src/data.geojson'), 'OLD-DATA')
    writeFileSync(join(dir, 'test/src/meta.json'), 'OLD-META')
    const lastRunPath = join(dir, 'last-run.json')
    const res = await runSnapshots({ sources: [source], fetch: arcgisFetch(5, { dropPage: 2 }) as never, outRoot: dir, lastRunPath })
    expect(res.ok).toBe(false)
    expect(readFileSync(join(dir, 'test/src/data.geojson'), 'utf8')).toBe('OLD-DATA')
    expect(readFileSync(join(dir, 'test/src/meta.json'), 'utf8')).toBe('OLD-META')
    const last = JSON.parse(readFileSync(lastRunPath, 'utf8'))
    expect(last.sources[0]).toMatchObject({ id: 'test-src', ok: false })
    expect(last.sources[0].error).toMatch(/expected 5/)
  })

  it('rejects an enabled source whose licenceStatus is not open', () => {
    expect(validateRegistry([source])).toEqual([])
    expect(validateRegistry([{ ...source, licenceStatus: 'unclear' }]).join()).toMatch(/must have licenceStatus "open"/)
    expect(validateRegistry([{ ...source, licenceStatus: 'unclear', enabled: false }])).toEqual([])
  })

  it('requires a licence and a known licenceStatus on every source', () => {
    const { licence: _licence, ...noLicence } = source
    expect(validateRegistry([noLicence as unknown as Source]).join()).toMatch(/missing licence/)
    expect(validateRegistry([{ ...source, licenceStatus: 'maybe' } as unknown as Source]).join()).toMatch(/bad licenceStatus/)
    expect(validateRegistry([{ ...source, licenceStatus: 'restricted' }]).join()).toMatch(/must have licenceStatus "open"/)
  })

  it('the committed registry is valid', async () => {
    const reg = JSON.parse(readFileSync(new URL('../pipeline/sources.config.json', import.meta.url), 'utf8'))
    expect(validateRegistry(reg)).toEqual([])
  })
})
