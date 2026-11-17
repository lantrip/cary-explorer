// Which watershed a point is in: plain point-in-polygon on the published USGS HUC-12 layer (decision 28). Pure, no network.
// Coordinates may be in any one planar space (lon/lat or the map's EPSG:3857) as long as the point and the features agree.
export type Position = readonly number[]
export type Ring = readonly Position[]

export interface WatershedGeometry {
  type: string
  coordinates: unknown
}
export interface WatershedFeature {
  /** The watershed place this polygon draws, from the layer's `placeId` property. */
  placeId: string
  geometry: WatershedGeometry | null | undefined
}

function ringContains(ring: Ring, x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Polygon rings: the first is the outer ring, the rest are holes (a point in a hole is outside). */
function inPolygon(rings: readonly Ring[], x: number, y: number): boolean {
  if (rings.length === 0 || !ringContains(rings[0], x, y)) return false
  for (let i = 1; i < rings.length; i++) if (ringContains(rings[i], x, y)) return false
  return true
}

function polygonsOf(geometry: WatershedGeometry | null | undefined): (readonly Ring[])[] {
  if (!geometry || !Array.isArray(geometry.coordinates)) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as (readonly Ring[])[]
  return []
}

/** The placeId of the first watershed polygon holding the point, or null. Lines and other geometry types are ignored. */
export function watershedAt(point: readonly [number, number], features: readonly WatershedFeature[]): string | null {
  const [x, y] = point
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  for (const f of features) {
    for (const poly of polygonsOf(f.geometry)) if (inPolygon(poly, x, y)) return f.placeId
  }
  return null
}

/** "Crabtree Creek watershed" gives "In the Crabtree Creek watershed" (same wording as the place card). */
export function watershedLineText(placeName: string): string {
  return `In the ${placeName.replace(/\s+watershed$/i, '')} watershed`
}

export const NOT_IN_WATERSHED_TEXT = 'Not in a mapped watershed'
