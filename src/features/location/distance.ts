// Straight-line (great-circle) distance helpers. Pure functions; no location is stored or sent anywhere.
const EARTH_RADIUS_M = 6371008.8 // WGS84 mean radius
const METRES_PER_MILE = 1609.344

type LonLat = readonly [number, number]

/** Haversine distance in metres between two [lon, lat] points. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "1.2 mi": one decimal, never below 0.1 mi. */
export function formatMilesShort(m: number): string {
  const miles = Math.max(0.1, Math.round((m / METRES_PER_MILE) * 10) / 10)
  return `${miles.toFixed(1)} mi`
}

/** "1.2 mi straight-line". */
export function formatStraightLine(m: number): string {
  return `${formatMilesShort(m)} straight-line`
}

export interface WithDistance<T> {
  item: T
  meters: number | null
}

const isLonLat = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])

/** Items paired with their distance from `origin`, nearest first. Stable; items without coordinates go last. */
export function sortByDistance<T extends { centroid?: readonly [number, number] }>(
  items: readonly T[],
  origin: LonLat,
): WithDistance<T>[] {
  return items
    .map((item, index) => ({
      item,
      index,
      meters: isLonLat(item.centroid) ? distanceMeters(origin, item.centroid) : null,
    }))
    .sort((x, y) => {
      if (x.meters === null || y.meters === null) {
        if (x.meters === y.meters) return x.index - y.index
        return x.meters === null ? 1 : -1
      }
      return x.meters - y.meters || x.index - y.index
    })
    .map(({ item, meters }) => ({ item, meters }))
}
