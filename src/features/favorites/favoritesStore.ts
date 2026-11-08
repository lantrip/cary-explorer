// Device-local favorites: place ids only, in localStorage. Every storage call is wrapped; if storage is blocked
// (private mode, disabled site data) the list lives in memory and `persistent` is false so the UI can say so.
import { useSyncExternalStore } from 'react'

export const FAVORITES_KEY = 'cary-explorer:favorites:v1'
export const MAX_FAVORITES = 500
const PLACE_ID = /^[a-z0-9-]{1,120}$/

export interface FavoritesState {
  ids: string[]
  /** False when reading or writing storage failed; saved places then last only until the page closes. */
  persistent: boolean
}

/** Parses the stored text; anything that is not a JSON array of valid ids yields []. Duplicates are dropped. */
export function parseFavorites(raw: string | null): string[] {
  if (!raw || raw.length > 100_000) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const out: string[] = []
    for (const v of value) {
      if (typeof v === 'string' && PLACE_ID.test(v) && !out.includes(v)) out.push(v)
      if (out.length >= MAX_FAVORITES) break
    }
    return out
  } catch {
    return []
  }
}

/** Keeps only ids that exist in the catalog (order kept). */
export const pruneFavorites = (ids: readonly string[], known: ReadonlySet<string>) => ids.filter((id) => known.has(id))

export interface FavoritesStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => FavoritesState
  /** Adds or removes `id`. When `known` is given, ids missing from the catalog are pruned in the same save. */
  toggle: (id: string, known?: ReadonlySet<string>) => void
}

export type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'>

export function createFavoritesStore(getStorage: StorageGetter = () => window.localStorage): FavoritesStore {
  let persistent = true
  let ids: string[] = []
  try {
    ids = parseFavorites(getStorage().getItem(FAVORITES_KEY))
  } catch {
    persistent = false
  }
  let state: FavoritesState = { ids, persistent }
  const listeners = new Set<() => void>()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    getSnapshot: () => state,
    toggle(id, known) {
      if (!PLACE_ID.test(id)) return
      let next = state.ids.includes(id) ? state.ids.filter((x) => x !== id) : [...state.ids, id].slice(-MAX_FAVORITES)
      if (known) next = pruneFavorites(next, known)
      let ok: boolean
      try {
        getStorage().setItem(FAVORITES_KEY, JSON.stringify(next))
        ok = true
      } catch {
        ok = false
      }
      state = { ids: next, persistent: ok }
      listeners.forEach((l) => l())
    },
  }
}

export const favoritesStore = createFavoritesStore()

export function useFavorites(): FavoritesState {
  return useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot)
}
