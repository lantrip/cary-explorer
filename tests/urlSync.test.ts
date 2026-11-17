// useUrlSync is a React effect; React's useEffect is stubbed to run it once, with a minimal fake window.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ cleanup: undefined as undefined | (() => void) }))

vi.mock('react', () => ({
  useEffect: (fn: () => void | (() => void)) => {
    h.cleanup = fn() as undefined | (() => void)
  },
}))
vi.mock('../src/features/places/catalogStore', () => ({
  catalogStore: {
    getSnapshot: () => ({ status: 'ready', places: [{ id: 'p-1' }, { id: 'p-2' }], sources: [] }),
    subscribe: () => () => {},
    ensureLoaded: () => {},
  },
}))
vi.mock('../src/features/collections/collections', () => ({ getCollections: () => Promise.resolve([]) }))

import { useUrlSync } from '../src/app/useUrlSync'
import { useAppStore } from '../src/store/useAppStore'
import { reportCamera } from '../src/lib/cameraBus'
import { THEMES } from '../src/features/themes/themes'

type Call = { mode: 'push' | 'replace'; url: string }
let calls: Call[]
let listeners: Record<string, () => void>
let loc: { pathname: string; search: string; hash: string }

function installWindow(search: string) {
  calls = []
  listeners = {}
  loc = { pathname: '/', search, hash: '' }
  const record = (mode: Call['mode']) => (_s: unknown, _t: string, url: string) => {
    calls.push({ mode, url })
    loc.search = url.slice(loc.pathname.length)
  }
  ;(globalThis as { window?: unknown }).window = {
    location: loc,
    history: { pushState: record('push'), replaceState: record('replace') },
    addEventListener: (n: string, fn: () => void) => void (listeners[n] = fn),
    removeEventListener: (n: string) => void delete listeners[n],
  }
}
const popTo = (search: string) => {
  loc.search = search
  listeners.popstate()
}
const useMountedAt = (search: string) => {
  installWindow(search)
  useUrlSync()
}

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({
    selectedPlaceId: null,
    missingPlaceId: null,
    activeThemes: THEMES.map((t) => t.id),
    layerOverrides: {},
    amenityFilters: [],
    searchQuery: '',
    town: null,
    view: 'map',
    aboutOpen: false,
    collectionId: null,
    cameraRequest: null,
    fitRequest: null,
  })
})
afterEach(() => {
  h.cleanup?.()
  h.cleanup = undefined
  vi.useRealTimers()
  delete (globalThis as { window?: unknown }).window
})

describe('useUrlSync', () => {
  it('restores place, themes, town, amenities and camera from a shared link', () => {
    useMountedAt('?place=p-1&themes=water,history&town=apex&amenities=parking&map=15/35.8/-78.8')
    const s = useAppStore.getState()
    expect(s.selectedPlaceId).toBe('p-1')
    expect(s.activeThemes).toEqual(['history', 'water'])
    expect(s.town).toBe('apex')
    expect(s.amenityFilters).toEqual(['parking'])
    expect(s.cameraRequest).toMatchObject({ center: [-78.8, 35.8], zoom: 15 })
    expect(calls).toEqual([])
  })

  it('keeps an unknown place as missing rather than selecting it', () => {
    useMountedAt('?place=nope')
    expect(useAppStore.getState().selectedPlaceId).toBeNull()
    expect(useAppStore.getState().missingPlaceId).toBe('nope')
  })

  it('popstate to an earlier URL restores the earlier place and camera', () => {
    useMountedAt('?place=p-1&map=15/35.8/-78.8')
    useAppStore.getState().setSelectedPlaceId('p-2')
    expect(calls.at(-1)?.mode).toBe('push')
    expect(calls.at(-1)?.url).toContain('place=p-2')
    popTo('?place=p-1&map=15/35.8/-78.8')
    const s = useAppStore.getState()
    expect(s.selectedPlaceId).toBe('p-1')
    expect(s.cameraRequest).toMatchObject({ center: [-78.8, 35.8], zoom: 15 })
    popTo('')
    expect(useAppStore.getState().selectedPlaceId).toBeNull()
  })

  it('selecting a place pushes; a camera move replaces', () => {
    useMountedAt('')
    useAppStore.getState().setSelectedPlaceId('p-1')
    expect(calls).toEqual([{ mode: 'push', url: '/?place=p-1' }])
    reportCamera({ zoom: 14, lat: 35.8, lon: -78.8 })
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(300)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual({ mode: 'replace', url: '/?place=p-1&map=14.00/35.80000/-78.80000' })
  })

  it('a filter change pushes, including amenities', () => {
    useMountedAt('')
    useAppStore.getState().toggleAmenity('parking')
    expect(calls).toEqual([{ mode: 'push', url: '/?amenities=parking' }])
  })

  it('typing a search replaces after a debounce', () => {
    useMountedAt('')
    useAppStore.getState().setSearchQuery('duck')
    expect(calls).toEqual([])
    vi.advanceTimersByTime(400)
    expect(calls).toEqual([{ mode: 'replace', url: '/?q=duck' }])
  })
})
