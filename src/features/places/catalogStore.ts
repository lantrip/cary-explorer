// Framework-free store that loads the catalog once and shares the same arrays with every consumer.
import type { Place, Source } from '../../types/place'
import { loadCatalog, type Catalog } from './catalog'
import { getRelease } from './release'
import { loadLocalHotspots, hotspotsToCatalog } from './localHotspots'

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CatalogState {
  status: CatalogStatus
  places: Place[]
  sources: Source[]
  error?: string
}

export type CatalogLoader = (signal: AbortSignal) => Promise<Catalog>

export interface CatalogStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => CatalogState
  /** Starts the single shared load when idle; a no-op while loading, ready or failed (use retry). */
  ensureLoaded: () => void
  /** Starts a fresh load after a failure, keeping any earlier places/sources visible meanwhile. */
  retry: () => void
  /** Reloads from `ready`, keeping the current places/sources until the new load succeeds. */
  refresh: () => void
}

const NO_PLACES: Place[] = []
const NO_SOURCES: Source[] = []
const IDLE: CatalogState = { status: 'idle', places: NO_PLACES, sources: NO_SOURCES }

const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

/** Manifest, then the hashed catalog it names, plus, in dev only, local eBird preview data; its failure never fails the catalog. */
async function loadWithLocalPreview(signal: AbortSignal): Promise<Catalog> {
  const release = await getRelease()
  const catalog = await loadCatalog(release.catalogUrl, signal)
  if (!import.meta.env.DEV) return catalog
  const payload = await loadLocalHotspots(signal)
  if (!payload) return catalog
  const local = hotspotsToCatalog(payload)
  const placeIds = new Set(catalog.places.map((p) => p.id))
  const sourceIds = new Set(catalog.sources.map((s) => s.id))
  return {
    places: [...catalog.places, ...local.places.filter((p) => !placeIds.has(p.id))],
    sources: sourceIds.has(local.source.id) ? catalog.sources : [...catalog.sources, local.source],
  }
}

export function createCatalogStore(load: CatalogLoader = loadWithLocalPreview): CatalogStore {
  let state: CatalogState = IDLE
  let controller: AbortController | null = null
  // State to go back to if a load is cancelled (idle for a first load, ready/error data for a reload).
  let before: CatalogState = IDLE
  let subscriberCount = 0
  const listeners = new Set<() => void>()

  function set(next: CatalogState) {
    state = next
    listeners.forEach((listener) => listener())
  }

  function start() {
    const own = new AbortController()
    controller = own
    before = state
    // Earlier places and sources (same array identity) stay in place until a load succeeds.
    set({ status: 'loading', places: state.places, sources: state.sources })
    load(own.signal).then(
      (catalog) => {
        if (controller !== own) return
        controller = null
        set({ status: 'ready', places: catalog.places, sources: catalog.sources })
      },
      (err: unknown) => {
        // Aborted or superseded loads must not touch the state.
        if (controller !== own || own.signal.aborted || isAbort(err)) return
        controller = null
        const error = err instanceof Error ? err.message : 'Could not load places.'
        set({ status: 'error', places: state.places, sources: state.sources, error })
      },
    )
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      subscriberCount += 1
      let subscribed = true
      return () => {
        if (!subscribed) return
        subscribed = false
        listeners.delete(listener)
        subscriberCount -= 1
        // Nobody is waiting any more: cancel the request so a later mount starts clean.
        if (subscriberCount === 0 && state.status === 'loading') {
          const pending = controller
          controller = null
          pending?.abort()
          set(before)
        }
      }
    },
    getSnapshot: () => state,
    ensureLoaded() {
      if (state.status === 'idle') start()
    },
    retry() {
      if (state.status === 'error') start()
    },
    refresh() {
      if (state.status === 'ready') start()
    },
  }
}

export const catalogStore = createCatalogStore()
