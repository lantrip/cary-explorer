// USGS Watershed Boundary Dataset (WBD) HUC-12 subwatersheds as catalog places, and park/trail -> watershed links.
// Pure and dependency-free. Only boundaries and names are used; WBD's flow field (`tohuc`) is never read, so nothing
// here can claim a flow or downstream connection (that is issue #28).
import { extent, haversineM, inPrepared, pointInPolygon, polygonsOf, simplifyLine } from './geo.mjs'

export const WATERSHED_SIMPLIFY_M = 25
/** A park lists a second watershed when at least this share of its sample points fall in it. */
export const DIVIDE_SHARE = 0.1
/** A trail lists every watershed that holds at least this share of its length. */
export const TRAIL_MIN_SHARE = 0.15
/** A trail with one watershed holding at least this share keeps a single link. */
export const TRAIL_SINGLE_SHARE = 0.8
const GRID = 12
const MAX_PER_PARK = 3

/** "Crabtree Creek" -> "Crabtree Creek watershed"; a name that already says "watershed" is kept. */
export function watershedPlaceName(huc12Name) {
  const n = String(huc12Name ?? '').trim().replace(/\s+/g, ' ')
  return /watershed/i.test(n) ? n : `${n} watershed`
}

/** "Part of the Neuse River Basin (HUC-8 Upper Neuse)", from the data only; parts that are missing are left out. */
export function watershedDescription(w) {
  const basin = w.huc6Name ? `the ${w.huc6Name} River Basin` : null
  const sub = w.huc8Name ? `HUC-8 ${w.huc8Name}` : null
  if (basin && sub) return `Part of ${basin} (${sub}).`
  if (basin) return `Part of ${basin}.`
  if (sub) return `Part of ${sub}.`
  return `USGS subwatershed ${w.huc12}.`
}

/**
 * River basins (HUC-6 names) that the watersheds linked from a city's parks and trails belong to.
 * `cityIds`: ids of the city's places; `links`: watershed relationships; `basinById`: watershed place id -> basin name.
 * Returns [{ basin, links, watersheds: [ids] }], most links first (ties by name). Membership counts only.
 */
export function cityBasins(cityIds, links, basinById) {
  const ids = new Set(cityIds)
  const byBasin = new Map()
  for (const l of links) {
    if (!ids.has(l.from)) continue
    const basin = basinById.get(l.to)
    if (!basin) continue
    const e = byBasin.get(basin) ?? { basin, links: 0, watersheds: new Set() }
    e.links++
    e.watersheds.add(l.to)
    byBasin.set(basin, e)
  }
  return [...byBasin.values()]
    .map((e) => ({ ...e, watersheds: [...e.watersheds].sort() }))
    .sort((a, b) => b.links - a.links || (a.basin < b.basin ? -1 : 1))
}

/**
 * Learn-more links shown on the watershed cards that carry the Cary two-basin line (decision 28).
 * Both Town of Cary pages were checked by hand in a real browser on 2026-11-13 (the town site blocks automated requests).
 * Titles are our own; no page text is copied.
 */
export const CARY_BASIN_REFERENCES = Object.freeze([
  Object.freeze({
    title: "Cary's watersheds and river basins",
    url: 'https://www.carync.gov/services-publications/water-sewer/stormwater-management/education',
    publisher: 'Town of Cary',
  }),
  Object.freeze({
    title: 'Stream buffer factsheet (PDF)',
    url: 'https://www.carync.gov/home/showpublisheddocument/29665/638175019926530000',
    publisher: 'Town of Cary',
  }),
])

/** Ids of the watershed places that get the Cary two-basin line (and so the references); empty when there is no line. */
export function caryLineWatershedIds(caryLine, basins) {
  return caryLine ? [...new Set(basins.flatMap((b) => b.watersheds))].sort() : []
}

/** "Cary lies in two river basins, Neuse and Cape Fear." Only when the data shows exactly two basins; otherwise null. */
export function cityBasinLine(city, basins) {
  if (basins.length !== 2) return null
  return `${city} lies in two river basins, ${basins[0].basin} and ${basins[1].basin}.`
}

/** Joins HUC-12 features with the HUC-8 and HUC-6 name tables. Sorted by huc12. */
export function mapWatersheds({ huc12, huc8, huc6 }) {
  const names8 = new Map(huc8.features.map((f) => [f.properties.huc8, f.properties.name]))
  const names6 = new Map(huc6.features.map((f) => [f.properties.huc6, f.properties.name]))
  const out = []
  for (const f of huc12.features) {
    const p = f.properties ?? {}
    const code = String(p.huc12 ?? '')
    const polygons = polygonsOf(f.geometry)
    if (!/^\d{12}$/.test(code) || !String(p.name ?? '').trim() || !polygons.length) continue
    out.push({
      huc12: code,
      name: String(p.name).trim(),
      placeName: watershedPlaceName(p.name),
      huc8: code.slice(0, 8),
      huc8Name: names8.get(code.slice(0, 8)),
      huc6: code.slice(0, 6),
      huc6Name: names6.get(code.slice(0, 6)),
      polygons,
    })
  }
  return out.sort((a, b) => (a.huc12 < b.huc12 ? -1 : a.huc12 > b.huc12 ? 1 : 0))
}

const inBox = (p, b) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]

/** Prepares a watershed for repeated point tests. */
export function prepareWatershed(w) {
  return { ...w, polyBoxes: w.polygons.map((polygon) => ({ polygon, bbox: extent(polygon[0] ?? []) })) }
}

export function pointInWatershed(point, w) {
  for (const pb of w.polyBoxes) if (inBox(point, pb.bbox) && pointInPolygon(point, pb.polygon)) return true
  return false
}

/** True when the watershed overlaps a prepared scope polygon set (vertex tests both ways; no edge-only crossings). */
export function intersectsScope(w, prepared) {
  if (w.polygons.flat(2).some((p) => inPrepared(p, prepared))) return true
  const pw = w.polyBoxes ? w : prepareWatershed(w)
  return prepared.polys.some((sp) => sp.polygon[0]?.some((p) => pointInWatershed(p, pw)))
}

const REP_GRID = 40

/**
 * The pin and municipality point of a watershed: the point inside the watershed that `allowed` accepts (here: inside
 * Wake, Chatham or Durham County, so every place keeps a county) nearest to `target`, searched on a grid over its bbox.
 * Null when no such point exists, i.e. the watershed has no area in the counties we hold.
 */
export function representativePoint(w, target, allowed) {
  const pw = w.polyBoxes ? w : prepareWatershed(w)
  const box = extent(w.polygons.flat(2))
  const inside = []
  for (let i = 0; i < REP_GRID; i++) {
    for (let j = 0; j < REP_GRID; j++) {
      const p = [box[0] + ((i + 0.5) / REP_GRID) * (box[2] - box[0]), box[1] + ((j + 0.5) / REP_GRID) * (box[3] - box[1])]
      if (pointInWatershed(p, pw)) inside.push({ p, d: (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 })
    }
  }
  inside.sort((x, y) => x.d - y.d)
  // Nearest first, so `allowed` (a county lookup) usually runs once.
  const best = inside.find(({ p }) => allowed(p))?.p ?? null
  return best
}

/** Rings simplified for the layer. A polygon whose outer ring collapses below 4 positions is dropped; so are collapsed holes. */
export function simplifyPolygons(polygons, toleranceM = WATERSHED_SIMPLIFY_M) {
  const out = []
  for (const poly of polygons) {
    const rings = poly.map((r) => simplifyLine(r, toleranceM))
    if (rings[0].length < 4) continue
    out.push(rings.filter((r, i) => i === 0 || r.length >= 4))
  }
  return out
}

/** Sample points inside the polygons of a park (centroid first), on a regular grid over its bbox. */
function samplePoints(polygons) {
  const pts = []
  const box = extent(polygons.flat(2))
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const p = [box[0] + ((i + 0.5) / GRID) * (box[2] - box[0]), box[1] + ((j + 0.5) / GRID) * (box[3] - box[1])]
      if (polygons.some((poly) => pointInPolygon(p, poly))) pts.push(p)
    }
  }
  return pts
}

/**
 * Watersheds of a trail, from its lines: [{ code, share }] with share = fraction of the trail's length (each segment
 * counted in the watershed holding its midpoint; length outside every watershed is ignored). One watershed holding
 * TRAIL_SINGLE_SHARE or more -> just that one. Otherwise every watershed holding at least TRAIL_MIN_SHARE, largest
 * first. Empty when no segment lies in a watershed. Shares are rounded to 2 decimals.
 */
export function trailShares(lines, prepared) {
  const lengths = new Map()
  let total = 0
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      const hit = prepared.find((w) => pointInWatershed([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], w))
      if (!hit) continue
      const m = haversineM(a, b)
      lengths.set(hit.huc12, (lengths.get(hit.huc12) ?? 0) + m)
      total += m
    }
  }
  if (!(total > 0)) return []
  const ranked = [...lengths.entries()]
    .map(([code, m]) => ({ code, share: m / total }))
    .sort((x, y) => y.share - x.share || (x.code < y.code ? -1 : 1))
  const round = (n) => Math.round(n * 100) / 100
  if (ranked[0].share >= TRAIL_SINGLE_SHARE) return [{ code: ranked[0].code, share: round(ranked[0].share) }]
  const kept = ranked.filter((r) => r.share >= TRAIL_MIN_SHARE)
  return (kept.length ? kept : ranked.slice(0, 1)).map((r) => ({ code: r.code, share: round(r.share) }))
}

/** [{ code, share? }] for one item. Only a trail drawn as lines gets shares; `share` is set only when it has several. */
function watershedLinksFor(item, prepared) {
  if ((item.kind === 'trail' || item.kind === 'creek') && item.lines?.length) {
    const shares = trailShares(item.lines, prepared)
    if (shares.length > 1) return shares
    if (shares.length === 1) return [{ code: shares[0].code }]
  }
  return watershedsFor(item, prepared).map((code) => ({ code }))
}

/**
 * Watersheds (as huc12 codes, most of the place first) for one item { kind, centroid, polygons? }.
 * A trail or a point-only park uses its centroid. A park drawn as polygons also lists a second watershed that holds
 * at least DIVIDE_SHARE of its sample points. Returns [] when no watershed holds the centroid ("not determined").
 */
export function watershedsFor(item, prepared) {
  const home = prepared.find((w) => pointInWatershed(item.centroid, w))
  if (!home) return []
  const result = [home.huc12]
  if (item.kind === 'park' && item.polygons?.length) {
    const pts = samplePoints(item.polygons)
    const counts = new Map()
    for (const p of pts) {
      const hit = prepared.find((w) => pointInWatershed(p, w))
      if (hit) counts.set(hit.huc12, (counts.get(hit.huc12) ?? 0) + 1)
    }
    const total = pts.length
    if (total >= 3) {
      const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
      const codes = ranked.filter(([, n]) => n / total >= DIVIDE_SHARE).map(([code]) => code)
      if (!codes.includes(home.huc12)) codes.unshift(home.huc12)
      return codes.slice(0, MAX_PER_PARK)
    }
  }
  return result
}

/**
 * Relationships park/trail -> watershed place: { from, to: watershedPlaceId, kind: 'contained', basis: 'watershed' }.
 * A trail with `lines` links every watershed holding 15% or more of its length (a single link when one holds 80% or more);
 * when it has several, each link carries `share`. Parks are unchanged (centroid plus the divide rule).
 * `items`: [{ id, kind, centroid, polygons?, lines? }]; `idByHuc12`: huc12 -> place id. Also returns the ids with no watershed.
 */
export function watershedRelationships(items, prepared, idByHuc12) {
  const relationships = []
  const notDetermined = []
  for (const item of items) {
    const links = watershedLinksFor(item, prepared)
    if (!links.length) {
      notDetermined.push(item.id)
      continue
    }
    for (const { code, share } of links) {
      const to = idByHuc12.get(code)
      if (to) relationships.push({ from: item.id, to, kind: 'contained', basis: 'watershed', ...(share === undefined ? {} : { share }) })
    }
  }
  return { relationships, notDetermined }
}
