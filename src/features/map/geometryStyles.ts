// Pure, cached styles for park areas and trail lines, plus the draw order of every map layer.
import { Fill, Stroke, Style } from 'ol/style'
import type { ThemeId } from '../../types/place'
import { getTheme } from '../themes/themes'
import type { GeometryKind, GeometryStatus } from './layers'

/** Layer z-index, bottom to top: basemap, park areas, trail lines, point clusters, selected geometry, selected pin. */
export const LAYER_Z = { basemap: 0, areas: 1, lines: 2, clusters: 3, selectedGeometry: 4, selectedPin: 5 } as const
/** Park areas show from this zoom (OpenLayers' minZoom is exclusive, so sit just under it). */
export const AREA_MIN_ZOOM = 13
export const AREA_LAYER_MIN_ZOOM = AREA_MIN_ZOOM - 0.001

export const EXISTING_LINE_WIDTH = 3
export const PROPOSED_LINE_WIDTH = 2
export const PROPOSED_LINE_DASH = [6, 6]
export const PROPOSED_OPACITY = 0.6
export const AREA_FILL_OPACITY = 0.25
export const SELECTED_AREA_FILL_OPACITY = 0.4
export const CASING_WIDTH = 7
export const SELECTED_LINE_WIDTH = 4
export const SELECTED_AREA_STROKE_WIDTH = 2
const CASING_COLOR = '#ffffff'

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

const cache = new Map<string, Style | Style[]>()
function cached<T extends Style | Style[]>(key: string, make: () => T): T {
  const hit = cache.get(key)
  if (hit) return hit as T
  const made = make()
  cache.set(key, made)
  return made
}

export function getAreaStyle(theme: ThemeId): Style {
  return cached(`area|${theme}`, () => {
    const color = getTheme(theme).color
    return new Style({
      fill: new Fill({ color: withAlpha(color, AREA_FILL_OPACITY) }),
      stroke: new Stroke({ color, width: 1 }),
    })
  })
}

export function getLineStyle(theme: ThemeId, status: GeometryStatus): Style {
  return cached(`line|${theme}|${status}`, () => {
    const color = getTheme(theme).color
    return status === 'proposed'
      ? new Style({
          stroke: new Stroke({
            color: withAlpha(color, PROPOSED_OPACITY),
            width: PROPOSED_LINE_WIDTH,
            lineDash: PROPOSED_LINE_DASH,
          }),
          zIndex: 1,
        })
      : new Style({ stroke: new Stroke({ color, width: EXISTING_LINE_WIDTH }), zIndex: 2 })
  })
}

export function getSelectedLineStyle(theme: ThemeId, status: GeometryStatus): Style[] {
  return cached(`selline|${theme}|${status}`, () => {
    const color = getTheme(theme).color
    const dash = status === 'proposed' ? PROPOSED_LINE_DASH : undefined
    return [
      new Style({ stroke: new Stroke({ color: CASING_COLOR, width: CASING_WIDTH, lineCap: 'round', lineJoin: 'round' }), zIndex: 1 }),
      new Style({ stroke: new Stroke({ color, width: SELECTED_LINE_WIDTH, lineDash: dash, lineCap: dash ? 'butt' : 'round', lineJoin: 'round' }), zIndex: 2 }),
    ]
  })
}

export function getSelectedAreaStyle(theme: ThemeId): Style {
  return cached(`selarea|${theme}`, () => {
    const color = getTheme(theme).color
    return new Style({
      fill: new Fill({ color: withAlpha(color, SELECTED_AREA_FILL_OPACITY) }),
      stroke: new Stroke({ color, width: SELECTED_AREA_STROKE_WIDTH }),
    })
  })
}

/** The style for one feature, by its kind, status and theme; `selected` picks the emphasised version. */
export function geometryStyleFor(kind: GeometryKind, status: GeometryStatus, theme: ThemeId, selected: boolean): Style | Style[] {
  if (kind === 'area') return selected ? getSelectedAreaStyle(theme) : getAreaStyle(theme)
  return selected ? getSelectedLineStyle(theme, status) : getLineStyle(theme, status)
}
