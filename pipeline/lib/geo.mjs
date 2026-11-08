// Pure geometry helpers for the scope rules in docs/scope.md. No dependencies, coordinates are [lon, lat].
// A "scope" is { core, nearby, crossing }, each a prepared polygon set (see prepare / createScope).

/** Polygon -> [polygon]; MultiPolygon -> polygons; anything else -> []. */
export function polygonsOf(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

export function linesOf(geometry) {
  if (!geometry) return []
  if (geometry.type === 'LineString') return [geometry.coordinates]
  if (geometry.type === 'MultiLineString') return geometry.coordinates
  return []
}

function ringContains(ring, [x, y]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** point in Polygon coordinates (first ring outer, others holes). */
export function pointInPolygon(point, polygon) {
  if (!polygon.length || !ringContains(polygon[0], point)) return false
  for (let i = 1; i < polygon.length; i++) if (ringContains(polygon[i], point)) return false
  return true
}

export function pointInGeometry(point, geometry) {
  return polygonsOf(geometry).some((poly) => pointInPolygon(point, poly))
}

/** Rounds to `decimals` places (6 is about 0.1 m, the precision every layer ships at). */
export function roundTo(n, decimals = 6) {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/** Rounds every number in a nested coordinate array (Position, line, ring, polygon, ...). */
export function roundCoords(c, decimals = 6) {
  return typeof c[0] === 'number' ? c.map((v) => roundTo(v, decimals)) : c.map((x) => roundCoords(x, decimals))
}

/** [minX, minY, maxX, maxY] of a list of positions (not rounded). */
export function extent(positions) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of positions) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

const inBox = ([x, y], b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]

/**
 * Prepare a polygon source (Polygon/MultiPolygon geometry, Feature, or FeatureCollection) for repeated
 * point tests: each polygon gets a bbox so most tests are rejected cheaply.
 */
export function prepare(source) {
  const geoms =
    source?.type === 'FeatureCollection'
      ? source.features.map((f) => f.geometry)
      : source?.type === 'Feature'
        ? [source.geometry]
        : [source]
  const polys = geoms.flatMap(polygonsOf).map((polygon) => ({ polygon, bbox: extent(polygon[0] ?? []) }))
  return { polys, bbox: extent(polys.flatMap((p) => [[p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[3]]])) }
}

export function inPrepared(point, prepared) {
  if (!prepared.polys.length || !inBox(point, prepared.bbox)) return false
  for (const p of prepared.polys) if (inBox(point, p.bbox) && pointInPolygon(point, p.polygon)) return true
  return false
}

/** Build a scope from the three polygon sources (raw GeoJSON). */
export function createScope({ core, nearby, crossing }) {
  return { core: prepare(core), nearby: prepare(nearby), crossing: prepare(crossing) }
}

/** 'core' | 'nearby' | 'outside' for one [lon, lat] point. The buffer polygon contains the core. */
export function classify(point, scope) {
  if (inPrepared(point, scope.core)) return 'core'
  if (inPrepared(point, scope.nearby)) return 'nearby'
  return 'outside'
}

/** Coverage of a trail: 'core' if any vertex is in the core, else 'nearby' if any is in the buffer, else 'outside'. */
export function classifyLine(lines, scope) {
  let nearby = false
  for (const line of lines) {
    for (const p of line) {
      const c = classify(p, scope)
      if (c === 'core') return 'core'
      if (c === 'nearby') nearby = true
    }
  }
  return nearby ? 'nearby' : 'outside'
}

/**
 * Split each line into runs of consecutive vertices that are inside / outside `prepared`. Where a segment
 * crosses the boundary, bisection finds the crossing point, which ends one run and starts the next, so the
 * pieces join without gaps. Returns [{ inside, coordinates }] in input order.
 */
export function splitLines(lines, prepared) {
  const runs = []
  for (const line of lines) {
    if (line.length < 2) continue
    let cur = null
    let prevIn = null
    let prev = null
    for (const p of line) {
      const isIn = inPrepared(p, prepared)
      if (cur === null) {
        cur = { inside: isIn, coordinates: [p] }
      } else if (isIn === prevIn) {
        cur.coordinates.push(p)
      } else {
        const x = crossing(prev, p, prevIn, prepared)
        cur.coordinates.push(x)
        runs.push(cur)
        cur = { inside: isIn, coordinates: [x, p] }
      }
      prev = p
      prevIn = isIn
    }
    if (cur) runs.push(cur)
  }
  return runs.filter((r) => r.coordinates.length >= 2)
}

/** Boundary point between `a` (state `aIn`) and `b` (opposite state), found by bisection (~1 m after 14 steps). */
function crossing(a, b, aIn, prepared) {
  let lo = a
  let hi = b
  for (let i = 0; i < 14; i++) {
    const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]
    if (inPrepared(mid, prepared) === aIn) lo = mid
    else hi = mid
  }
  return [roundTo(lo[0]), roundTo(lo[1])]
}

/**
 * Apply the crossing rule: keep every piece of the trail inside the crossing-limit polygon, cut the rest.
 * `core` (prepared) is used only to report whether any kept part lies outside the core.
 * Returns { lines, partsOutsideCore }.
 */
export function clipToLimit(lines, crossingLimit, core) {
  const kept = splitLines(lines, crossingLimit)
    .filter((r) => r.inside)
    .map((r) => r.coordinates)
  const partsOutsideCore = core ? kept.some((l) => l.some((p) => !inPrepared(p, core))) : false
  return { lines: kept, partsOutsideCore }
}

/** Split lines into the part inside the core and the part outside it: { inside: lines[], outside: lines[] }. */
export function splitByCore(lines, core) {
  const runs = splitLines(lines, core)
  return {
    inside: runs.filter((r) => r.inside).map((r) => r.coordinates),
    outside: runs.filter((r) => !r.inside).map((r) => r.coordinates),
  }
}

/** Great-circle distance in metres between two [lon, lat] points. */
export function haversineM(a, b) {
  const R = 6371008.8
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLon = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Douglas-Peucker simplification of one line, tolerance in metres (local equirectangular projection, good to a few
 * cm over a county). Always keeps both end points, so joined segments still meet. Iterative (no recursion limit).
 */
export function simplifyLine(line, toleranceM) {
  if (line.length <= 2 || !(toleranceM > 0)) return line
  const lat0 = (line[0][1] * Math.PI) / 180
  const kx = 111320 * Math.cos(lat0)
  const ky = 110574
  const pts = line.map((p) => [p[0] * kx, p[1] * ky])
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack = [[0, line.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let worst = -1
    let worstD = toleranceM
    const [ax, ay] = pts[a]
    const dx = pts[b][0] - ax
    const dy = pts[b][1] - ay
    const len2 = dx * dx + dy * dy
    for (let i = a + 1; i < b; i++) {
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2))
      const d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy))
      if (d > worstD) {
        worstD = d
        worst = i
      }
    }
    if (worst !== -1) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return line.filter((_, i) => keep[i])
}
