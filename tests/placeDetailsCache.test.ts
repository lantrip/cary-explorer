import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPlaceDetailsCached, getCachedPlaceDetails } from '../src/features/places/placeDetails'

const BODY = { fields: [{ key: 'parking', label: 'Parking', status: 'known', value: 'Lot A', sourceId: 's', verifiedAt: '2026-11-02' }] }
const ok = () => new Response(JSON.stringify(BODY), { status: 200 })
const signal = () => new AbortController().signal

afterEach(() => vi.unstubAllGlobals())

describe('place details cache rule', () => {
  it('caches successful results and does not refetch', async () => {
    const fetchMock = vi.fn(async () => ok())
    vi.stubGlobal('fetch', fetchMock)
    const first = await loadPlaceDetailsCached('/p/', 'ok-place', signal())
    expect(first?.fields).toHaveLength(1)
    await loadPlaceDetailsCached('/p/', 'ok-place', signal())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getCachedPlaceDetails('ok-place')).not.toBeUndefined()
  })

  it('caches a genuine 404 as missing', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadPlaceDetailsCached('/p/', 'gone-place', signal())).toBeNull()
    expect(await loadPlaceDetailsCached('/p/', 'gone-place', signal())).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(getCachedPlaceDetails('gone-place')).toBeNull()
  })

  it('does not cache a network error, so a retry can succeed', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadPlaceDetailsCached('/p/', 'blip-place', signal())).rejects.toThrow()
    expect(getCachedPlaceDetails('blip-place')).toBeUndefined()
    expect((await loadPlaceDetailsCached('/p/', 'blip-place', signal()))?.fields).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache an HTTP 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(loadPlaceDetailsCached('/p/', 'down-place', signal())).rejects.toThrow('503')
    expect(getCachedPlaceDetails('down-place')).toBeUndefined()
  })
})
