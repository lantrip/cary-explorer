// Named streams from USGS 3DHP flowlines as catalog places, and their links to parks and trails.
// Pure and dependency-free. Only names, geometry and lengths are used; the flowline flow, network and level-path
// fields are never read, so nothing here can claim flow direction or a downstream connection (issue #28), and
// nothing says anything about water quality (issue #23).
import { extent, haversineM, linesOf, simplifyLine, splitLines } from './geo.mjs'
import { lengthInsideM } from './relationships.mjs'

/** Segments of one GNIS name whose end points are within this distance belong to the same creek. */
export const CREEK_LINK_M = 200
/** A creek is kept when at least this much of it lies in the study area (about one mile). */
export const CREEK_MIN_M = 1609
/** Lines in the layer and in the link tests are simplified to this tolerance. */
export const CREEK_SIMPLIFY_M = 12
/** A trail "follows" a creek when at least this much of it lies within ALONG_BUFFER_M of the creek line. */
export const ALONG_MIN_M = 300
export const ALONG_BUFFER_M = 50
/** A creek "runs through" a park when at least this much of it lies inside the park (the trail rule, decision 29). */
export const CREEK_IN_PARK_MIN_M = 100
const METRES_PER_MILE = 1609.344
const STEP_M = 10

const lengthOf = (lines) => {
  let m = 0
  for (const line of lines) for (let i = 1; i < line.length; i++) m += haversineM(line[i - 1], line[i])
  return m
}

/**
 * Groups named flowline features into creeks.
 * `features`: GeoJSON features with properties { gnisid, gnisidlabel, id3dhp } and (Multi)LineString geometry.
 * Only the part of each line inside `scope.nearby` is kept. Segments with the same GNIS id and name are one creek
 * when chained end to end with gaps of at most CREEK_LINK_M; otherwise they are separate creeks of the same name.
 * Returns [{ name, gnisid, ids, lines, lengthM }] largest first (ties by name, then first id), with `lines` clipped
 * but not simplified and `ids` the sorted id3dhp values of the segments.
 */
export function groupCreeks(features, scope, linkM = CREEK_LINK_M) {
  const groups = new Map()
  for (const f of features) {
    const p = f.properties ?? {}
    const name = String(p.gnisidlabel ?? '').trim().replace(/\s+/g, ' ')
    if (!name) continue
    const key = `${p.gnisid ?? ''}|${name}`
    const lines = splitLines(linesOf(f.geometry), scope.nearby).filter((r) => r.inside).map((r) => r.coordinates)
    if (!lines.length) continue
    for (const coordinates of lines) {
      const g = groups.get(key) ?? { name, gnisid: p.gnisid ?? null, segs: [] }
      g.segs.push({ coordinates, id: String(p.id3dhp ?? '') })
      groups.set(key, g)
    }
  }
  const creeks = []
  for (const g of groups.values()) {
    const parent = g.segs.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]]
      return i
    }
    const ends = g.segs.map((s) => [s.coordinates[0], s.coordinates[s.coordinates.length - 1]])
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        if (find(i) === find(j)) continue
        if (ends[i].some((a) => ends[j].some((b) => haversineM(a, b) <= linkM))) parent[find(i)] = find(j)
      }
    }
    const clusters = new Map()
    g.segs.forEach((s, i) => {
      const r = find(i)
      clusters.set(r, [...(clusters.get(r) ?? []), s])
    })
    for (const segs of clusters.values()) {
      const lines = segs.map((s) => s.coordinates)
      creeks.push({ name: g.name, gnisid: g.gnisid, ids: segs.map((s) => s.id).sort(), lines, lengthM: lengthOf(lines) })
    }
  }
  return creeks.sort(
    (a, b) => b.lengthM - a.lengthM || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || (a.ids[0] < b.ids[0] ? -1 : 1),
  )
}

/** Lines simplified for the layer and for the link tests; pieces that collapse below two positions are dropped. */
export function simplifyCreekLines(lines, toleranceM = CREEK_SIMPLIFY_M) {
  return lines.map((l) => simplifyLine(l, toleranceM)).filter((l) => l.length >= 2)
}

/** The point halfway along the line (by length). */
export function midpoint(line) {
  const half = lengthOf([line]) / 2
  let run = 0
  for (let i = 1; i < line.length; i++) {
    const d = haversineM(line[i - 1], line[i])
    if (run + d >= half && d > 0) {
      const t = (half - run) / d
      return [line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]
    }
    run += d
  }
  return line[Math.floor(line.length / 2)]
}

/** The pin: the middle of the longest piece that `allowed` accepts (a county lookup); null when none is. */
export function creekPin(lines, allowed) {
  const byLength = [...lines].sort((a, b) => lengthOf([b]) - lengthOf([a]))
  for (const line of byLength) {
    const m = midpoint(line)
    if (allowed(m)) return m
  }
  return null
}

/** "Stream, about 4.2 miles in this area (USGS hydrography)." Length only; no flow, downstream or quality claim. */
export function creekDescription(name, lengthM) {
  const miles = (Math.round((lengthM / METRES_PER_MILE) * 10) / 10).toFixed(1).replace(/\.0$/, '')
  const kind = /\bRiver$/i.test(name) ? 'River' : 'Stream'
  return `${kind}, about ${miles} ${miles === '1' ? 'mile' : 'miles'} in this area (USGS hydrography).`
}

/**
 * Card copy for a creek, from the data only: length, the watershed(s) and basin(s) it is in (membership), and the greenways
 * that follow it. `ctx`: { watersheds: [{ name, basin? }] (main one first), greenways: [name] }. No flow, quality or habitat claim.
 */
export function creekCardDescription(name, lengthM, ctx = {}) {
  const parts = [creekDescription(name, lengthM)]
  const ws = ctx.watersheds ?? []
  if (ws.length) {
    const short = (w) => w.name.replace(/ watershed$/i, '')
    const shown = ws.slice(0, 2).map(short)
    const more = ws.length - shown.length
    const list = shown.join(' and ') + (more > 0 ? ` and ${more} more` : '')
    const basins = [...new Set(ws.map((w) => w.basin).filter(Boolean))]
    const basinText = basins.length === 0 ? '' : basins.length === 1 ? `, part of the ${basins[0]} River Basin` : `, part of the ${basins.slice(0, -1).join(', ')} and ${basins[basins.length - 1]} River Basins`
    parts.push(`In the ${list} ${ws.length === 1 ? 'watershed' : 'watersheds'}${basinText}.`)
  }
  const gw = [...new Set(ctx.greenways ?? [])]
  if (gw.length) {
    const shown = gw.slice(0, 3)
    const more = gw.length - shown.length
    const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0]
    parts.push(`Greenways that follow it: ${list}${more > 0 ? ` and ${more} more` : ''}.`)
  }
  return parts.join(' ')
}

// ---- links ----

/** Local metre grid around a latitude. */
function projector(lat) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110574
  return (p) => [p[0] * kx, p[1] * ky]
}

/** Segments of a creek in metres, with a 100 m cell index for near-point lookups. */
function segmentIndex(lines, project) {
  const cell = 100
  const cells = new Map()
  const segs = []
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = project(line[i - 1])
      const [bx, by] = project(line[i])
      const k = segs.push([ax, ay, bx, by]) - 1
      for (let cx = Math.floor((Math.min(ax, bx) - ALONG_BUFFER_M) / cell); cx <= Math.floor((Math.max(ax, bx) + ALONG_BUFFER_M) / cell); cx++) {
        for (let cy = Math.floor((Math.min(ay, by) - ALONG_BUFFER_M) / cell); cy <= Math.floor((Math.max(ay, by) + ALONG_BUFFER_M) / cell); cy++) {
          const key = `${cx},${cy}`
          const list = cells.get(key)
          if (list) list.push(k)
          else cells.set(key, [k])
        }
      }
    }
  }
  return { cell, cells, segs }
}

function nearWithin(x, y, index, maxM) {
  const list = index.cells.get(`${Math.floor(x / index.cell)},${Math.floor(y / index.cell)}`)
  if (!list) return false
  for (const k of list) {
    const [ax, ay, bx, by] = index.segs[k]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2))
    if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= maxM) return true
  }
  return false
}

/**
 * Metres of the trail's lines that lie within `bufferM` of the creek lines. Each trail segment is cut into steps of
 * about 10 m and a step counts when its midpoint is within the buffer, so the figure is good to a step or two.
 */
export function alongLengthM(trailLines, creekLines, bufferM = ALONG_BUFFER_M) {
  const first = creekLines.find((l) => l.length)?.[0]
  if (!first) return 0
  const project = projector(first[1])
  const index = segmentIndex(creekLines, project)
  let total = 0
  for (const line of trailLines) {
    for (let i = 1; i < line.length; i++) {
      const d = haversineM(line[i - 1], line[i])
      const n = Math.max(1, Math.round(d / STEP_M))
      for (let s = 0; s < n; s++) {
        const t = (s + 0.5) / n
        const [x, y] = project([line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])])
        if (nearWithin(x, y, index, bufferM)) total += d / n
      }
    }
  }
  return total
}

const grow = (b, m) => {
  const dLat = m / 111320
  const dLon = dLat / Math.max(0.2, Math.cos((((b[1] + b[3]) / 2) * Math.PI) / 180))
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat]
}
const overlap = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

/**
 * Links between creeks and the parks and trails of the catalog.
 * `creeks`: [{ id, lines }]; `items`: [{ id, kind: 'park' | 'trail', polygons?, lines? }].
 *   trail -> creek: { from: trailId, to: creekId, kind: 'nearby', basis: 'along', alongM } when at least ALONG_MIN_M (300 m)
 *     of the trail lies within ALONG_BUFFER_M (50 m) of the creek line (alongM is rounded to 10 m).
 *   creek -> park:  { from: creekId, to: parkId, kind: 'contained' } when at least CREEK_IN_PARK_MIN_M (100 m) of the creek
 *     lies inside the park polygons (the same rule as a trail through a park).
 * Sorted by from, to, kind.
 */
export function creekRelationships(creeks, items) {
  const out = []
  const trails = items.filter((i) => i.kind === 'trail' && i.lines?.length).map((i) => ({ id: i.id, lines: i.lines, box: extent(i.lines.flat()) }))
  const parks = items
    .filter((i) => i.kind === 'park' && i.polygons?.length)
    .map((i) => ({
      id: i.id,
      box: extent(i.polygons.flat(2)),
      polyBoxes: i.polygons.map((polygon) => ({ polygon, bbox: extent(polygon[0] ?? []) })),
    }))
  for (const c of creeks) {
    const box = grow(extent(c.lines.flat()), ALONG_BUFFER_M)
    for (const t of trails) {
      if (!overlap(box, t.box)) continue
      const m = alongLengthM(t.lines, c.lines)
      if (m >= ALONG_MIN_M) out.push({ from: t.id, to: c.id, kind: 'nearby', basis: 'along', alongM: Math.round(m / 10) * 10 })
    }
    for (const p of parks) {
      if (!overlap(box, p.box)) continue
      if (lengthInsideM(c.lines, p) >= CREEK_IN_PARK_MIN_M) out.push({ from: c.id, to: p.id, kind: 'contained' })
    }
  }
  return out.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.kind, y.kind))
}
