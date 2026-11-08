// Subscribes to the shared catalog store (one fetch for the whole app) and exposes its status.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Place, Source } from '../../types/place'
import { catalogStore } from './catalogStore'

export interface PlacesResult {
  places: Place[]
  sources: Source[]
  status: 'loading' | 'ready' | 'error'
  error?: string
  retry: () => void
  refresh: () => void
}

export function usePlaces(): PlacesResult {
  const snapshot = useSyncExternalStore(catalogStore.subscribe, catalogStore.getSnapshot)

  // Subscribing happens before this effect runs, so an unmount-remount (StrictMode) cancels and restarts cleanly.
  useEffect(() => {
    catalogStore.ensureLoaded()
  }, [])

  return useMemo(
    () => ({
      places: snapshot.places,
      sources: snapshot.sources,
      status: snapshot.status === 'idle' ? 'loading' : snapshot.status,
      error: snapshot.error,
      retry: catalogStore.retry,
      refresh: catalogStore.refresh,
    }),
    [snapshot],
  )
}
