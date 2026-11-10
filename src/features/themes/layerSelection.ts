// Layer selection: which categories and map geometry layers are on. Pure: no React, no store.
// A "layer" is one category (park, trail, ...) or one of two geometry layers. Each theme has a documented default set;
// the user's changes are kept only as overrides on top of it, so the URL and the store hold just the deviation.
import type { CategoryId, Place, ThemeId } from '../../types/place'
import { CATEGORY_THEME } from './themes'

export type GeometryLayerId = 'proposed-trails' | 'park-outlines'
export type LayerId = CategoryId | GeometryLayerId
/** Explicit on (true) / off (false) choices; a layer with no entry follows its theme default. */
export type LayerOverrides = Partial<Record<LayerId, boolean>>

export const THEME_ORDER: readonly ThemeId[] = ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community']

/** Every layer in display order (grouped by theme). */
export const LAYER_IDS: readonly LayerId[] = [
  'park',
  'trail',
  'park-outlines',
  'proposed-trails',
  'history',
  'wildlife',
  'water',
  'art',
  'community',
  'fire-station',
]

export const LAYER_LABEL: Record<LayerId, string> = {
  park: 'Parks',
  trail: 'Trails',
  'park-outlines': 'Park outlines',
  'proposed-trails': 'Proposed trails',
  history: 'History',
  wildlife: 'Wildlife',
  water: 'Water',
  art: 'Art',
  community: 'Community',
  'fire-station': 'Community services',
}

export const LAYER_THEME: Record<LayerId, ThemeId> = {
  ...CATEGORY_THEME,
  'proposed-trails': 'parks-trails',
  'park-outlines': 'parks-trails',
}

/**
 * Layers on by default per theme. Rule: every category that has (or will have) places is on, except:
 * - `proposed-trails`: dashed segments of greenways that are not built yet; they would read as walkable trails.
 * - `fire-station`: off by default to keep the first view on places to visit (89 county-wide pins would crowd out parks and art).
 *   It is the "Community services" filter under Art & community; a search for fire stations switches it on.
 * `park-outlines` is on. The catalog today holds only parks (309), trails (46) and community places (8); history, wildlife,
 * water and art have no places yet and are on so that they show as soon as data arrives.
 */
export const THEME_DEFAULTS: Record<ThemeId, readonly LayerId[]> = {
  'parks-trails': ['park', 'trail', 'park-outlines'],
  history: ['history'],
  'birds-wildlife': ['wildlife'],
  water: ['water'],
  'art-community': ['art', 'community'],
}

const isLayerId = (value: string): value is LayerId => (LAYER_IDS as readonly string[]).includes(value)

export const isGeometryLayer = (id: LayerId): id is GeometryLayerId => id === 'proposed-trails' || id === 'park-outlines'

export function layersOfTheme(theme: ThemeId): LayerId[] {
  return LAYER_IDS.filter((id) => LAYER_THEME[id] === theme)
}

export function isDefaultOn(id: LayerId): boolean {
  return THEME_DEFAULTS[LAYER_THEME[id]].includes(id)
}

/** The default layers of the given themes, in display order. */
export function defaultLayers(themes: readonly ThemeId[]): LayerId[] {
  return LAYER_IDS.filter((id) => themes.includes(LAYER_THEME[id]) && isDefaultOn(id))
}

/** The layers that are on: defaults plus overrides, for active themes only. */
export function resolveLayers(themes: readonly ThemeId[], overrides: LayerOverrides): LayerId[] {
  return LAYER_IDS.filter((id) => themes.includes(LAYER_THEME[id]) && (overrides[id] ?? isDefaultOn(id)))
}

/** Drops overrides for inactive themes and those that equal the default. Always returns a new, clean object. */
export function normalizeOverrides(themes: readonly ThemeId[], overrides: LayerOverrides): LayerOverrides {
  const out: LayerOverrides = {}
  for (const id of LAYER_IDS) {
    const value = overrides[id]
    if (typeof value === 'boolean' && themes.includes(LAYER_THEME[id]) && value !== isDefaultOn(id)) out[id] = value
  }
  return out
}

/** Picking a theme chip on (or off) resets that theme's layers to the defaults. */
export function resetThemeLayers(overrides: LayerOverrides, theme: ThemeId): LayerOverrides {
  const out: LayerOverrides = { ...overrides }
  for (const id of layersOfTheme(theme)) delete out[id]
  return out
}

/** After the active themes change, keeps overrides only for themes whose state did not change. */
export function reconcileOverrides(
  prevThemes: readonly ThemeId[],
  nextThemes: readonly ThemeId[],
  overrides: LayerOverrides,
): LayerOverrides {
  let out = overrides
  for (const theme of THEME_ORDER) {
    if (prevThemes.includes(theme) !== nextThemes.includes(theme)) out = resetThemeLayers(out, theme)
  }
  return normalizeOverrides(nextThemes, out)
}

/** Overrides that turn on every layer of the active themes ("Show all layers"). */
export function showAllOverrides(themes: readonly ThemeId[]): LayerOverrides {
  const out: LayerOverrides = {}
  for (const id of LAYER_IDS) if (themes.includes(LAYER_THEME[id]) && !isDefaultOn(id)) out[id] = true
  return out
}

/** Active-theme layers that are switched off. */
export function switchedOffLayers(themes: readonly ThemeId[], selection: readonly LayerId[]): LayerId[] {
  return LAYER_IDS.filter((id) => themes.includes(LAYER_THEME[id]) && !selection.includes(id))
}

/** The category layers in a selection (what pins, list rows and search results are filtered by). */
export function selectedCategories(selection: readonly LayerId[]): CategoryId[] {
  return selection.filter((id): id is CategoryId => !isGeometryLayer(id))
}

/** Active-theme categories that are switched off. */
export function hiddenCategories(themes: readonly ThemeId[], selection: readonly LayerId[]): CategoryId[] {
  return switchedOffLayers(themes, selection).filter((id): id is CategoryId => !isGeometryLayer(id))
}

/** Places whose category layer is on. */
export function filterByLayers<T extends Pick<Place, 'category'>>(places: readonly T[], selection: readonly LayerId[]): T[] {
  return places.filter((p) => selection.includes(p.category))
}

/** Whether a trail line or park area is drawn. Existing trails follow their category only. */
export function isGeometryShown(
  kind: 'line' | 'area',
  status: 'existing' | 'proposed',
  selection: readonly LayerId[],
  theme?: ThemeId,
): boolean {
  // Watershed areas follow the Water theme's own category switch (already applied to the places), not park outlines.
  if (kind === 'area') return theme === 'water' || selection.includes('park-outlines')
  return status === 'proposed' ? selection.includes('proposed-trails') : true
}

/** Switched-off category layers that hold at least one of these places (the layers to name when nothing is left to show). */
export function layersHidingPlaces(
  places: readonly Pick<Place, 'category'>[],
  themes: readonly ThemeId[],
  selection: readonly LayerId[],
): LayerId[] {
  const off = hiddenCategories(themes, selection)
  return LAYER_IDS.filter((id) => (off as readonly string[]).includes(id) && places.some((p) => p.category === id))
}

export function layerNames(ids: readonly LayerId[]): string {
  const names = ids.map((id) => LAYER_LABEL[id])
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The sentence for an empty result caused by layer switches; null when no layer is to blame. */
export function emptyLayersText(ids: readonly LayerId[]): string | null {
  if (ids.length === 0) return null
  return `${layerNames(ids)} ${ids.length === 1 ? 'is' : 'are'} switched off.`
}

/** `layers=` value: only the deviation from the defaults. `-id` = off, bare `id` = on. Empty string when nothing deviates. */
export function serializeLayers(themes: readonly ThemeId[], overrides: LayerOverrides): string {
  const clean = normalizeOverrides(themes, overrides)
  return LAYER_IDS.filter((id) => id in clean)
    .map((id) => (clean[id] ? id : `-${id}`))
    .join(',')
}

/** Reads a `layers=` value. Unknown ids are dropped; if an id appears twice the last wins. Never throws. */
export function parseLayers(raw: string): LayerOverrides {
  const out: LayerOverrides = {}
  if (raw.length > 300) return out
  for (const part of raw.split(',')) {
    const off = part.startsWith('-')
    const id = off ? part.slice(1) : part
    if (isLayerId(id)) out[id] = !off
  }
  return out
}
