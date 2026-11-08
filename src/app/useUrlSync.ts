// Keeps the URL and the store in step: reads the URL on load and on Back/Forward, writes it as state changes.
import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { catalogStore } from '../features/places/catalogStore'
import { getCollections } from '../features/collections/collections'
import { onCameraChange } from '../lib/cameraBus'
import { parseUrlState, serializeUrlState, type ParsedUrlState, type UrlCamera, type UrlState } from '../lib/urlState'

const SEARCH_DEBOUNCE_MS = 400
const CAMERA_DEBOUNCE_MS = 300

export function useUrlSync() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return

    let camera: UrlCamera | null = null
    let pendingPlace: string | null = null
    let pendingOrigin: 'url' | 'user' = 'user'
    let applying = false
    let searchTimer: ReturnType<typeof setTimeout> | undefined
    let cameraTimer: ReturnType<typeof setTimeout> | undefined

    const current = (): UrlState => {
      const s = useAppStore.getState()
      return {
        place: s.selectedPlaceId ?? pendingPlace ?? s.missingPlaceId,
        themes: s.activeThemes,
        layers: s.layerOverrides,
        amenities: s.amenityFilters,
        view: s.view,
        q: s.searchQuery,
        town: s.town,
        map: camera,
        about: s.aboutOpen,
        collection: s.collectionId,
      }
    }
    const write = (mode: 'push' | 'replace', state: UrlState) => {
      const search = serializeUrlState(state)
      if (search === window.location.search) return
      const url = window.location.pathname + search + window.location.hash
      try {
        if (mode === 'push') window.history.pushState(null, '', url)
        else window.history.replaceState(null, '', url)
      } catch {
        // History can be blocked (sandboxed frames); the app works without it.
      }
    }
    const clearTimers = () => {
      clearTimeout(searchTimer)
      clearTimeout(cameraTimer)
      searchTimer = cameraTimer = undefined
    }

    // Resolve a place id from the URL once the catalog is ready.
    const resolvePending = () => {
      if (pendingPlace === null) return
      const snap = catalogStore.getSnapshot()
      if (snap.status !== 'ready') return
      const id = pendingPlace
      pendingPlace = null
      applying = true
      try {
        const st = useAppStore.getState()
        const exists = snap.places.some((p) => p.id === id)
        if (exists) st.applyUrlState(fromStore(st, id, null))
        else st.applyUrlState(fromStore(st, null, id))
      } finally {
        applying = false
      }
    }
    const fromStore = (st: ReturnType<typeof useAppStore.getState>, selected: string | null, missing: string | null) => ({
      themes: st.activeThemes,
      layers: st.layerOverrides,
      amenities: st.amenityFilters,
      view: st.view,
      searchQuery: st.searchQuery,
      town: st.town,
      about: st.aboutOpen,
      collectionId: st.collectionId,
      selectedPlaceId: selected,
      missingPlaceId: missing,
      origin: pendingOrigin,
    })

    const applyUrl = (parsed: ParsedUrlState) => {
      clearTimers()
      applying = true
      try {
        const st = useAppStore.getState()
        pendingPlace = null
        let selected: string | null = null
        let missing: string | null = null
        if (parsed.place) {
          const snap = catalogStore.getSnapshot()
          if (snap.status === 'ready') {
            if (snap.places.some((p) => p.id === parsed.place)) selected = parsed.place
            else missing = parsed.place
          } else {
            pendingPlace = parsed.place
            pendingOrigin = parsed.map ? 'url' : 'user'
          }
        }
        if (parsed.map) {
          camera = parsed.map
          st.requestCamera([parsed.map.lon, parsed.map.lat], parsed.map.zoom)
        }
        st.applyUrlState({
          themes: parsed.themes,
          layers: parsed.layers,
          amenities: parsed.amenities,
          view: parsed.view,
          searchQuery: parsed.q,
          town: parsed.town ?? null,
          about: parsed.about === true,
          collectionId: parsed.collection ?? null,
          selectedPlaceId: selected,
          missingPlaceId: missing,
          origin: parsed.map ? 'url' : 'user',
        })
        // A town in the URL without a camera or a place: show that town (a `map=` camera wins otherwise).
        if (parsed.town && !parsed.map && !parsed.place) st.requestFit()
      } finally {
        applying = false
      }
    }

    // An unknown collection id (not in this release) is ignored: cleared once the collections are known.
    const checkCollection = () => {
      if (useAppStore.getState().collectionId === null) return
      getCollections().then(
        (list) => {
          const id = useAppStore.getState().collectionId
          if (id === null || list.some((c) => c.id === id)) return
          applying = true
          try {
            useAppStore.getState().setCollectionId(null)
          } finally {
            applying = false
          }
          prev = useAppStore.getState()
          write('replace', current())
        },
        () => {
          // No collections available: leave the id alone; the panel shows nothing for it.
        },
      )
    }

    applyUrl(parseUrlState(window.location.search))
    const unsubCatalog = catalogStore.subscribe(resolvePending)
    catalogStore.ensureLoaded()
    resolvePending()

    let prev = useAppStore.getState()
    checkCollection()
    const unsubStore = useAppStore.subscribe((s) => {
      const before = prev
      prev = s
      if (applying) return
      // A user action cancels a place still waiting for the catalog.
      if (s.selectedPlaceId !== before.selectedPlaceId) pendingPlace = null
      const placeChanged = s.selectedPlaceId !== before.selectedPlaceId || s.missingPlaceId !== before.missingPlaceId
      const structural = placeChanged || s.view !== before.view || s.activeThemes !== before.activeThemes || s.layerOverrides !== before.layerOverrides || s.amenityFilters !== before.amenityFilters || s.town !== before.town || s.aboutOpen !== before.aboutOpen || s.collectionId !== before.collectionId
      if (structural) {
        const dismissed = before.missingPlaceId !== null && s.missingPlaceId === null && s.selectedPlaceId === before.selectedPlaceId
        // Flush a pending pan into the entry being left, so Back returns to where the user was.
        if (cameraTimer !== undefined && !dismissed) {
          clearTimeout(cameraTimer)
          cameraTimer = undefined
          write('replace', {
            place: before.selectedPlaceId ?? before.missingPlaceId,
            themes: before.activeThemes,
            layers: before.layerOverrides,
            amenities: before.amenityFilters,
            view: before.view,
            q: before.searchQuery,
            town: before.town,
            map: camera,
            about: before.aboutOpen,
            collection: before.collectionId,
          })
        }
        clearTimeout(searchTimer)
        searchTimer = undefined
        write(dismissed ? 'replace' : 'push', current())
      } else if (s.searchQuery !== before.searchQuery) {
        clearTimeout(searchTimer)
        searchTimer = setTimeout(() => write('replace', current()), SEARCH_DEBOUNCE_MS)
      }
    })

    const unsubCamera = onCameraChange((c) => {
      camera = c
      clearTimeout(cameraTimer)
      cameraTimer = setTimeout(() => {
        cameraTimer = undefined
        write('replace', current())
      }, CAMERA_DEBOUNCE_MS)
    })

    const onPopState = () => {
      applyUrl(parseUrlState(window.location.search))
      resolvePending()
      prev = useAppStore.getState()
      checkCollection()
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      clearTimers()
      window.removeEventListener('popstate', onPopState)
      unsubStore()
      unsubCamera()
      unsubCatalog()
    }
  }, [])
}
