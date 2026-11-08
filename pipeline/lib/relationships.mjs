// Relationships between catalog places. Records are never merged; this only links them.
//
// Input items: { id, kind: 'park' | 'trail', polygons?: Polygon[], lines?: Position[][], points?: Position[] }
//   park  = any place drawn as polygons (or a single point when only a centroid is known)
//   trail = a greenway drawn as lines
// Output: [{ from, to, kind, distanceM?, basis? }] sorted by from, to, kind.
//
// Rules:
//   contained: a trail with at least CONTAINED_MIN_M (100 m) of its length inside a park polygon ->
//              { from: trailId, to: parkId, kind: 'contained' }. Length inside = the sum of segment lengths with both
//              ends inside, plus the inside part of each segment with one end inside (the crossing is found by
//              bisection). A segment that enters and leaves between two outside vertices is not counted, so the
//              figure can only be low. Below the threshold the pair is not 'contained'; it falls through to 'nearby'.
//   nearby:    park-park and park-trail pairs whose geometries come within NEARBY_M (400 m). Trail-trail pairs
//              are not linked. Distance is the smallest haversine distance between any vertex of one and any
//              vertex of the other (cheap and slightly generous for parks with sparse vertices), or 0 when a
//              vertex of one lies inside a polygon of the other. A bbox prefilter (expanded by 400 m) rejects
//              most pairs, and only vertices inside the other's expanded bbox are compared. Pairs already
//              'contained' are not repeated as 'nearby'. park-park: from is the lower id; park-trail: from is
//              the park. Nearby links carry distanceM (rounded metres of closest approach, 0 when one geometry
//              touches the other) and basis 'within-400m'. Point-only places use their point.
//   fallback:  a place with no link at all gets ONE nearby link to its closest other place within
//              NEAREST_MAX_M (2,000 m), with basis 'nearest' (from = the unlinked place). Never beyond 2 km.
import { extent, haversineM, pointInPolygon } from './geo.mjs'

export const NEARBY_M = 400
/** A trail 'runs through' a park only when at least this much of it lies inside the park polygon. */
export const CONTAINED_MIN_M = 100
export const NEAREST_MAX_M = 2000
const M_PER_DEG_LAT = 111320

function prep(item) {
  const polygons = item.polygons ?? []
  const verts = item.kind === 'trail' ? (item.lines ?? []).flat() : [...polygons.flat(2), ...(item.points ?? [])]
  const vertices = verts.filter((p) => Array.isArray(p) && typeof p[0] === 'number')
  const bbox = extent(vertices)
  const polyBoxes = polygons.map((polygon) => ({ polygon, bbox: extent(polygon[0] ?? []) }))
  return { id: item.id, kind: item.kind, vertices, bbox, polyBoxes, lines: item.lines ?? [] }
}

const grow = (b, m) => {
  const dLat = m / M_PER_DEG_LAT
  const dLon = dLat / Math.max(0.2, Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180))
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat]
}
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]

function insideAny(point, target) {
  for (const pb of target.polyBoxes) if (inBox(point, pb.bbox) && pointInPolygon(point, pb.polygon)) return true
  return false
}

/** Metres of the trail's lines inside the park's polygons (see the rules above). */
export function lengthInsideM(lines, park) {
  let total = 0
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const aIn = insideAny(a, park)
      const bIn = insideAny(b, park)
      if (aIn && bIn) total += haversineM(a, b)
      else if (aIn || bIn) {
        let lo = aIn ? a : b
        let hi = aIn ? b : a
        for (let k = 0; k < 12; k++) {
          const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
          if (insideAny(mid, park)) lo = mid
          else hi = mid
        }
        total += haversineM(aIn ? a : b, lo)
      }
    }
  }
  return total
}

// Smallest distance in metres between two prepared items (0 when a vertex lies inside the other's polygon),
// or null when it is more than maxM. Only vertices inside the other's expanded bbox are compared.
function closest(a, b, boxA, boxB, maxM) {
  const va = a.vertices.filter((p) => inBox(p, boxB))
  const vb = b.vertices.filter((p) => inBox(p, boxA))
  if (va.some((p) => insideAny(p, b)) || vb.some((p) => insideAny(p, a))) return 0
  let best = Infinity
  for (const p of va) for (const q of vb) best = Math.min(best, haversineM(p, q))
  return best <= maxM ? best : null
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

export function computeRelationships(items) {
  const list = items.map(prep).filter((p) => p.vertices.length)
  const boxes = list.map((p) => grow(p.bbox, NEARBY_M))
  const out = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (a.kind === 'trail' && b.kind === 'trail') continue
      if (!overlap(boxes[i], boxes[j])) continue
      const [park, other] = a.kind === 'park' ? [a, b] : [b, a]
      if (other.kind === 'trail' && other.vertices.some((p) => insideAny(p, park)) && lengthInsideM(other.lines, park) >= CONTAINED_MIN_M) {
        out.push({ from: other.id, to: park.id, kind: 'contained' })
        continue
      }
      const d = closest(a, b, boxes[i], boxes[j], NEARBY_M)
      if (d !== null) {
        const [from, to] = other.kind === 'trail' ? [park.id, other.id] : a.id < b.id ? [a.id, b.id] : [b.id, a.id]
        out.push({ from, to, kind: 'nearby', distanceM: Math.round(d), basis: 'within-400m' })
      }
    }
  }
  // Coverage fallback: one nearest link (within 2 km) for each place that still has none.
  const linked = new Set(out.flatMap((r) => [r.from, r.to]))
  const wide = list.map((p) => grow(p.bbox, NEAREST_MAX_M))
  const order = list.map((_, i) => i).sort((x, y) => cmp(list[x].id, list[y].id))
  for (const i of order) {
    const a = list[i]
    if (linked.has(a.id)) continue
    let best = null
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue
      const b = list[j]
      if (!overlap(wide[i], wide[j])) continue
      const d = closest(a, b, wide[i], wide[j], NEAREST_MAX_M)
      if (d === null) continue
      if (!best || d < best.d || (d === best.d && b.id < best.id)) best = { d, id: b.id }
    }
    if (best) {
      out.push({ from: a.id, to: best.id, kind: 'nearby', distanceM: Math.round(best.d), basis: 'nearest' })
      linked.add(a.id)
      linked.add(best.id)
    }
  }
  out.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.kind, y.kind))
  return { relationships: out }
}
