// How the map frames the selected place: geometry extent, else bbox, else its centre point; and when it should re-frame.
import type { Extent } from 'ol/extent'
import { createEmpty, extend as extendExtent, isEmpty } from 'ol/extent'
import type Feature from 'ol/Feature'
import type { ThemeId } from '../../types/place'
import { transformExtent } from 'ol/proj'
import type { Place } from '../../types/place'

export const FRAME_MAX_ZOOM = 17

export type FramePlan =
  | { kind: 'geometry'; extent: Extent }
  | { kind: 'bbox'; extent: Extent }
  | { kind: 'centroid' }

/** Union extent of a place's features (EPSG:3857), or null when it has no geometry. */
export function geometryExtent(features: readonly Feature[] | undefined): Extent | null {
  if (!features?.length) return null
  const extent = createEmpty()
  for (const f of features) {
    const g = f.getGeometry()
    if (g) extendExtent(extent, g.getExtent())
  }
  return isEmpty(extent) ? null : extent
}

/** Geometry extent wins over the bbox, which wins over centring on the point. */
export function planFrame(place: Pick<Place, 'bbox'>, features: readonly Feature[] | undefined): FramePlan {
  const geometry = geometryExtent(features)
  if (geometry) return { kind: 'geometry', extent: geometry }
  if (place.bbox) return { kind: 'bbox', extent: transformExtent(place.bbox, 'EPSG:4326', 'EPSG:3857') }
  return { kind: 'centroid' }
}

/** What the camera last did for the selected place. 'shared' = a shared link's camera was kept as is. */
export interface FramedState {
  placeId: string
  kind: FramePlan['kind'] | 'shared'
  /** The user panned or zoomed since. */
  moved: boolean
}

export type FrameTrigger = 'selection' | 'layout' | 'geometry'

/**
 * Whether to move the camera.
 * - selection: always, except a selection that came from a shared link (its `map=` camera wins).
 * - layout (sheet or panel changed): always, so the place stays clear of the panel or sheet.
 * - geometry (layers finished loading): once, only after a bbox/centroid frame, only if the user has not moved the map.
 */
export function shouldFrame(
  trigger: FrameTrigger,
  ctx: { origin: 'user' | 'url'; framed: FramedState | null; hasGeometry: boolean },
): boolean {
  switch (trigger) {
    case 'selection':
      return ctx.origin !== 'url'
    case 'layout':
      return true
    case 'geometry':
      return (
        ctx.hasGeometry &&
        ctx.framed !== null &&
        (ctx.framed.kind === 'bbox' || ctx.framed.kind === 'centroid') &&
        !ctx.framed.moved
      )
  }
}

/** Independent copies (same properties) of a place's features for the selected-geometry layer, tagged with the theme. */
export function selectedGeometryFeatures(features: readonly Feature[] | undefined, theme: ThemeId): Feature[] {
  return (features ?? []).map((f) => {
    const copy = f.clone()
    copy.set('theme', theme, true)
    return copy
  })
}
