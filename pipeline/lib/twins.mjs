// Evidence for "the same park listed by two sources" (decision 29). Never proximity alone: the names must match AND the
// Wake point must lie inside, or within CONTAIN_TOL_M of, the Cary park's polygon(s).
import { extent, pointInPolygon } from './geo.mjs'

/** A Wake park point within this many metres of a Cary park polygon (or inside it) counts as contained. */
export const CONTAIN_TOL_M = 50
const M_PER_DEG_LAT = 111320

/** Metres from a point to the nearest edge of the polygons, 0 when inside one (holes respected), Infinity when none. */
export function distanceToPolygonsM(point, polygons) {
  const mLon = M_PER_DEG_LAT * Math.cos((point[1] * Math.PI) / 180)
  let best = Infinity
  for (const polygon of polygons) {
    if (pointInPolygon(point, polygon)) return 0
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const ax = (ring[i - 1][0] - point[0]) * mLon
        const ay = (ring[i - 1][1] - point[1]) * M_PER_DEG_LAT
        const bx = (ring[i][0] - point[0]) * mLon
        const by = (ring[i][1] - point[1]) * M_PER_DEG_LAT
        const dx = bx - ax
        const dy = by - ay
        const len2 = dx * dx + dy * dy
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
      }
    }
  }
  return best
}

/**
 * candidates: [{ id, names: Set<normalized>, polygons?: Polygon[] }] (greenways have no polygons and never match).
 * Returns { candidate, distanceM } for the first candidate whose names include `normalizedName` and whose polygons hold
 * or come within CONTAIN_TOL_M of `pt`, else undefined.
 */
export function findContainedTwin(normalizedName, pt, candidates) {
  for (const c of candidates) {
    if (!c.polygons?.length || !c.names.has(normalizedName)) continue
    const box = extent(c.polygons.flatMap((poly) => poly[0] ?? []))
    // cheap reject: more than ~0.002 degrees (about 200 m) outside the bbox cannot be within 50 m
    if (pt[0] < box[0] - 0.002 || pt[0] > box[2] + 0.002 || pt[1] < box[1] - 0.002 || pt[1] > box[3] + 0.002) continue
    const d = distanceToPolygonsM(pt, c.polygons)
    if (d <= CONTAIN_TOL_M) return { candidate: c, distanceM: Math.round(d) }
  }
  return undefined
}
