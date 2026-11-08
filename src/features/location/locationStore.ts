// "Near me" state. Coordinates live only in this in-memory store: never in the URL, storage or any request.
import { create } from 'zustand'

export type LocationStatus = 'idle' | 'requesting' | 'on' | 'denied' | 'unavailable' | 'error'

interface LocationState {
  status: LocationStatus
  /** [lon, lat] */
  coords: [number, number] | null
  accuracy: number | null
  /** Call only from a user action. */
  request: () => void
  stop: () => void
}

// Ignores a late browser answer after stop() or a newer request.
let requestSeq = 0

export const useLocationStore = create<LocationState>((set, get) => ({
  status: 'idle',
  coords: null,
  accuracy: null,
  request: () => {
    if (get().status === 'requesting') return
    const geo = typeof navigator === 'undefined' ? undefined : navigator.geolocation
    if (!geo) {
      set({ status: 'unavailable', coords: null, accuracy: null })
      return
    }
    const seq = ++requestSeq
    set({ status: 'requesting', coords: null, accuracy: null })
    try {
      geo.getCurrentPosition(
        (pos) => {
          if (seq !== requestSeq) return
          set({
            status: 'on',
            coords: [pos.coords.longitude, pos.coords.latitude],
            accuracy: pos.coords.accuracy,
          })
        },
        (err) => {
          if (seq !== requestSeq) return
          // 1 = permission denied, 2 = position unavailable, 3 = timeout.
          const status: LocationStatus = err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : 'error'
          set({ status, coords: null, accuracy: null })
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      )
    } catch {
      set({ status: 'error', coords: null, accuracy: null })
    }
  },
  stop: () => {
    requestSeq++
    set({ status: 'idle', coords: null, accuracy: null })
  },
}))

export const NEAR_ME_UNAVAILABLE_TEXT =
  'Location is off or unavailable. Search and filters still work — you can also pick a town.'
