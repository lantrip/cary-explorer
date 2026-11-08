import { describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../src/features/places/catalog'
import { createCatalogStore, type CatalogLoader } from '../src/features/places/catalogStore'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import type { Place } from '../src/types/place'

const place = (id: string): Place => ({
  id,
  name: `Place ${id}`,
  aliases: [],
  category: 'park',
  theme: CATEGORY_THEME.park,
  municipality: 'Example Town',
  centroid: [-78.8, 35.8],
  description: 'Synthetic test record.',
  sourceIds: ['example-source'],
})

const catalog = (): Catalog => ({
  places: [place('a'), place('b')],
  sources: [{ id: 'example-source', name: 'Example', url: 'https://example.com' }],
})

interface Pending {
  signal: AbortSignal
  resolve: (value: Catalog) => void
  reject: (reason: unknown) => void
}

// A loader whose calls stay pending until the test settles them.
function fakeLoader() {
  const calls: Pending[] = []
  const loader: CatalogLoader = (signal) =>
    new Promise<Catalog>((resolve, reject) => {
      calls.push({ signal, resolve, reject })
    })
  return { loader: vi.fn(loader), calls }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('catalog store', () => {
  it('loads once for concurrent callers and shares the same arrays', async () => {
    const { loader, calls } = fakeLoader()
    const store = createCatalogStore(loader)
    const seen: Place[][] = []
    const unsubscribers = [0, 1, 2].map(() =>
      store.subscribe(() => {
        if (store.getSnapshot().status === 'ready') seen.push(store.getSnapshot().places)
      }),
    )
    store.ensureLoaded()
    store.ensureLoaded()
    store.ensureLoaded()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().status).toBe('loading')

    calls[0].resolve(catalog())
    await flush()

    expect(loader).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().status).toBe('ready')
    expect(seen).toHaveLength(3)
    expect(seen[1]).toBe(seen[0])
    expect(seen[2]).toBe(seen[0])
    expect(seen[0]).toBe(store.getSnapshot().places)
    store.ensureLoaded()
    expect(loader).toHaveBeenCalledTimes(1)
    unsubscribers.forEach((u) => u())
  })

  it('aborts and resets to idle when the last subscriber leaves mid-load, then restarts once', async () => {
    const { loader, calls } = fakeLoader()
    const store = createCatalogStore(loader)
    const first = store.subscribe(() => {})
    const second = store.subscribe(() => {})
    store.ensureLoaded()
    first()
    expect(calls[0].signal.aborted).toBe(false)
    second()
    expect(calls[0].signal.aborted).toBe(true)
    expect(store.getSnapshot().status).toBe('idle')

    // A late AbortError (or even a late success) from the cancelled load must not change the state.
    calls[0].reject(new DOMException('aborted', 'AbortError'))
    await flush()
    expect(store.getSnapshot().status).toBe('idle')

    const again = store.subscribe(() => {})
    store.ensureLoaded()
    store.ensureLoaded()
    expect(loader).toHaveBeenCalledTimes(2)
    calls[1].resolve(catalog())
    await flush()
    expect(store.getSnapshot().status).toBe('ready')
    again()
  })

  it('survives a StrictMode style subscribe, unsubscribe, subscribe sequence with one completed load', async () => {
    const { loader, calls } = fakeLoader()
    const store = createCatalogStore(loader)
    let unsubscribe = store.subscribe(() => {})
    store.ensureLoaded()
    unsubscribe()
    unsubscribe = store.subscribe(() => {})
    store.ensureLoaded()
    calls[0].resolve(catalog()) // stale, aborted request resolving late is ignored
    await flush()
    expect(store.getSnapshot().status).toBe('loading')
    calls[1].resolve(catalog())
    await flush()
    expect(store.getSnapshot().status).toBe('ready')
    expect(loader).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('moves from error to loading to ready on retry', async () => {
    const { loader, calls } = fakeLoader()
    const store = createCatalogStore(loader)
    const unsubscribe = store.subscribe(() => {})
    store.ensureLoaded()
    calls[0].reject(new Error('Catalog request failed (500).'))
    await flush()
    expect(store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'Catalog request failed (500).',
    })

    store.ensureLoaded() // a failure is sticky until the user retries
    expect(loader).toHaveBeenCalledTimes(1)

    store.retry()
    expect(store.getSnapshot().status).toBe('loading')
    expect(loader).toHaveBeenCalledTimes(2)
    calls[1].resolve(catalog())
    await flush()
    expect(store.getSnapshot().status).toBe('ready')
    expect(store.getSnapshot().places).toHaveLength(2)
    unsubscribe()
  })

  it('keeps the snapshot identity stable until something changes', async () => {
    const { loader, calls } = fakeLoader()
    const store = createCatalogStore(loader)
    const idle = store.getSnapshot()
    expect(store.getSnapshot()).toBe(idle)
    const unsubscribe = store.subscribe(() => {})
    store.ensureLoaded()
    const loading = store.getSnapshot()
    expect(loading).not.toBe(idle)
    expect(store.getSnapshot()).toBe(loading)
    store.ensureLoaded()
    expect(store.getSnapshot()).toBe(loading)

    calls[0].resolve(catalog())
    await flush()
    const ready = store.getSnapshot()
    expect(ready).not.toBe(loading)
    expect(store.getSnapshot()).toBe(ready)
    store.ensureLoaded()
    store.retry() // retry outside the error state does nothing
    expect(store.getSnapshot()).toBe(ready)
    expect(store.getSnapshot().places).toBe(ready.places)
    unsubscribe()
  })

  describe('refresh keeps the last data', () => {
    async function readyStore() {
      const { loader, calls } = fakeLoader()
      const store = createCatalogStore(loader)
      const unsubscribe = store.subscribe(() => {})
      store.ensureLoaded()
      calls[0].resolve(catalog())
      await flush()
      return { store, calls, unsubscribe, loader }
    }

    it('keeps the same arrays while a refresh is loading', async () => {
      const { store, calls, unsubscribe, loader } = await readyStore()
      const { places, sources } = store.getSnapshot()
      store.refresh()
      expect(loader).toHaveBeenCalledTimes(2)
      expect(store.getSnapshot().status).toBe('loading')
      expect(store.getSnapshot().places).toBe(places)
      expect(store.getSnapshot().sources).toBe(sources)
      calls[1].resolve(catalog())
      await flush()
      unsubscribe()
    })

    it('keeps old data and reports the error when a refresh fails, and retry keeps it too', async () => {
      const { store, calls, unsubscribe } = await readyStore()
      const { places, sources } = store.getSnapshot()
      store.refresh()
      calls[1].reject(new Error('Catalog request failed (500).'))
      await flush()
      expect(store.getSnapshot()).toMatchObject({
        status: 'error',
        error: 'Catalog request failed (500).',
      })
      expect(store.getSnapshot().places).toBe(places)
      expect(store.getSnapshot().sources).toBe(sources)

      store.retry()
      expect(store.getSnapshot().status).toBe('loading')
      expect(store.getSnapshot().places).toBe(places)
      calls[2].resolve(catalog())
      await flush()
      expect(store.getSnapshot().status).toBe('ready')
      unsubscribe()
    })

    it('swaps to the new arrays when a refresh succeeds', async () => {
      const { store, calls, unsubscribe } = await readyStore()
      const { places, sources } = store.getSnapshot()
      store.refresh()
      const next = { places: [place('c')], sources: [] }
      calls[1].resolve(next)
      await flush()
      expect(store.getSnapshot().status).toBe('ready')
      expect(store.getSnapshot().places).toBe(next.places)
      expect(store.getSnapshot().places).not.toBe(places)
      expect(store.getSnapshot().sources).toBe(next.sources)
      expect(store.getSnapshot().sources).not.toBe(sources)
      unsubscribe()
    })

    it('refresh is a no-op unless ready, and a cancelled refresh restores the ready data', async () => {
      const { store, calls, unsubscribe, loader } = await readyStore()
      const ready = store.getSnapshot()
      store.refresh()
      store.refresh() // already loading
      expect(loader).toHaveBeenCalledTimes(2)
      unsubscribe() // last subscriber leaves mid-refresh
      expect(calls[1].signal.aborted).toBe(true)
      expect(store.getSnapshot().status).toBe('ready')
      expect(store.getSnapshot().places).toBe(ready.places)
    })
  })
})
