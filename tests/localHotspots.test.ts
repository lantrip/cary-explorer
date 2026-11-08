// Tests the dev-only eBird hotspot conversion and its never-throwing loader.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hotspotsToCatalog, loadLocalHotspots } from '../src/features/places/localHotspots'

const feat = (over: Record<string, unknown> = {}) => ({
  type: 'Feature',
  properties: {
    locId: 'L1',
    locName: 'Hotspot One',
    lat: 35.79,
    lng: -78.78,
    subnational2Code: 'US-NC-183',
    ebirdUrl: 'https://ebird.org/hotspot/L1',
    inCaryLimits: true,
    ...over,
  },
})

afterEach(() => vi.unstubAllGlobals())

describe('hotspotsToCatalog', () => {
  it('keeps only in-Cary hotspots and maps fields', () => {
    const { places, source } = hotspotsToCatalog({
      retrievedAt: '2026-11-07T13:37:48.282Z',
      features: [
        feat(),
        feat({ locId: 'L2', inCaryLimits: false }),
        feat({ locId: 'L3', subnational2Code: 'US-NC-037' }),
        feat({ locId: 'L4', subnational2Code: 'US-NC-063' }),
      ],
    })
    expect(places.map((p) => p.id)).toEqual(['ebird-L1', 'ebird-L3', 'ebird-L4'])
    expect(places[0]).toMatchObject({
      name: 'Hotspot One',
      category: 'wildlife',
      theme: 'birds-wildlife',
      municipality: 'Cary',
      county: 'Wake',
      centroid: [-78.78, 35.79],
      url: 'https://ebird.org/hotspot/L1',
      localOnly: true,
      sourceIds: ['ebird'],
    })
    expect(places[1].county).toBe('Chatham')
    expect(places[2].county).toBe('Durham')
    expect(source.id).toBe('ebird')
    expect(source.retrievedAt).toBe('2026-11-07T13:37:48.282Z')
  })

  it('skips bad records', () => {
    const { places } = hotspotsToCatalog({
      features: [
        feat({ locId: '' }),
        feat({ locName: ' ' }),
        feat({ lat: NaN }),
        feat({ lng: 500 }),
        feat({ lat: 'x' }),
        feat({ ebirdUrl: 'http://evil.example/x' }),
        null,
        { properties: null },
        feat({ locId: 'OK' }),
      ],
    })
    expect(places.map((p) => p.id)).toEqual(['ebird-OK'])
  })

  it('tolerates a malformed payload', () => {
    expect(hotspotsToCatalog(null).places).toEqual([])
  })
})

describe('loadLocalHotspots', () => {
  it('returns null on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    expect(await loadLocalHotspots()).toBeNull()
  })
  it('returns null on bad JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))
    expect(await loadLocalHotspots()).toBeNull()
  })
  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await loadLocalHotspots()).toBeNull()
  })
  it('returns the payload on success', async () => {
    const body = { retrievedAt: 'x', features: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))))
    expect(await loadLocalHotspots()).toEqual(body)
  })
})
