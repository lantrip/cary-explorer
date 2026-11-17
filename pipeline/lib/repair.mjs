// Pure geometry repair for the layers we publish. [lon, lat] positions, no dependencies.
// Fixes only what is mechanical and lossless-in-meaning: unclosed rings, consecutive duplicate vertices, degenerate
// rings and lines. Self-intersections are DETECTED and reported, never changed. Winding is reported; it is only
// rewritten when `fixWinding` is set (nothing in the app depends on it: OpenLayers and our point-in-polygon ignore it).

const same = (a, b) => a[0] === b[0] && a[1] === b[1]

/** Drops consecutive repeated positions; returns { out, removed }. */
function dedupe(points) {
  const out = []
  let removed = 0
  for (const p of points) {
    if (out.length && same(out.at(-1), p)) removed++
    else out.push(p)
  }
  return { out, removed }
}

/** Signed area (positive = counter-clockwise) of a closed ring. */
export function signedArea(ring) {
  let s = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return s / 2
}

/** True when every position lies on one line (a zero-width ring). A self-crossing ring with zero net area is not. */
function allCollinear(ring) {
  const a = ring[0]
  const b = ring.find((p) => !same(p, a))
  return !b || ring.every((p) => orient(a, b, p) === 0)
}

const orient = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))

/** True if segments ab and cd properly cross, or overlap along a line (touching at an end point does not count). */
function segmentsCross(a, b, c, d) {
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (o1 * o2 < 0 && o3 * o4 < 0) return true
  if (o1 === 0 && o2 === 0) {
    // collinear: overlap of positive length
    const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1
    const lo1 = Math.min(a[axis], b[axis])
    const hi1 = Math.max(a[axis], b[axis])
    const lo2 = Math.min(c[axis], d[axis])
    const hi2 = Math.max(c[axis], d[axis])
    return Math.min(hi1, hi2) - Math.max(lo1, lo2) > 0
  }
  return false
}

/** Number of self-intersections of one closed ring (non-adjacent edge pairs that cross or overlap). Sweep over x. */
export function ringSelfIntersections(ring) {
  const n = ring.length - 1
  if (n < 4) return 0
  const segs = []
  for (let i = 0; i < n; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    segs.push({ i, a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) })
  }
  segs.sort((p, q) => p.x0 - q.x0 || p.i - q.i)
  let count = 0
  for (let s = 0; s < segs.length; s++) {
    const p = segs[s]
    for (let t = s + 1; t < segs.length && segs[t].x0 <= p.x1; t++) {
      const q = segs[t]
      if (q.y0 > p.y1 || q.y1 < p.y0) continue
      const gap = Math.abs(p.i - q.i)
      if (gap === 1 || gap === n - 1) continue // neighbours share a vertex
      if (segmentsCross(p.a, p.b, q.a, q.b)) count++
    }
  }
  return count
}

const newStats = () => ({ closedRings: 0, duplicateVertices: 0, droppedRings: 0, droppedLines: 0, droppedGeometries: 0, windingReversed: 0 })

/** Repairs one ring. Returns the ring, or null when it is degenerate. */
function repairRing(ring, stats) {
  const { out, removed } = dedupe(ring)
  stats.duplicateVertices += removed
  const wasClosed = out.length >= 2 && same(out[0], out.at(-1))
  if (wasClosed) out.pop()
  // A ring needs 3 distinct vertices plus the closing one, and a non-zero area.
  if (out.length < 3) return null
  const closed = [...out, out[0]]
  if (allCollinear(closed)) return null
  if (!wasClosed) stats.closedRings++
  return closed
}

function repairLine(line, stats) {
  const { out, removed } = dedupe(line)
  stats.duplicateVertices += removed
  return out.length >= 2 ? out : null
}

/**
 * Repairs a Polygon / MultiPolygon / LineString / MultiLineString.
 * Returns { geometry, stats, selfIntersections, wrongWinding }: `geometry` is null when nothing valid is left (stats.droppedGeometries = 1),
 * and is the SAME object when nothing changed. `selfIntersections` counts crossing ring edges (reported, not fixed);
 * `wrongWinding` counts rings that are not RFC 7946 (outer counter-clockwise, holes clockwise). Other types pass through.
 */
export function repairGeometry(geometry, { fixWinding = false } = {}) {
  const stats = newStats()
  let selfIntersections = 0
  let wrongWinding = 0
  const done = (g) => {
    const changed = Object.entries(stats).some(([k, v]) => k !== 'windingReversed' && v > 0) || stats.windingReversed > 0
    return { geometry: g === null ? null : changed ? g : geometry, stats, selfIntersections, wrongWinding }
  }
  const polygon = (rings) => {
    const fixed = []
    for (let r = 0; r < rings.length; r++) {
      let ring = repairRing(rings[r], stats)
      if (!ring) {
        if (r === 0) {
          // outer ring is gone: the whole polygon (and its holes) go
          stats.droppedRings += rings.length
          return null
        }
        stats.droppedRings++
        continue
      }
      selfIntersections += ringSelfIntersections(ring)
      const ccw = signedArea(ring) > 0
      if (ccw !== (r === 0)) {
        wrongWinding++
        if (fixWinding) {
          ring = [...ring].reverse()
          stats.windingReversed++
        }
      }
      fixed.push(ring)
    }
    return fixed
  }
  if (!geometry) return { geometry: null, stats, selfIntersections, wrongWinding }
  switch (geometry.type) {
    case 'Polygon': {
      const p = polygon(geometry.coordinates)
      if (!p) {
        stats.droppedGeometries++
        return done(null)
      }
      return done({ ...geometry, coordinates: p })
    }
    case 'MultiPolygon': {
      const polys = geometry.coordinates.map(polygon).filter(Boolean)
      if (!polys.length) {
        stats.droppedGeometries++
        return done(null)
      }
      return done({ ...geometry, coordinates: polys })
    }
    case 'LineString': {
      const l = repairLine(geometry.coordinates, stats)
      if (!l) {
        stats.droppedLines++
        stats.droppedGeometries++
        return done(null)
      }
      return done({ ...geometry, coordinates: l })
    }
    case 'MultiLineString': {
      const lines = []
      for (const line of geometry.coordinates) {
        const l = repairLine(line, stats)
        if (l) lines.push(l)
        else stats.droppedLines++
      }
      if (!lines.length) {
        stats.droppedGeometries++
        return done(null)
      }
      return done({ ...geometry, coordinates: lines })
    }
    default:
      return done(geometry)
  }
}

/**
 * Repairs every feature of a layer (features already rounded to the published precision). Features whose geometry
 * is empty after repair are dropped. `sourceOf(feature)` names the source for the report.
 * Returns { features, report } with report = { bySource: { [source]: { features, <stat>: n, wrongWinding } },
 * selfIntersections: [{ placeId, source, count }], dropped: [{ placeId, source }] }.
 */
export function repairFeatures(features, sourceOf, { fixWinding = false, into = newReport() } = {}) {
  const out = []
  for (const f of features) {
    const source = sourceOf(f) ?? 'unknown'
    const placeId = f.properties?.placeId
    const r = repairGeometry(f.geometry, { fixWinding })
    const row = (into.bySource[source] ??= { features: 0, wrongWinding: 0, ...newStats() })
    row.features++
    for (const [k, v] of Object.entries(r.stats)) row[k] += v
    row.wrongWinding += r.wrongWinding
    if (r.selfIntersections) into.selfIntersections.push({ placeId, source, count: r.selfIntersections })
    if (!r.geometry) {
      into.dropped.push({ placeId, source })
      continue
    }
    out.push(r.geometry === f.geometry ? f : { ...f, geometry: r.geometry })
  }
  return { features: out, report: into }
}

export const newReport = () => ({ bySource: {}, selfIntersections: [], dropped: [] })

/** Short build-log lines for a report. */
export function formatRepairReport(report) {
  const lines = []
  const kinds = ['closedRings', 'duplicateVertices', 'droppedRings', 'droppedLines', 'droppedGeometries', 'windingReversed']
  for (const [source, row] of Object.entries(report.bySource).sort(([a], [b]) => a.localeCompare(b))) {
    const parts = kinds.filter((k) => row[k]).map((k) => `${k} ${row[k]}`)
    if (row.wrongWinding) parts.push(`non-RFC7946 winding ${row.wrongWinding} (reported, not changed)`)
    lines.push(`geometry repair ${source}: ${row.features} features${parts.length ? `; ${parts.join(', ')}` : '; no repairs'}`)
  }
  for (const s of report.selfIntersections) lines.push(`geometry self-intersection: ${s.placeId} (${s.source}) ${s.count} crossing(s)`)
  if (!report.selfIntersections.length) lines.push('geometry self-intersections: none')
  return lines
}
