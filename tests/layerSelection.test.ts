import { beforeEach, describe, expect, it } from 'vitest'
import {
  LAYER_IDS,
  LAYER_THEME,
  THEME_DEFAULTS,
  THEME_ORDER,
  defaultLayers,
  emptyLayersText,
  filterByLayers,
  hiddenCategories,
  isGeometryShown,
  layerNames,
  layersHidingPlaces,
  normalizeOverrides,
  parseLayers,
  reconcileOverrides,
  resolveLayers,
  serializeLayers,
  showAllOverrides,
  switchedOffLayers,
} from '../src/features/themes/layerSelection'
import { createPlaceSearch } from '../src/features/search/searchIndex'
import { CATEGORY_THEME } from '../src/features/themes/themes'
import { ALL_THEME_IDS, parseUrlState, serializeUrlState, type UrlState } from '../src/lib/urlState'
import { useAppStore } from '../src/store/useAppStore'
import type { CategoryId, Place } from '../src/types/place'

const place = (id: string, category: CategoryId): Place => ({
  id,
  name: `Place ${id}`,
  aliases: [],
  category,
  theme: CATEGORY_THEME[category],
  municipality: 'Cary',
  coverage: 'core',
  centroid: [-78.8, 35.8],
  description: '',
  sourceIds: [],
})
const ALL = [...ALL_THEME_IDS]

describe('THEME_DEFAULTS', () => {
  it('covers every theme and only lists layers of that theme', () => {
    expect(Object.keys(THEME_DEFAULTS).sort()).toEqual([...THEME_ORDER].sort())
    for (const theme of THEME_ORDER) {
      expect(THEME_DEFAULTS[theme].length).toBeGreaterThan(0)
      for (const id of THEME_DEFAULTS[theme]) expect(LAYER_THEME[id]).toBe(theme)
    }
  })
  it('keeps proposed trails and fire stations off, parks and park outlines on', () => {
    const on = defaultLayers(ALL)
    expect(on).toContain('park')
    expect(on).toContain('trail')
    expect(on).toContain('park-outlines')
    expect(on).not.toContain('proposed-trails')
    expect(on).not.toContain('fire-station')
  })
  it('gives every layer a theme', () => {
    for (const id of LAYER_IDS) expect(THEME_ORDER).toContain(LAYER_THEME[id])
  })
})

describe('applying a theme', () => {
  beforeEach(() => useAppStore.setState({ activeThemes: [...ALL], layerOverrides: {} }))

  it('resolves to the defaults of the active themes only', () => {
    expect(resolveLayers(['water'], {})).toEqual(['water'])
    expect(resolveLayers(['parks-trails'], {})).toEqual(['park', 'trail', 'park-outlines'])
  })
  it('turning a theme on resets that theme to its defaults, leaving the others alone', () => {
    const s = useAppStore.getState()
    s.setLayer('proposed-trails', true)
    s.setLayer('fire-station', true)
    expect(useAppStore.getState().layerOverrides).toEqual({ 'proposed-trails': true, 'fire-station': true })
    s.toggleTheme('parks-trails')
    s.toggleTheme('parks-trails')
    expect(useAppStore.getState().layerOverrides).toEqual({ 'fire-station': true })
    expect(resolveLayers(useAppStore.getState().activeThemes, useAppStore.getState().layerOverrides)).not.toContain('proposed-trails')
  })
  it('turning a theme off hides its layers and drops its overrides', () => {
    const s = useAppStore.getState()
    s.setLayer('fire-station', true)
    s.toggleTheme('art-community')
    const st = useAppStore.getState()
    expect(st.layerOverrides).toEqual({})
    expect(resolveLayers(st.activeThemes, st.layerOverrides)).not.toContain('community')
  })
  it('ignores switches that equal the default', () => {
    useAppStore.getState().setLayer('trail', true)
    expect(useAppStore.getState().layerOverrides).toEqual({})
  })
  it('reconcile keeps overrides of unchanged themes', () => {
    expect(reconcileOverrides(ALL, ['parks-trails', 'water'], { 'fire-station': true, 'proposed-trails': true })).toEqual({
      'proposed-trails': true,
    })
  })
  it('showAll turns on every non-default layer of the active themes', () => {
    expect(showAllOverrides(ALL)).toEqual({ 'proposed-trails': true, 'fire-station': true })
    expect(showAllOverrides(['water'])).toEqual({})
  })
  it('applyUrlState normalises layers against the themes', () => {
    useAppStore.getState().applyUrlState({
      themes: ['water'],
      layers: { 'proposed-trails': true, water: false },
      selectedPlaceId: null,
      origin: 'user',
    })
    expect(useAppStore.getState().layerOverrides).toEqual({ water: false })
  })
})

describe('the filter selector', () => {
  const places = [place('a', 'park'), place('b', 'trail'), place('c', 'community'), place('d', 'fire-station')]

  it('hides places of switched-off categories', () => {
    const sel = resolveLayers(ALL, { trail: false })
    expect(filterByLayers(places, sel).map((p) => p.id)).toEqual(['a', 'c'])
  })
  it('shows fire stations once switched on', () => {
    expect(filterByLayers(places, resolveLayers(ALL, {})).map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(filterByLayers(places, resolveLayers(ALL, { 'fire-station': true })).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('proposed trails off removes proposed segments only; park outlines off removes areas only', () => {
    const base = resolveLayers(ALL, {})
    expect(isGeometryShown('line', 'existing', base)).toBe(true)
    expect(isGeometryShown('line', 'proposed', base)).toBe(false)
    expect(isGeometryShown('area', 'existing', base)).toBe(true)
    const proposedOn = resolveLayers(ALL, { 'proposed-trails': true })
    expect(isGeometryShown('line', 'proposed', proposedOn)).toBe(true)
    const outlinesOff = resolveLayers(ALL, { 'park-outlines': false })
    expect(isGeometryShown('area', 'existing', outlinesOff)).toBe(false)
    expect(isGeometryShown('line', 'existing', outlinesOff)).toBe(true)
  })
  it('search with the layer categories hides switched-off layers', () => {
    const search = createPlaceSearch(places)
    const sel = resolveLayers(ALL, { trail: false })
    const cats = sel.filter((id) => !['proposed-trails', 'park-outlines'].includes(id)) as CategoryId[]
    expect(search('place', { categories: cats }, 20).map((p) => p.id).sort()).toEqual(['a', 'c'])
  })
  it('lists switched-off layers for the active themes', () => {
    const sel = resolveLayers(ALL, { trail: false })
    expect(switchedOffLayers(ALL, sel)).toEqual(['trail', 'proposed-trails', 'fire-station'])
    expect(hiddenCategories(ALL, sel)).toEqual(['trail', 'fire-station'])
    expect(switchedOffLayers(['water'], resolveLayers(['water'], {}))).toEqual([])
  })
})

describe('empty-state naming', () => {
  it('names the switched-off layers that hold the hidden places', () => {
    const hidden = [place('b', 'trail'), place('d', 'fire-station')]
    const sel = resolveLayers(ALL, { trail: false })
    const ids = layersHidingPlaces(hidden, ALL, sel)
    expect(ids).toEqual(['trail', 'fire-station'])
    expect(emptyLayersText(ids)).toBe('Trails and Fire stations are switched off.')
  })
  it('uses the singular and lists three or more', () => {
    expect(emptyLayersText(['trail'])).toBe('Trails is switched off.')
    expect(layerNames(['park', 'trail', 'water'])).toBe('Parks, Trails and Water')
    expect(emptyLayersText([])).toBeNull()
  })
  it('names nothing when no hidden place exists', () => {
    expect(layersHidingPlaces([], ALL, resolveLayers(ALL, { trail: false }))).toEqual([])
  })
})

describe('layers in the URL', () => {
  const base: UrlState = { place: null, themes: [...ALL_THEME_IDS], view: 'map', q: '', town: null, map: null }

  it('omits the parameter when nothing deviates', () => {
    expect(serializeUrlState({ ...base, layers: {} })).toBe('')
    expect(serializeUrlState({ ...base, layers: { trail: true, 'proposed-trails': false } })).toBe('')
  })
  it('writes only the deviation, in a stable order', () => {
    expect(serializeUrlState({ ...base, layers: { 'fire-station': true, 'park-outlines': false, 'proposed-trails': true } })).toBe(
      '?layers=-park-outlines,proposed-trails,fire-station',
    )
  })
  it('round-trips', () => {
    const layers = { trail: false, 'proposed-trails': true } as const
    const parsed = parseUrlState(serializeUrlState({ ...base, layers }))
    expect(parsed.layers).toEqual({ trail: false, 'proposed-trails': true })
  })
  it('drops unknown ids and ignores a value with nothing valid', () => {
    expect(parseUrlState('?layers=-trail,bogus,-nope,proposed-trails').layers).toEqual({ trail: false, 'proposed-trails': true })
    expect(parseUrlState('?layers=bogus,-nope').layers).toBeUndefined()
    expect(parseUrlState('?layers=').layers).toBeUndefined()
    expect(parseLayers('x'.repeat(1000))).toEqual({})
  })
  it('drops layers of inactive themes when serialising and when applying', () => {
    expect(serializeUrlState({ ...base, themes: ['water'], layers: { trail: false, water: false } })).toBe('?themes=water&layers=-water')
    expect(normalizeOverrides(['water'], { trail: false })).toEqual({})
  })
  it('an old themes-only link falls back to the defaults', () => {
    const parsed = parseUrlState('?themes=parks-trails,water')
    expect(parsed.themes).toEqual(['parks-trails', 'water'])
    expect(parsed.layers).toBeUndefined()
    expect(serializeLayers(parsed.themes ?? [], parsed.layers ?? {})).toBe('')
    expect(resolveLayers(parsed.themes ?? [], parsed.layers ?? {})).toEqual(['park', 'trail', 'park-outlines', 'water'])
  })
  it('survives junk', () => {
    expect(() => parseUrlState('?layers=' + ','.repeat(10000))).not.toThrow()
    expect(() => parseUrlState('?layers=%00,-%FF')).not.toThrow()
  })
})
