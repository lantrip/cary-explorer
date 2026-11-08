import { beforeEach, describe, expect, it } from 'vitest'
import { chooseFocusTarget } from '../src/features/places/focusReturn'
import { useAppStore } from '../src/store/useAppStore'

beforeEach(() => {
  useAppStore.setState({ selectedPlaceId: null, view: 'map', sheetState: 'peek' })
})

describe('view switching keeps the selection', () => {
  it("setView('list') keeps selectedPlaceId", () => {
    useAppStore.getState().setSelectedPlaceId('p1')
    useAppStore.getState().setView('list')
    expect(useAppStore.getState().view).toBe('list')
    expect(useAppStore.getState().selectedPlaceId).toBe('p1')
  })

  it("setView('map') after list still has the selection", () => {
    useAppStore.getState().setSelectedPlaceId('p1')
    useAppStore.getState().setView('list')
    useAppStore.getState().setView('map')
    expect(useAppStore.getState().selectedPlaceId).toBe('p1')
  })

  it('list opens the sheet full and map brings full back to half', () => {
    useAppStore.getState().setView('list')
    expect(useAppStore.getState().sheetState).toBe('full')
    useAppStore.getState().setView('map')
    expect(useAppStore.getState().sheetState).toBe('half')
  })
})

describe('chooseFocusTarget', () => {
  const base = { rememberedConnected: false, rememberedWasListRow: false, fromMap: false }
  it('returns to the remembered element while it is in the document', () => {
    expect(chooseFocusTarget({ ...base, rememberedConnected: true })).toBe('remembered')
  })
  it('goes back to the list row when the row was unmounted', () => {
    expect(chooseFocusTarget({ ...base, rememberedWasListRow: true })).toBe('row')
  })
  it('focuses the map when the selection came from the map', () => {
    expect(chooseFocusTarget({ ...base, fromMap: true })).toBe('map')
  })
  it('falls back to search otherwise', () => {
    expect(chooseFocusTarget(base)).toBe('search')
  })
})

describe('desktop panel collapse', () => {
  beforeEach(() => useAppStore.setState({ panelCollapsed: false }))

  it('defaults to open and toggles', () => {
    expect(useAppStore.getState().panelCollapsed).toBe(false)
    useAppStore.getState().togglePanel()
    expect(useAppStore.getState().panelCollapsed).toBe(true)
    useAppStore.getState().setPanelCollapsed(false)
    expect(useAppStore.getState().panelCollapsed).toBe(false)
  })

  it('selecting a place re-opens a collapsed panel; clearing the selection does not change it', () => {
    useAppStore.getState().setPanelCollapsed(true)
    useAppStore.getState().setSelectedPlaceId('p1')
    expect(useAppStore.getState().panelCollapsed).toBe(false)
    useAppStore.getState().setPanelCollapsed(true)
    useAppStore.getState().setSelectedPlaceId(null)
    expect(useAppStore.getState().panelCollapsed).toBe(true)
  })
})

describe('town filter state', () => {
  it('defaults to all towns and setTown sets and clears it', () => {
    useAppStore.setState({ town: null })
    useAppStore.getState().setTown('apex')
    expect(useAppStore.getState().town).toBe('apex')
    useAppStore.getState().setTown(null)
    expect(useAppStore.getState().town).toBeNull()
  })
  it('keeps the selection when the town changes', () => {
    useAppStore.getState().setSelectedPlaceId('p1')
    useAppStore.getState().setTown('garner')
    expect(useAppStore.getState().selectedPlaceId).toBe('p1')
  })
  it('applyUrlState sets and resets the town', () => {
    useAppStore.getState().applyUrlState({ town: 'wendell', selectedPlaceId: null, origin: 'url' })
    expect(useAppStore.getState().town).toBe('wendell')
    useAppStore.getState().applyUrlState({ selectedPlaceId: null, origin: 'url' })
    expect(useAppStore.getState().town).toBeNull()
  })
})

describe('town fit request', () => {
  it('bumps only when a town is chosen', () => {
    useAppStore.setState({ town: null, fitRequest: null })
    useAppStore.getState().setTown('apex')
    expect(useAppStore.getState().fitRequest?.seq).toBe(1)
    useAppStore.getState().setTown(null)
    expect(useAppStore.getState().fitRequest?.seq).toBe(1)
    useAppStore.getState().setTown('knightdale')
    expect(useAppStore.getState().fitRequest?.seq).toBe(2)
    useAppStore.getState().applyUrlState({ town: 'wendell', selectedPlaceId: null, origin: 'url' })
    expect(useAppStore.getState().fitRequest?.seq).toBe(2)
  })
})
