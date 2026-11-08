import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCatalogStore } from '../src/features/places/catalogStore'
import { placeDetailsUrl } from '../src/features/places/placeDetails'
import {
  loadManifest,
  parseManifest,
  releaseSummary,
  resetRelease,
} from '../src/features/places/release'

const manifest = (over: Record<string, unknown> = {}, artifacts: Record<string, unknown> = {}) => ({
  version: '4188bdab5a4741a2',
  generatedFrom: '2026-11-07T17:40:46.521Z',
  artifacts: {
    catalog: 'catalog.7462e19b5925.json',
    relationships: 'relationships.bbfba91afdb4.json',
    layers: { greenways: 'layers/greenways.711f94690142.geojson' },
    places: 'places/013a6ae0fd06/',
    ...artifacts,
  },
  sources: [],
  ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRelease()
})

describe('parseManifest', () => {
  it('accepts the real format and resolves paths under /data/', () => {
    expect(parseManifest(manifest())).toEqual({
      id: '4188bdab5a4741a2',
      generatedFrom: '2026-11-07T17:40:46.521Z',
      catalogUrl: '/data/catalog.7462e19b5925.json',
      relationshipsUrl: '/data/relationships.bbfba91afdb4.json',
      placesBaseUrl: '/data/places/013a6ae0fd06/',
      layerUrls: { greenways: '/data/layers/greenways.711f94690142.geojson' },
      sources: [],
    })
  })

  it('allows missing layers and drops a bad generatedFrom', () => {
    const r = parseManifest(manifest({ generatedFrom: 'not a date' }, { layers: undefined }))
    expect(r.generatedFrom).toBeUndefined()
    expect(r.layerUrls).toEqual({})
  })

  it('parses manifest sources, skips entries without an id and treats a missing ok as true', () => {
    const r = parseManifest(
      manifest({
        sources: [
          { id: 'a', recordCount: 3, retrievedAt: '2026-11-07T00:00:00Z', licence: 'CC0 1.0', lastSuccess: '2026-11-06T00:00:00Z', ok: false },
          { id: 'b' },
          { licence: 'no id' },
          'junk',
        ],
      }),
    )
    expect(r.sources).toEqual([
      { id: 'a', recordCount: 3, retrievedAt: '2026-11-07T00:00:00Z', licence: 'CC0 1.0', licenceStatus: undefined, lastSuccess: '2026-11-06T00:00:00Z', ok: false },
      { id: 'b', recordCount: undefined, retrievedAt: undefined, licence: undefined, licenceStatus: undefined, lastSuccess: undefined, ok: true },
    ])
  })

  it('rejects a bad version and a missing artifacts block', () => {
    expect(() => parseManifest(manifest({ version: 'xyz' }))).toThrow(/version/)
    expect(() => parseManifest(manifest({ version: 'ABCDEF12' }))).toThrow(/version/)
    expect(() => parseManifest(manifest({ artifacts: undefined }))).toThrow(/artifacts/)
    expect(() => parseManifest(null)).toThrow(/object/)
  })

  it.each([
    ['absolute path', '/etc/catalog.json'],
    ['parent segment', 'a/../catalog.json'],
    ['url', 'https://evil.example/catalog.json'],
    ['double slash', 'a//catalog.json'],
    ['uppercase', 'Catalog.json'],
  ])('rejects a catalog path with %s', (_name, path) => {
    expect(() => parseManifest(manifest({}, { catalog: path }))).toThrow(/safe relative path/)
  })

  it('rejects an unsafe layer path and a places path without a trailing slash', () => {
    expect(() => parseManifest(manifest({}, { layers: { x: '../x.geojson' } }))).toThrow(/layers\.x/)
    expect(() => parseManifest(manifest({}, { places: 'places/013a6ae0fd06' }))).toThrow(/end with/)
  })
})

describe('loadManifest', () => {
  it('fails on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })))
    await expect(loadManifest('/m.json', new AbortController().signal)).rejects.toThrow(
      'Manifest request failed (404).',
    )
  })

  it('enforces the byte budget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('a'.repeat(50))))
    await expect(loadManifest('/m.json', new AbortController().signal, 10)).rejects.toThrow(
      'download budget',
    )
  })

  it('sends cache: no-cache with the signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(manifest())))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const release = await loadManifest('/m.json', controller.signal)
    expect(release.id).toBe('4188bdab5a4741a2')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(fetchMock.mock.calls[0][0]).toBe('/m.json')
    expect(init.cache).toBe('no-cache')
    expect(init.signal?.aborted).toBe(false)
  })
})

describe('catalog load chain', () => {
  const catalogBody = {
    sources: [
      { id: 's', name: 'S', url: 'https://example.org', retrievedAt: '2026-11-02', license: 'CC0' },
    ],
    places: [],
  }
  const flush = () => new Promise((r) => setTimeout(r, 10))

  beforeEach(() => resetRelease())

  it('fetches the manifest, then the hashed catalog; retry refetches the manifest', async () => {
    let manifestOk = false
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/data/manifest.json') {
        return manifestOk
          ? new Response(JSON.stringify(manifest()))
          : new Response('x', { status: 503 })
      }
      if (url === '/data/catalog.7462e19b5925.json') return new Response(JSON.stringify(catalogBody))
      return new Response('', { status: 404 }) // dev-only local preview probe
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = createCatalogStore()
    const unsubscribe = store.subscribe(() => {})
    store.ensureLoaded()
    await flush()
    expect(store.getSnapshot().status).toBe('error')
    expect(store.getSnapshot().error).toMatch(/Manifest request failed \(503\)/)
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/data/manifest.json'])

    manifestOk = true
    store.retry()
    await flush()
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls.slice(0, 3)).toEqual([
      '/data/manifest.json',
      '/data/manifest.json',
      '/data/catalog.7462e19b5925.json',
    ])
    expect(store.getSnapshot().status).toBe('ready')
    unsubscribe()
  })
})

describe('place details url', () => {
  it('uses the release places base', () => {
    const base = parseManifest(manifest()).placesBaseUrl
    expect(placeDetailsUrl(base, 'bond-park')).toBe('/data/places/013a6ae0fd06/bond-park.json')
  })
})

describe('release summary (shown in PlaceCard sources)', () => {
  const release = parseManifest(manifest())
  it('gives the short id and UTC date', () => {
    expect(releaseSummary(release)).toEqual({ shortId: '4188bdab', date: 'Nov 7, 2026' })
  })
  it('omits the date when missing', () => {
    expect(releaseSummary({ ...release, generatedFrom: undefined })).toEqual({
      shortId: '4188bdab',
      date: undefined,
    })
  })
})

describe('real published manifest', () => {
  it('maps every artifact URL to an existing file under public/', () => {
    const raw = JSON.parse(readFileSync(join('public', 'data', 'manifest.json'), 'utf8')) as unknown
    const release = parseManifest(raw)
    const onDisk = (url: string) => existsSync(join('public', url))
    expect(onDisk(release.catalogUrl)).toBe(true)
    expect(onDisk(release.relationshipsUrl)).toBe(true)
    for (const url of Object.values(release.layerUrls)) expect(onDisk(url)).toBe(true)
    const catalog = JSON.parse(readFileSync(join('public', release.catalogUrl), 'utf8')) as {
      places: { id: string }[]
    }
    expect(onDisk(placeDetailsUrl(release.placesBaseUrl, catalog.places[0].id))).toBe(true)
  })
})
