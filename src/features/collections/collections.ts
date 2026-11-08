// Curated collections from the release (`artifacts.collections`): parse, load, and resolve to catalog places.
import { useEffect, useMemo, useState } from 'react'
import { fetchBoundedJson } from '../../lib/boundedJson'
import { isRecord } from '../../lib/guards'
import type { Place } from '../../types/place'
import { getRelease } from '../places/release'
import { usePlaces } from '../places/usePlaces'

export interface Collection {
  id: string
  title: string
  summary: string
  placeIds: string[]
  /** The rule used to choose the places. */
  curation: string
}

export const COLLECTION_ID = /^[a-z0-9-]{1,60}$/
export const COLLECTIONS_MAX_BYTES = 64 * 1024

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

/** Lenient parse: invalid collections are dropped, duplicates keep the first, never throws. */
export function parseCollections(raw: unknown): Collection[] {
  if (!isRecord(raw) || !Array.isArray(raw.collections)) return []
  const out: Collection[] = []
  const seen = new Set<string>()
  for (const c of raw.collections) {
    if (!isRecord(c)) continue
    const id = text(c.id)
    const title = text(c.title)
    const summary = text(c.summary)
    const curation = text(c.curation)
    if (!id || !COLLECTION_ID.test(id) || seen.has(id) || !title || !summary || !curation) continue
    if (!Array.isArray(c.placeIds)) continue
    const placeIds = [...new Set(c.placeIds.filter((p): p is string => typeof p === 'string' && p.length > 0))]
    if (placeIds.length === 0) continue
    seen.add(id)
    out.push({ id, title, summary, placeIds, curation })
  }
  return out
}

/** The collection's places in its own order; ids missing from the catalog are dropped silently. */
export function resolveCollectionPlaces(collection: Collection, places: readonly Place[]): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]))
  const out: Place[] = []
  for (const id of collection.placeIds) {
    const p = byId.get(id)
    if (p) out.push(p)
  }
  return out
}

export async function loadCollections(url: string, signal: AbortSignal): Promise<Collection[]> {
  return parseCollections(
    await fetchBoundedJson(url, {
      signal,
      maxBytes: COLLECTIONS_MAX_BYTES,
      label: 'Collections',
      budgetMessage: 'Collections exceed the download budget.',
    }),
  )
}

let shared: Promise<Collection[]> | null = null

/** One fetch per page; a release without collections gives []. A failure clears the cache so the next call retries. */
export function getCollections(): Promise<Collection[]> {
  shared ??= getRelease()
    .then((release) => (release.collectionsUrl ? loadCollections(release.collectionsUrl, new AbortController().signal) : []))
    .catch((err: unknown) => {
      shared = null
      throw err
    })
  return shared
}

export interface CollectionsResult {
  status: 'loading' | 'ready' | 'error'
  collections: Collection[]
}

export function useCollections(): CollectionsResult {
  const [state, setState] = useState<CollectionsResult>({ status: 'loading', collections: [] })
  useEffect(() => {
    let live = true
    getCollections().then(
      (collections) => live && setState({ status: 'ready', collections }),
      // Collections are optional: a failure just means none are offered.
      () => live && setState({ status: 'error', collections: [] }),
    )
    return () => {
      live = false
    }
  }, [])
  return state
}

/** The open collection and its resolved places, or null when none is open or the id is unknown. */
export function useOpenCollection(collectionId: string | null): { collection: Collection; places: Place[] } | null {
  const { collections } = useCollections()
  const { places } = usePlaces()
  return useMemo(() => {
    if (!collectionId) return null
    const collection = collections.find((c) => c.id === collectionId)
    return collection ? { collection, places: resolveCollectionPlaces(collection, places) } : null
  }, [collectionId, collections, places])
}
