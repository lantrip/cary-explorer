#!/usr/bin/env node
// Builds catalog.json, layers/*.geojson and relationships.json from the committed snapshots in
// pipeline/sources/. Dependency-free, deterministic (stable sort by id).
// Run: node pipeline/scripts/build-catalog.mjs [--out <dir>]   (default dir: pipeline/.staging; publish.mjs moves it into public/data)
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classify,
  classifyLine,
  clipToLimit,
  createScope,
  extent,
  haversineM,
  linesOf,
  pointInGeometry,
  pointInPolygon,
  polygonsOf,
  roundTo,
  simplifyLine,
  splitByCore,
} from '../lib/geo.mjs'
import { computeRelationships, computeStationLinks } from '../lib/relationships.mjs'
import { buildCollections } from '../lib/collections.mjs'
import { CREEK_MIN_M, creekDescription, creekPin, creekRelationships, groupCreeks, simplifyCreekLines } from '../lib/creeks.mjs'
import { intersectsScope, mapWatersheds, prepareWatershed, representativePoint, simplifyPolygons, watershedDescription, watershedRelationships } from '../lib/watersheds.mjs'
import { amenitiesOf, buildVisitFields, verifiedDate } from '../lib/visit.mjs'

export { pointInGeometry, pointInPolygon }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'pipeline', 'sources')
const OUT = join(ROOT, 'pipeline', '.staging')

// Catalog source id -> registry id (pipeline/sources.config.json), where they differ. The title comes from the registry.
const REGISTRY_ID = {
  'cary-parks': 'parks-and-recreation-feature-polygons',
  'cary-greenways': 'proposed-greenway-trails',
  'cary-park-features': 'parks-and-recreation-feature-map',
}
/** The registry's dataset title for a catalog source id. Throws when the registry has none. */
export function registryTitle(registry, catalogId) {
  const entry = registry.find((r) => r.id === (REGISTRY_ID[catalogId] ?? catalogId))
  if (typeof entry?.title !== 'string' || !entry.title.trim()) throw new Error(`No registry title for catalog source "${catalogId}"`)
  return entry.title.trim()
}

const PARK_LEVELS = new Set(['Existing Park', 'Natural Area', 'Community Use Facility'])
const GREENWAY_MIN_MILES = 0.5
const GREENWAY_EXCLUDE = /connector|street-side|sidewalk|side path/i
const COORD_DECIMALS = 6
const WATER_COORD_DECIMALS = 5
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
// The snapshot's `length_in_miles` is off by a factor of 5280 (the median haversine length of a segment
// divided by it is 5280.0), so real miles = value * 5280. Verified against the geometry.
const LENGTH_MILES_SCALE = 5280

// ---------- pure helpers ----------

/** Trim, collapse whitespace, lowercase. Returns '' for non-strings. */
export function normalize(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

/** Lowercase ascii slug with hyphens. */
export function slug(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const round = (n, decimals = COORD_DECIMALS) => roundTo(n, decimals)

const roundPos = (p, d) => [round(p[0], d), round(p[1], d)]
const roundRing = (ring, d) => ring.map((p) => roundPos(p, d))

function ringArea(ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return a / 2
}

/** Area-weighted centroid of an array of Polygon coordinates (planar lon/lat). Falls back to the vertex mean. */
export function centroid(polygons) {
  let area = 0
  let cx = 0
  let cy = 0
  for (const poly of polygons) {
    poly.forEach((ring, idx) => {
      if (ring.length < 3) return
      const a = Math.abs(ringArea(ring))
      if (a === 0) return
      const sign = idx === 0 ? 1 : -1
      let rx = 0
      let ry = 0
      const signed = ringArea(ring)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
        rx += (ring[j][0] + ring[i][0]) * f
        ry += (ring[j][1] + ring[i][1]) * f
      }
      const ccx = rx / (6 * signed)
      const ccy = ry / (6 * signed)
      area += sign * a
      cx += sign * a * ccx
      cy += sign * a * ccy
    })
  }
  if (area > 0) return [round(cx / area), round(cy / area)]
  const pts = polygons.flat(2).filter((p) => Array.isArray(p) && typeof p[0] === 'number')
  const n = pts.length || 1
  return [round(pts.reduce((s, p) => s + p[0], 0) / n), round(pts.reduce((s, p) => s + p[1], 0) / n)]
}

export function bboxOf(positions) {
  return extent(positions).map((v) => round(v))
}

/** The vertex closest to the bbox centre, so a trail pin sits on the trail. */
export function vertexNearestBboxCentre(positions) {
  const [a, b, c, d] = bboxOf(positions)
  const cx = (a + c) / 2
  const cy = (b + d) / 2
  let best = positions[0]
  let bestD = Infinity
  for (const p of positions) {
    const dist = (p[0] - cx) ** 2 + (p[1] - cy) ** 2
    if (dist < bestD) {
      bestD = dist
      best = p
    }
  }
  return roundPos(best, COORD_DECIMALS)
}

/** Cary's park points use the old townofcary.org domain, which 301-redirects to carync.gov. */
export function carynUrl(url) {
  return typeof url === 'string' ? url.trim().replace(/^https?:\/\/www\.townofcary\.org\//, 'https://www.carync.gov/') : url
}

/** Most common original spelling of a name group (ties: first alphabetically). */
function displayName(names) {
  const counts = new Map()
  for (const n of names) {
    const clean = n.trim().replace(/\s+/g, ' ')
    counts.set(clean, (counts.get(clean) ?? 0) + 1)
  }
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'en'))[0][0]
}

/**
 * Group park parcels into one entry per normalized name.
 * Returns [{ key, name, category, acres, polygons, parcels }] sorted by key.
 */
export function groupParks(features) {
  const groups = new Map()
  for (const f of features) {
    const p = f.properties ?? {}
    const key = normalize(p.name)
    if (!key || !PARK_LEVELS.has(p.uselevel2)) continue
    const polys = polygonsOf(f.geometry)
    if (!polys.length) continue
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, names: [], levels: new Set(), acres: 0, polygons: [], parcels: 0 }))
    g.names.push(p.name)
    g.levels.add(p.uselevel2)
    g.acres += Number(p.calcacreag) || 0
    g.polygons.push(...polys)
    g.parcels++
  }
  return [...groups.values()]
    .map((g) => {
      const parkLike = g.levels.has('Existing Park') || g.levels.has('Natural Area')
      const natural = !g.levels.has('Existing Park') && g.levels.has('Natural Area')
      return {
        key: g.key,
        name: displayName(g.names),
        category: parkLike ? 'park' : 'community',
        kind: parkLike ? (natural ? 'natural area' : 'park') : 'community facility',
        acres: g.acres,
        polygons: g.polygons,
        parcels: g.parcels,
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key, 'en'))
}

/**
 * Group Existing greenway segments by normalized name and apply the keep rules.
 * Returns { kept, dropped } where each entry is { key, name, miles, lines, segments }.
 */
export function groupGreenways(features) {
  const groups = new Map()
  for (const f of features) {
    const p = f.properties ?? {}
    const key = normalize(p.name)
    if (!key || p.status !== 'Existing') continue
    const lines = linesOf(f.geometry)
    if (!lines.length) continue
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, names: [], miles: 0, lines: [], segments: 0 }))
    g.names.push(p.name)
    g.miles += (Number(p.length_in_miles) || 0) * LENGTH_MILES_SCALE
    g.lines.push(...lines)
    g.segments++
  }
  const kept = []
  const dropped = []
  for (const g of groups.values()) {
    const entry = { key: g.key, name: displayName(g.names), miles: g.miles, lines: g.lines, segments: g.segments }
    ;(g.miles >= GREENWAY_MIN_MILES && !GREENWAY_EXCLUDE.test(g.key) ? kept : dropped).push(entry)
  }
  const byKey = (a, b) => a.key.localeCompare(b.key, 'en')
  kept.sort(byKey)
  dropped.sort(byKey)
  return { kept, dropped }
}

/**
 * Resolve stable ids. `existing` maps key -> id and is never changed; new keys get `<prefix>-<slug>`.
 * Throws if two keys would share an id. Returns a new, key-sorted object.
 */
export function assignIds(existing, entries) {
  const out = { ...existing }
  const owner = new Map()
  for (const [k, id] of Object.entries(out)) {
    if (owner.has(id)) throw new Error(`ids.json: "${k}" and "${owner.get(id)}" share id "${id}"`)
    owner.set(id, k)
  }
  for (const { key, prefix, name } of entries) {
    if (out[key] === undefined) {
      const s = slug(name)
      if (!s) throw new Error(`Cannot slug "${name}"`)
      out[key] = `${prefix}-${s}`
    }
    const prior = owner.get(out[key])
    if (prior !== undefined && prior !== key) {
      throw new Error(`Id collision: "${key}" and "${prior}" would both be "${out[key]}"`)
    }
    owner.set(out[key], key)
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export function countyOf(point, counties) {
  for (const c of counties.features) {
    if (pointInGeometry(point, c.geometry)) return String(c.properties.NAME).replace(/ County$/, '')
  }
  return undefined
}

/** The twelve study towns, exactly as shown in the app (Census BASENAME). Order is irrelevant to the result. */
export const TOWNS = [
  'Cary', 'Apex', 'Morrisville', 'Raleigh', 'Garner', 'Holly Springs',
  'Fuquay-Varina', 'Knightdale', 'Wendell', 'Zebulon', 'Wake Forest', 'Rolesville',
]
export const UNINCORPORATED_WAKE = 'Unincorporated Wake County'

/**
 * Municipality by point-in-polygon against Census incorporated places (never ZIP/postal data).
 * `towns` is a FeatureCollection; `county` is the bare county name ("Wake") or undefined.
 */
export function municipalityOf(point, towns, county) {
  const names = new Set(TOWNS)
  for (const f of towns.features) {
    const name = f.properties?.BASENAME
    if (names.has(name) && pointInGeometry(point, f.geometry)) return name
  }
  return county === 'Wake' ? UNINCORPORATED_WAKE : county ? `${county} County` : UNINCORPORATED_WAKE
}

/** "City of Raleigh" -> "Raleigh". */
export const stripJurisdiction = (j) => String(j ?? '').replace(/^(City|Town|Village) of /i, '').trim()

// ---------- IO ----------

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const readOptional = (path, fallback) => (existsSync(path) ? readJson(path) : fallback)
const cary = (name) => join(SRC, 'cary', name)

const fmtNumber = (n) => {
  if (n >= 10) return String(Math.round(n))
  const r = Math.round(n * 10) / 10
  return r === 0 ? 'under 0.1' : String(r)
}

function roundGeometry(geometry, decimals) {
  switch (geometry.type) {
    case 'MultiPolygon':
      return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((poly) => poly.map((r) => roundRing(r, decimals))) }
    case 'MultiLineString':
      return { type: 'MultiLineString', coordinates: geometry.coordinates.map((l) => roundRing(l, decimals)) }
    default:
      throw new Error(`Unexpected geometry ${geometry.type}`)
  }
}

export const DEDUPE_M = 1000

/** The Cary place that is the same park as a Wake record: same normalized name (or alias) within 1 km. */
export function findCaryTwin(name, pt, caryNames) {
  const wn = normalize(name)
  return caryNames.find((c) => c.names.has(wn) && haversineM(c.centroid, pt) <= DEDUPE_M)
}

/**
 * Layer features for one greenway place: the existing lines first, then the proposed lines (clipped like the
 * existing ones), each split into a core part and an outside-core part. Proposed lines never touch place fields.
 */
export function greenwayFeatures(placeId, existingLines, proposedLinesRaw, scope) {
  const proposed = clipToLimit(proposedLinesRaw, scope.crossing, scope.core).lines
  const out = []
  for (const [status, segLines] of [['existing', existingLines], ['proposed', proposed]]) {
    if (!segLines.length) continue
    const parts = splitByCore(segLines, scope.core)
    for (const [outsideCore, coordinates] of [[false, parts.inside], [true, parts.outside]]) {
      if (!coordinates.length) continue
      out.push({
        type: 'Feature',
        properties: { placeId, status, outsideCore },
        geometry: { type: 'MultiLineString', coordinates },
      })
    }
  }
  return out
}

// ---------- Wake County fire stations (issue #27) ----------

/** What the AGENCY code is known to mean. Only CF and RF map 1:1 to the station labels ("Cary #n", "RFD #n"); FD covers many departments, so it says nothing. */
export const FIRE_AGENCY = { CF: 'Cary Fire Department', RF: 'Raleigh Fire Department' }
/**
 * Official department pages, shown as the card's "Website" link. Checked 2026-11-10 with curl (plain GET, redirects followed):
 * raleighnc.gov/fire returns HTTP 200 on the town's own .gov domain. The Town of Cary site (carync.gov) answered HTTP 403 to
 * every plain request, so no Cary page could be confirmed and Cary stations carry no website. Never guess a URL.
 */
export const FIRE_DEPARTMENT_URL = { 'Raleigh Fire Department': 'https://raleighnc.gov/fire' }
/** LABEL prefixes that are abbreviations. "RFD" is the Raleigh Fire Department (AGENCY RF on every such station). */
const FIRE_LABEL_PREFIX = { RFD: 'Raleigh' }

/**
 * Name and number from a Wake FireStations LABEL (never invents a number):
 *  - "<prefix> #N"            -> "<prefix> Fire Station N" with stationNumber N ("Cary #1" -> "Cary Fire Station 1"; "RFD #5" -> "Raleigh Fire Station 5")
 *  - a label that already says "Fire" -> kept as written ("Durham Fire 17")
 *  - any other label (no number) -> "<label> Fire Station" ("Hopkins" -> "Hopkins Fire Station")
 * Returns undefined for an empty label.
 */
export function fireStationName(label) {
  const clean = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : ''
  if (!clean) return undefined
  const m = /^(.*?)\s*#\s*(\d+)$/.exec(clean)
  if (m && m[1]) {
    const prefix = FIRE_LABEL_PREFIX[m[1]] ?? m[1]
    return { name: `${prefix} Fire Station ${Number(m[2])}`, stationNumber: Number(m[2]) }
  }
  return { name: /\bfire\b/i.test(clean) ? clean : `${clean} Fire Station` }
}

/** Fire stations from the Wake layer: one per STATIONID (ID has duplicates and nulls; the first record by OBJECTID wins), with a name, a LOCATION and a point. */
export function groupFireStations(features) {
  const seen = new Set()
  const out = []
  for (const f of features) {
    const p = f.properties ?? {}
    const stationId = typeof p.STATIONID === 'string' ? p.STATIONID.trim() : ''
    const named = fireStationName(p.LABEL)
    const pt = f.geometry?.coordinates
    if (!stationId || !named || !Array.isArray(pt) || seen.has(stationId.toLowerCase())) continue
    seen.add(stationId.toLowerCase())
    const location = typeof p.LOCATION === 'string' ? p.LOCATION.trim().replace(/\s+/g, ' ') : ''
    const city = typeof p.CITY === 'string' ? p.CITY.trim() : ''
    out.push({ stationId, ...named, address: location ? (city ? `${location}, ${city}` : location) : undefined, agency: FIRE_AGENCY[String(p.AGENCY ?? '').trim()], pt })
  }
  return out
}

/** Card text from the data only: operator when the AGENCY code is known, the address, and the source. No service area, no response times. */
export function fireStationDescription(s) {
  return `Fire station${s.agency ? ` operated by ${s.agency}` : ''}${s.address ? `, at ${s.address}` : ''} (from Wake County's fire stations layer).`
}

// ---------- Wake County greenways (regional trails outside Cary) ----------

/** Layer simplification for regional trails, in metres. Cary's own greenways are not simplified. */
export const WAKE_GREENWAY_SIMPLIFY_M = 5
const CARY_OWNERS = new Set(['town of cary', 'cary'])
// Same rule as Cary (GREENWAY_EXCLUDE), plus names that are only a street ("Davis Drive") or a development path.
const WAKE_GREENWAY_EXCLUDE = new RegExp(
  `${GREENWAY_EXCLUDE.source}|sidepath|\\bside$|multi.?use (side)?path|\\b(dr|drive|rd|road|blvd|pkwy|parkway|ave|avenue|ln|lane|st|street|way)$|\\bdev$`,
  'i',
)
const OWNER_LABELS = { cor: 'Raleigh' }

/** Length in metres of an array of lines. */
export function lineLengthM(lines) {
  let m = 0
  for (const line of lines) for (let i = 1; i < line.length; i++) m += haversineM(line[i - 1], line[i])
  return m
}

/** Wake's TRAIL_STATUS -> the layer status, or undefined when the source says something else (planned and under construction are not trails yet). */
export function wakeGreenwayStatus(raw) {
  const s = normalize(raw)
  if (s === 'existing') return 'existing'
  if (s === 'proposed') return 'proposed'
  return undefined
}

/** "City of Raleigh" / "COR" -> "Raleigh"; blank owners -> undefined. */
export function wakeOwnerLabel(owner) {
  const o = String(owner ?? '').trim()
  if (!o) return undefined
  return OWNER_LABELS[o.toLowerCase()] ?? stripJurisdiction(o)
}

/** The surface that covers most of the length, lowercase ("asphalt"), ignoring blank and "other"; undefined when no segment states one. */
export function dominantSurface(segments) {
  const by = new Map()
  for (const s of segments) {
    const k = normalize(s.surface)
    if (!k || k === 'other') continue
    by.set(k, (by.get(k) ?? 0) + s.lengthM)
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0]
}

/**
 * Group Wake County greenway segments by normalized trail name (TRAIL_NAME, else CORRIDOR_NAME), leaving out
 * Cary-owned segments (Cary's CC0 greenways win), private paths and unnamed segments, then apply the Cary keep rules
 * (at least 0.5 mi of existing trail, not a connector, street-side, sidewalk or street name).
 * Returns { kept, dropped, skipped: { cary, private, unnamed, notExisting } }; entries are
 * { key, name, miles, lines, segments, owners, surface, proposedLines }.
 */
export function groupWakeGreenways(features) {
  const groups = new Map()
  const skipped = { cary: 0, private: 0, unnamed: 0, notExisting: 0 }
  for (const f of features) {
    const p = f.properties ?? {}
    const owner = String(p.OWNER ?? '').trim().toLowerCase()
    if (CARY_OWNERS.has(owner)) {
      skipped.cary++
      continue
    }
    if (owner === 'private') {
      skipped.private++
      continue
    }
    const rawName = String(p.TRAIL_NAME ?? '').trim() || String(p.CORRIDOR_NAME ?? '').trim()
    const key = normalize(rawName)
    if (!key) {
      skipped.unnamed++
      continue
    }
    const status = wakeGreenwayStatus(p.TRAIL_STATUS)
    const lines = linesOf(f.geometry)
    if (!status || !lines.length) {
      skipped.notExisting++
      continue
    }
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, names: [], lengthM: 0, lines: [], proposedLines: [], segments: 0, owners: new Map(), parts: [] }))
    if (status === 'proposed') {
      g.proposedLines.push(...lines)
      continue
    }
    const lengthM = lineLengthM(lines)
    g.names.push(rawName)
    g.lengthM += lengthM
    g.lines.push(...lines)
    g.segments++
    const label = wakeOwnerLabel(p.OWNER)
    if (label) g.owners.set(label, (g.owners.get(label) ?? 0) + lengthM)
    g.parts.push({ surface: p.TRAIL_SURFACE, access: p.ACCESSIBILITY_STATUS, lengthM })
  }
  const kept = []
  const dropped = []
  for (const g of groups.values()) {
    if (!g.segments) continue // proposed-only: never creates a place
    const owners = [...g.owners.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([o]) => o)
    const entry = {
      key: g.key,
      name: displayName(g.names),
      miles: g.lengthM / 1609.344,
      lines: g.lines,
      proposedLines: g.proposedLines,
      segments: g.segments,
      owners,
      surface: dominantSurface(g.parts),
      visitSegments: g.parts.map(({ surface, access }) => ({ surface, access })),
    }
    ;(entry.miles >= GREENWAY_MIN_MILES && !WAKE_GREENWAY_EXCLUDE.test(g.key) ? kept : dropped).push(entry)
  }
  const byKey = (a, b) => a.key.localeCompare(b.key, 'en')
  kept.sort(byKey)
  dropped.sort(byKey)
  return { kept, dropped, skipped }
}

/**
 * The existing place a Wake greenway duplicates: same normalized name (or alias) and some vertex of the trail within
 * 1 km of that place's centroid. Checked against Cary greenways and parks and the Wake parks added before it.
 * Returns { twin, distanceM } or undefined.
 */
export function findTrailTwin(name, lines, candidates) {
  const wn = normalize(name)
  let best
  for (const c of candidates) {
    if (!c.names.has(wn)) continue
    let d = Infinity
    for (const line of lines) for (const p of line) d = Math.min(d, haversineM(c.centroid, p))
    if (d <= DEDUPE_M && (!best || d < best.distanceM)) best = { twin: c, distanceM: Math.round(d) }
  }
  return best
}

export function build({ write = true, outDir = OUT } = {}) {
  const parksData = readJson(join(cary('parks-and-recreation-feature-polygons'), 'data.geojson'))
  const pointsData = readJson(join(cary('parks-and-recreation-feature-map'), 'data.geojson'))
  const greenData = readJson(join(cary('proposed-greenway-trails'), 'data.geojson'))
  const counties = readJson(join(SRC, 'boundaries', 'census-counties-wake-chatham-durham.geojson'))
  const limits = readJson(join(SRC, 'boundaries', 'cary-corporate-limits.geojson'))
  const towns = readJson(join(SRC, 'census', 'places', 'data.geojson'))
  const wake = readJson(join(SRC, 'wake', 'parks', 'data.geojson'))
  const wakeMeta = readJson(join(SRC, 'wake', 'parks', 'meta.json'))
  const wakeGreenData = readJson(join(SRC, 'wake', 'greenways', 'data.geojson'))
  const wakeGreenMeta = readJson(join(SRC, 'wake', 'greenways', 'meta.json'))
  const fireData = readJson(join(SRC, 'wake', 'fire-stations', 'data.geojson'))
  const fireMeta = readJson(join(SRC, 'wake', 'fire-stations', 'meta.json'))
  const entrancesData = readJson(join(SRC, 'wake', 'park-entrances', 'data.geojson'))
  const entrancesMeta = readJson(join(SRC, 'wake', 'park-entrances', 'meta.json'))
  const featuresMeta = readJson(join(cary('parks-and-recreation-feature-map'), 'meta.json'))
  const scope = createScope({
    core: readJson(join(SRC, 'boundaries', 'core.geojson')),
    nearby: readJson(join(SRC, 'boundaries', 'nearby-buffer.geojson')),
    crossing: readJson(join(SRC, 'boundaries', 'crossing-limit.geojson')),
  })
  const parksMeta = readJson(join(cary('parks-and-recreation-feature-polygons'), 'meta.json'))
  const greenMeta = readJson(join(cary('proposed-greenway-trails'), 'meta.json'))
  const idsPath = join(ROOT, 'pipeline', 'ids.json')
  const aliasPath = join(ROOT, 'pipeline', 'aliases.json')
  const aliasMap = readOptional(aliasPath, {})

  const parks = groupParks(parksData.features)
  const { kept, dropped } = groupGreenways(greenData.features)

  const ids = assignIds(readOptional(idsPath, {}), [
    ...parks.map((p) => ({ key: `cary-parks:${p.key}`, prefix: 'cary-park', name: p.name })),
    ...kept.map((g) => ({ key: `cary-greenways:${g.key}`, prefix: 'cary-greenway', name: g.name })),
  ])

  const urlPoints = pointsData.features
    .filter((f) => f.geometry?.type === 'Point' && typeof f.properties?.parkurl === 'string')
    .map((f) => ({ ...f, properties: { ...f.properties, parkurl: carynUrl(f.properties.parkurl) } }))
    .filter((f) => f.properties.parkurl.startsWith('https://www.carync.gov/'))
    .sort((a, b) => a.properties.parkurl.localeCompare(b.properties.parkurl, 'en'))

  const existingSegments = new Map() // normalized greenway name -> Existing segment properties
  for (const f of greenData.features) {
    const key = normalize(f.properties?.name)
    if (!key || f.properties?.status !== 'Existing') continue
    if (!existingSegments.has(key)) existingSegments.set(key, [])
    existingSegments.get(key).push(f.properties)
  }
  const proposedLines = new Map() // normalized greenway name -> Proposed segment lines (layer only; never feeds place fields)
  for (const f of greenData.features) {
    const key = normalize(f.properties?.name)
    if (!key || f.properties?.status !== 'Proposed') continue
    const lines = linesOf(f.geometry)
    if (!lines.length) continue
    if (!proposedLines.has(key)) proposedLines.set(key, [])
    proposedLines.get(key).push(...lines)
  }
  const places = []
  const visitCtx = new Map() // place id -> inputs for buildVisitFields
  const parkFeatures = []
  const greenFeatures = []
  const relItems = []
  const trailMiles = new Map() // trail place id -> miles computed above (the same figure the description rounds)

  for (const p of parks) {
    const id = ids[`cary-parks:${p.key}`]
    const c = centroid(p.polygons)
    const bbox = bboxOf(p.polygons.flat(2))
    // The points dataset has no name column, so join by the point falling inside the park's parcels.
    const hit = urlPoints.find((pt) => p.polygons.some((poly) => pointInPolygon(pt.geometry.coordinates, poly)))
    const acres = fmtNumber(p.acres)
    const coverage = classify(c, scope)
    if (coverage === 'outside') continue
    const county = countyOf(c, counties)
    const place = {
      id,
      name: p.name,
      aliases: [],
      category: p.category,
      municipality: municipalityOf(c, towns, county),
      county,
      coverage,
      centroid: c,
      bbox,
      description: `Town of Cary ${p.kind}, about ${acres} ${acres === '1' ? 'acre' : 'acres'} (from Cary's parks dataset).`,
      url: hit?.properties.parkurl,
      sourceIds: ['cary-parks'],
    }
    places.push(place)
    visitCtx.set(id, {
      polygons: p.polygons,
      caryPoints: pointsData.features
        .filter((pt) => pt.geometry?.type === 'Point' && p.polygons.some((poly) => pointInPolygon(pt.geometry.coordinates, poly)))
        .map((pt) => pt.properties),
    })
    parkFeatures.push({
      type: 'Feature',
      properties: { placeId: id, outsideCore: coverage !== 'core' },
      geometry: { type: 'MultiPolygon', coordinates: p.polygons },
    })
    relItems.push({ id, kind: 'park', polygons: p.polygons })
  }

  for (const g of kept) {
    const id = ids[`cary-greenways:${g.key}`]
    const coverage = classifyLine(g.lines, scope)
    if (coverage === 'outside') continue
    // Crossing trails stay whole up to the crossing limit (docs/scope.md); the rest is cut.
    const { lines } = clipToLimit(g.lines, scope.crossing, scope.core)
    if (!lines.length) continue
    const verts = lines.flat()
    const c = vertexNearestBboxCentre(verts)
    const miles = fmtNumber(g.miles)
    const county = countyOf(c, counties)
    visitCtx.set(id, { segments: existingSegments.get(g.key) ?? [] })
    places.push({
      id,
      name: g.name,
      aliases: [],
      category: 'trail',
      municipality: municipalityOf(c, towns, county),
      county,
      coverage,
      centroid: c,
      bbox: bboxOf(verts),
      description: `Town of Cary greenway, about ${miles} ${miles === '1' ? 'mile' : 'miles'} of existing trail (from Cary's greenway dataset).`,
      sourceIds: ['cary-greenways'],
    })
    greenFeatures.push(...greenwayFeatures(id, lines, proposedLines.get(g.key) ?? [], scope))
    relItems.push({ id, kind: 'trail', lines })
    trailMiles.set(id, g.miles)
  }

  // Wake County parks layer. Cary's own CC0 data wins inside Cary's corporate limits (docs/source-matrix.md section 4).
  const limitGeoms = limits.features.map((f) => f.geometry)
  const neighbours = []
  const wakeKeys = []
  const seenKeys = new Set()
  let skippedInCary = 0
  let skippedOutside = 0
  let skippedDuplicate = 0
  const dedupeSkips = []
  const caryNames = places.map((p) => ({
    id: p.id,
    centroid: p.centroid,
    names: new Set([p.name, ...(p.aliases ?? []), ...(aliasMap[p.id] ?? [])].map(normalize).filter(Boolean)),
  }))
  for (const f of wake.features) {
    const pt = f.geometry?.coordinates
    const name = f.properties?.NAME
    if (!pt || !normalize(name)) continue
    if (limitGeoms.some((g) => pointInGeometry(pt, g))) {
      skippedInCary++
      continue
    }
    if (classify(pt, scope) === 'outside') {
      skippedOutside++
      continue
    }
    // Same park listed by both sources: same normalized name (or a Cary alias) within 1 km of a Cary place.
    const twin = findCaryTwin(name, pt, caryNames)
    if (twin) {
      dedupeSkips.push({ name: String(name).trim(), caryId: twin.id, distanceM: Math.round(haversineM(twin.centroid, pt)) })
      continue
    }
    const key = `wake-parks:${normalize(name)}`
    if (seenKeys.has(key)) {
      skippedDuplicate++
      continue
    }
    seenKeys.add(key)
    wakeKeys.push({ key, prefix: 'wake-park', name })
    neighbours.push({ f, name: String(name).trim().replace(/\s+/g, ' '), pt })
  }
  let allIds = assignIds(ids, wakeKeys)
  const jurisdictionMismatches = []
  for (const n of neighbours) {
    const centroidPt = roundPos(n.pt, COORD_DECIMALS)
    const county = countyOf(centroidPt, counties) ?? 'Wake'
    const municipality = municipalityOf(centroidPt, towns, county)
    const jurRaw = String(n.f.properties.JURISDICTION ?? '').trim()
    const jur = stripJurisdiction(jurRaw)
    const agrees = jur === municipality || (/^wake(\s+county)?$/i.test(jur) && municipality === UNINCORPORATED_WAKE)
    if (!agrees) jurisdictionMismatches.push({ name: n.name, jurisdiction: jurRaw || '(none)', municipality })
    const place = {
      id: allIds[`wake-parks:${normalize(n.name)}`],
      name: n.name,
      aliases: [],
      category: 'park',
      municipality,
      county,
      coverage: classify(n.pt, scope),
      centroid: centroidPt,
      description: jurRaw
        ? `Park listed by Wake County, managed by ${jurRaw} (from Wake County's parks layer).`
        : `Park listed by Wake County (from Wake County's parks layer).`,
      sourceIds: ['wake-parks'],
    }
    const u = n.f.properties.URL
    if (typeof u === 'string' && u.startsWith('https://')) place.url = u
    places.push(place)
    visitCtx.set(place.id, { wake: n.f.properties })
    relItems.push({ id: place.id, kind: 'park', points: [place.centroid] })
  }

  // Wake County fire stations (decision 32): points inside the core or nearby area become `fire-station` places.
  // They are not relationship items (they never join the park/trail nearby rules); parks link to their nearest station
  // separately, through computeStationLinks.
  const fireStations = groupFireStations(fireData.features).filter((s) => classify(s.pt, scope) !== 'outside')
  allIds = assignIds(allIds, fireStations.map((s) => ({ key: `wake-fire-stations:${s.stationId.toLowerCase()}`, prefix: 'wake-fire', name: s.stationId })))
  for (const s of fireStations) {
    const pt = roundPos(s.pt, COORD_DECIMALS)
    const county = countyOf(pt, counties) ?? 'Wake'
    const place = {
      id: allIds[`wake-fire-stations:${s.stationId.toLowerCase()}`],
      name: s.name,
      aliases: [],
      category: 'fire-station',
      municipality: municipalityOf(pt, towns, county),
      county,
      coverage: classify(s.pt, scope),
      centroid: pt,
      description: fireStationDescription(s),
      sourceIds: ['wake-fire-stations'],
    }
    if (s.address) place.address = s.address
    if (s.stationNumber !== undefined) place.stationNumber = s.stationNumber
    if (s.agency) {
      place.department = s.agency
      if (FIRE_DEPARTMENT_URL[s.agency]) place.url = FIRE_DEPARTMENT_URL[s.agency]
    }
    places.push(place)
    visitCtx.set(place.id, { fire: { address: s.address } })
  }

  // Wake County greenways outside Cary: named systems become trail places, lines go to the greenways layer.
  const wakeGw = groupWakeGreenways(wakeGreenData.features)
  const trailCandidates = places.map((p) => ({
    id: p.id,
    centroid: p.centroid,
    names: new Set([p.name, ...(p.aliases ?? []), ...(aliasMap[p.id] ?? [])].map(normalize).filter(Boolean)),
  }))
  const regionalTrails = []
  const trailDedupeSkips = []
  for (const g of wakeGw.kept) {
    const { lines: clipped } = clipToLimit(g.lines, scope.crossing, scope.core)
    const lines = clipped.map((l) => simplifyLine(l, WAKE_GREENWAY_SIMPLIFY_M)).filter((l) => l.length >= 2)
    if (!lines.length || classifyLine(lines, scope) === 'outside') continue
    const hit = findTrailTwin(g.name, lines, trailCandidates)
    if (hit) {
      trailDedupeSkips.push({ name: g.name, twinId: hit.twin.id, distanceM: hit.distanceM })
      continue
    }
    regionalTrails.push({ g, lines })
  }
  allIds = assignIds(allIds, regionalTrails.map(({ g }) => ({ key: `wake-greenways:${g.key}`, prefix: 'wake-greenway', name: g.name })))
  for (const { g, lines } of regionalTrails) {
    const id = allIds[`wake-greenways:${g.key}`]
    const c = vertexNearestBboxCentre(lines.flat())
    const county = countyOf(c, counties)
    const miles = fmtNumber(g.miles)
    const owner = g.owners[0]
    places.push({
      id,
      name: g.name,
      aliases: [],
      category: 'trail',
      municipality: municipalityOf(c, towns, county),
      county,
      coverage: classifyLine(lines, scope),
      centroid: c,
      bbox: bboxOf(lines.flat()),
      description:
        `Greenway listed by Wake County${owner ? `, owned by ${owner}` : ''}, about ${miles} ${miles === '1' ? 'mile' : 'miles'} of existing trail` +
        `${g.surface ? `, mostly ${g.surface}` : ''} (from Wake County's greenways layer).`,
      sourceIds: ['wake-greenways'],
    })
    visitCtx.set(id, { wakeSegments: g.visitSegments })
    greenFeatures.push(...greenwayFeatures(id, lines, g.proposedLines.map((l) => simplifyLine(l, WAKE_GREENWAY_SIMPLIFY_M)), scope))
    relItems.push({ id, kind: 'trail', lines })
    trailMiles.set(id, g.miles)
  }

  // USGS WBD HUC-12 subwatersheds that touch the core or nearby area become Water places (docs/decisions.md, "Watersheds from USGS WBD").
  const wbd = { huc12: readJson(join(SRC, 'usgs', 'wbd-huc12', 'data.geojson')), huc8: readJson(join(SRC, 'usgs', 'wbd-huc8', 'data.geojson')), huc6: readJson(join(SRC, 'usgs', 'wbd-huc6', 'data.geojson')) }
  const wbdMeta = readJson(join(SRC, 'usgs', 'wbd-huc12', 'meta.json'))
  // Every place keeps a county (the catalog parser requires one), so a watershed needs some area inside Wake, Chatham or Durham; its pin
  // sits on the point of that area nearest the area-weighted centroid.
  const inCounties = (pt) => countyOf(pt, counties) !== undefined
  // Boundaries are simplified once (25 m) so the tests, the pins and the drawn layer all use the same shape.
  const inScopeWatersheds = mapWatersheds(wbd)
    .map((w) => ({ ...w, polygons: simplifyPolygons(w.polygons) }))
    .map(prepareWatershed).filter((w) => intersectsScope(w, scope.nearby))
  const watersheds = []
  const watershedPins = new Map()
  for (const w of inScopeWatersheds) {
    const pin = representativePoint(w, centroid(w.polygons), inCounties)
    if (!pin) continue
    watersheds.push(w)
    watershedPins.set(w.huc12, [round(pin[0]), round(pin[1])])
  }
  allIds = assignIds(allIds, watersheds.map((w) => ({ key: `usgs-wbd-huc12:${w.huc12}`, prefix: 'watershed', name: w.huc12 })))
  const idByHuc12 = new Map(watersheds.map((w) => [w.huc12, allIds[`usgs-wbd-huc12:${w.huc12}`]]))
  const waterFeatures = []
  for (const w of watersheds) {
    const id = idByHuc12.get(w.huc12)
    const c = watershedPins.get(w.huc12)
    const county = countyOf(c, counties)
    const coverage = intersectsScope(w, scope.core) ? 'core' : 'nearby'
    places.push({
      id,
      name: w.placeName,
      aliases: [],
      category: 'water',
      municipality: municipalityOf(c, towns, county),
      county,
      coverage,
      centroid: c,
      bbox: bboxOf(w.polygons.flat(2)),
      description: watershedDescription(w),
      sourceIds: ['usgs-wbd-huc12'],
    })
    waterFeatures.push({
      type: 'Feature',
      properties: { placeId: id, outsideCore: coverage !== 'core' },
      geometry: { type: 'MultiPolygon', coordinates: w.polygons },
    })
  }
  // Named USGS 3DHP stream channels become Water places too ("Creeks from USGS hydrography"): segments are grouped by GNIS name and
  // chained when end points are within 200 m, so two far-apart streams with one name stay separate. A creek needs about a mile in the
  // study area and a pin (the middle of its longest piece) inside Wake, Chatham or Durham; its lines go in the water layer.
  const streamsMeta = readJson(join(SRC, 'usgs', '3dhp-streams', 'meta.json'))
  const allCreeks = groupCreeks(readJson(join(SRC, 'usgs', '3dhp-streams', 'data.geojson')).features, scope)
  const creeks = []
  const creekStats = { grouped: allCreeks.length, tooShort: 0, noCountyArea: 0 }
  for (const c of allCreeks) {
    if (c.lengthM < CREEK_MIN_M) {
      creekStats.tooShort++
      continue
    }
    const lines = simplifyCreekLines(c.lines)
    const pin = lines.length ? creekPin(lines, inCounties) : null
    if (!pin) {
      creekStats.noCountyArea++
      continue
    }
    creeks.push({ ...c, lines, pin: [round(pin[0]), round(pin[1])] })
  }
  // Ids: "creek-<name>"; a second creek of the same name takes the GNIS id, then its first segment id, so ids never collide.
  const takenIds = new Set(Object.values(allIds))
  const creekEntries = creeks.map((c) => {
    c.key = `usgs-3dhp-creek:${c.gnisid ?? 'x'}:${c.ids[0]}`
    if (allIds[c.key] === undefined) {
      const pick = [c.name, `${c.name} ${c.gnisid}`, `${c.name} ${c.gnisid} ${c.ids[0]}`].find((n) => !takenIds.has(`creek-${slug(n)}`))
      allIds[c.key] = `creek-${slug(pick)}`
    }
    takenIds.add(allIds[c.key])
    return { key: c.key, prefix: 'creek', name: c.name }
  })
  allIds = assignIds(allIds, creekEntries)
  for (const c of creeks) {
    c.id = allIds[c.key]
    const county = countyOf(c.pin, counties)
    const coverage = classifyLine(c.lines, scope)
    places.push({
      id: c.id,
      name: c.name,
      aliases: [],
      category: 'water',
      municipality: municipalityOf(c.pin, towns, county),
      county,
      coverage,
      centroid: c.pin,
      bbox: bboxOf(c.lines.flat()),
      description: creekDescription(c.name, c.lengthM),
      sourceIds: ['usgs-3dhp-streams'],
    })
    waterFeatures.push({
      type: 'Feature',
      properties: { placeId: c.id, outsideCore: coverage !== 'core' },
      geometry: { type: 'MultiLineString', coordinates: c.lines },
    })
  }
  const centroidOf = new Map(places.map((p) => [p.id, p.centroid]))
  const watershedLinks = watershedRelationships(
    [...relItems, ...creeks.map((c) => ({ id: c.id, kind: 'creek', lines: c.lines }))]
      .filter((r) => centroidOf.has(r.id))
      .map((r) => ({ ...r, centroid: centroidOf.get(r.id) })),
    watersheds,
    idByHuc12,
  )
  const creekLinks = creekRelationships(creeks, relItems)

  for (const p of places) {
    const extra = aliasMap[p.id]
    if (extra) p.aliases = [...new Set([...p.aliases, ...extra])]
  }
  const known = new Set(places.map((p) => p.id))
  const unknownAliases = Object.keys(aliasMap).filter((id) => !known.has(id))
  if (unknownAliases.length) console.warn(`aliases.json has unknown ids: ${unknownAliases.join(', ')}`)

  places.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const byPlace = (a, b) =>
    a.properties.placeId < b.properties.placeId
      ? -1
      : a.properties.placeId > b.properties.placeId
        ? 1
        : Number(a.properties.outsideCore) - Number(b.properties.outsideCore)
  parkFeatures.sort(byPlace)
  waterFeatures.sort(byPlace)
  greenFeatures.sort(byPlace)

  const registry = readJson(join(ROOT, 'pipeline', 'sources.config.json'))
  const title = (id) => registryTitle(registry, id)
  const sources = [
    {
      id: 'cary-parks',
      title: title('cary-parks'),
      name: 'Town of Cary',
      url: parksMeta.url,
      license: 'CC0 1.0',
      retrievedAt: parksMeta.retrievedAt,
    },
    {
      id: 'cary-greenways',
      title: title('cary-greenways'),
      name: 'Town of Cary',
      url: greenMeta.url,
      license: 'CC0 1.0',
      retrievedAt: greenMeta.retrievedAt,
    },
  ]
  if (neighbours.length) {
    sources.push({
      id: 'wake-parks',
      title: title('wake-parks'),
      name: 'Wake County',
      url: 'https://services1.arcgis.com/a7CWfuGP5ZnLYE7I/arcgis/rest/services/Wake_Parks_Public/FeatureServer/0',
      license: 'CC BY 4.0',
      retrievedAt: wakeMeta.retrievedAt,
    })
  }

  if (fireStations.length) {
    sources.push({
      id: 'wake-fire-stations',
      title: title('wake-fire-stations'),
      name: 'Wake County',
      url: fireMeta.url,
      license: 'CC BY 4.0',
      retrievedAt: fireMeta.retrievedAt,
    })
  }

  if (regionalTrails.length) {
    sources.push({
      id: 'wake-greenways',
      title: title('wake-greenways'),
      name: 'Wake County',
      url: wakeGreenMeta.url,
      license: 'CC BY 4.0',
      retrievedAt: wakeGreenMeta.retrievedAt,
    })
  }

  if (creeks.length) {
    sources.push({
      id: 'usgs-3dhp-streams',
      title: title('usgs-3dhp-streams'),
      name: 'US Geological Survey',
      url: streamsMeta.url,
      license: 'Public domain (USGS)',
      retrievedAt: streamsMeta.retrievedAt,
    })
  }

  if (watersheds.length) {
    sources.push({
      id: 'usgs-wbd-huc12',
      title: title('usgs-wbd-huc12'),
      name: 'US Geological Survey',
      url: wbdMeta.url,
      license: 'Public domain (USGS)',
      retrievedAt: wbdMeta.retrievedAt,
    })
  }

  const placeIds = new Set(places.map((p) => p.id))
  const details = buildDetails(places, visitCtx, entrancesData.features, aliasMap, {
    wake: verifiedDate(wakeMeta),
    entrances: verifiedDate(entrancesMeta),
    caryFeatures: verifiedDate(featuresMeta),
    greenways: verifiedDate(greenMeta),
    wakeGreenways: verifiedDate(wakeGreenMeta),
    fire: verifiedDate(fireMeta),
  })
  const usedSources = new Set(Object.values(details).flatMap((d) => d.fields.map((f) => f.sourceId)))
  if (usedSources.has('wake-park-entrances')) {
    sources.push({
      id: 'wake-park-entrances',
      title: title('wake-park-entrances'),
      name: 'Wake County',
      url: entrancesMeta.url,
      license: 'CC BY 4.0',
      retrievedAt: entrancesMeta.retrievedAt,
    })
  }
  if (usedSources.has('cary-park-features')) {
    sources.push({
      id: 'cary-park-features',
      title: title('cary-park-features'),
      name: 'Town of Cary',
      url: featuresMeta.url,
      license: 'CC0 1.0',
      retrievedAt: featuresMeta.retrievedAt,
    })
  }
  const relationships = computeRelationships(relItems.filter((r) => placeIds.has(r.id)))
  const parkIds = new Set(places.filter((p) => p.category === 'park').map((p) => p.id))
  const stationLinks = computeStationLinks(
    relItems.filter((r) => r.kind === 'park' && parkIds.has(r.id)),
    places.filter((p) => p.category === 'fire-station').map((p) => ({ id: p.id, point: p.centroid })),
  )
  relationships.relationships.push(...watershedLinks.relationships, ...creekLinks, ...stationLinks)
  relationships.relationships.sort((x, y) => cmp(x.from, y.from) || cmp(x.to, y.to) || cmp(x.kind, y.kind))
  for (const p of places) {
    const amenities = amenitiesOf(details[p.id].fields)
    if (amenities.length) p.amenities = amenities
  }
  const catalog = { sources, places: places.map(orderPlace) }
  const layer = (features, decimals) =>
    ({
      type: 'FeatureCollection',
      features: features.map((f) => ({ ...f, geometry: roundGeometry(f.geometry, decimals) })),
    })

  const outputs = {
    'catalog.json': JSON.stringify(catalog, null, 1) + '\n',
    'layers/parks.geojson': JSON.stringify(layer(parkFeatures, COORD_DECIMALS)) + '\n',
    'layers/greenways.geojson': JSON.stringify(layer(greenFeatures, COORD_DECIMALS)) + '\n',
    'layers/water.geojson': JSON.stringify(layer(waterFeatures, WATER_COORD_DECIMALS)) + '\n',
    'relationships.json': JSON.stringify(relationships, null, 1) + '\n',
    'collections.json': JSON.stringify(buildCollections(catalog.places, details, { trailMiles }), null, 1) + '\n',
  }
  for (const [id, d] of Object.entries(details)) outputs[`places/${id}.json`] = JSON.stringify(d) + '\n'

  if (write) {
    mkdirSync(join(outDir, 'layers'), { recursive: true })
    rmSync(join(outDir, 'places'), { recursive: true, force: true })
    mkdirSync(join(outDir, 'places'), { recursive: true })
    for (const [file, text] of Object.entries(outputs)) writeFileSync(join(outDir, file), text)
    // ids.json is repo state, so only the default build touches it.
    if (outDir === OUT) writeFileSync(idsPath, JSON.stringify(allIds, null, 2) + '\n')
  }

  return {
    catalog,
    relationships,
    outputs,
    details,
    parks,
    kept,
    dropped,
    neighbours: neighbours.length,
    skipped: { inCary: skippedInCary, outside: skippedOutside, duplicate: skippedDuplicate },
    dedupeSkips,
    trailDedupeSkips,
    wakeGreenways: { kept: wakeGw.kept, dropped: wakeGw.dropped, skipped: wakeGw.skipped, imported: regionalTrails.length },
    jurisdictionMismatches,
    ids: allIds,
    creeks: { places: creeks, stats: creekStats, links: creekLinks },
    watersheds: { inScope: watersheds, noCountyArea: inScopeWatersheds.length - watersheds.length, notDetermined: watershedLinks.notDetermined, links: watershedLinks.relationships },
  }
}

export const ENTRANCE_NAME_MAX_M = 5000

/**
 * Join entrances to a place: entrance point inside a Cary park's parcels, or the entrance's park NAME equals the
 * place name (or an alias) and the point is within 5 km of the place centroid (guards same-named parks elsewhere).
 */
export function joinEntrances(place, ctx, entrances, aliasNames = [], otherNames = new Set()) {
  const names = new Set([place.name, ...(place.aliases ?? []), ...aliasNames].map(normalize).filter(Boolean))
  return entrances.filter((e) => {
    const pt = e.geometry?.coordinates
    if (!pt) return false
    const en = [e.properties?.NAME, e.properties?.ALIAS1, e.properties?.ALIAS2].map(normalize).filter(Boolean)
    if (en.some((n) => names.has(n))) return haversineM(place.centroid, pt) <= ENTRANCE_NAME_MAX_M
    // Inside the parcels but named for a different catalog place (an adjacent park): not this park's entrance.
    if (en.some((n) => otherNames.has(n))) return false
    return Boolean(ctx?.polygons?.some((poly) => pointInPolygon(pt, poly)))
  })
}

/** { [placeId]: { id, fields } } - one detail record per place. */
export function buildDetails(places, visitCtx, entrances, aliasMap, dates) {
  const out = {}
  const owners = new Map() // normalized name -> ids of the places that carry it
  for (const place of places) {
    for (const n of [place.name, ...(place.aliases ?? []), ...(aliasMap[place.id] ?? [])].map(normalize).filter(Boolean)) {
      if (!owners.has(n)) owners.set(n, new Set())
      owners.get(n).add(place.id)
    }
  }
  for (const place of places) {
    const ctx = visitCtx.get(place.id) ?? {}
    const otherNames = new Set([...owners].filter(([, ids]) => [...ids].some((id) => id !== place.id)).map(([n]) => n))
    const joined = joinEntrances(place, ctx, entrances, aliasMap[place.id] ?? [], otherNames).map((e) => e.properties ?? {})
    out[place.id] = { id: place.id, fields: buildVisitFields({ ...ctx, entrances: joined, dates }) }
  }
  return out
}

function orderPlace(p) {
  const out = {}
  for (const k of ['id', 'name', 'aliases', 'category', 'municipality', 'county', 'coverage', 'centroid', 'bbox', 'description', 'address', 'stationNumber', 'department', 'url', 'sourceIds', 'amenities']) {
    if (p[k] !== undefined) out[k] = p[k]
  }
  return out
}

function main() {
  const i = process.argv.indexOf('--out')
  if (i !== -1 && !process.argv[i + 1]) throw new Error('--out needs a directory')
  const r = build({ outDir: i === -1 ? OUT : resolve(process.argv[i + 1]) })
  const tally = (key) => {
    const t = {}
    for (const p of r.catalog.places) t[p[key] ?? 'unknown'] = (t[p[key] ?? 'unknown'] ?? 0) + 1
    return t
  }
  const dropByMiles = [...r.dropped].sort((a, b) => b.miles - a.miles).slice(0, 10)
  console.log(`places: ${r.catalog.places.length}`)
  console.log('by category:', tally('category'))
  console.log('by county:', tally('county'))
  console.log('by coverage:', tally('coverage'))
  const kinds = {}
  for (const x of r.relationships.relationships) kinds[x.kind] = (kinds[x.kind] ?? 0) + 1
  console.log('relationships:', kinds)
  const rl = r.relationships.relationships
  const linkedIds = new Set(rl.flatMap((x) => [x.from, x.to]))
  const none = r.catalog.places.filter((p) => !linkedIds.has(p.id))
  console.log(`places with >=1 link: ${r.catalog.places.length - none.length}/${r.catalog.places.length} (${(((r.catalog.places.length - none.length) / r.catalog.places.length) * 100).toFixed(1)}%), none: ${none.length}`)
  console.log(`nearest-fallback links: ${rl.filter((x) => x.basis === 'nearest').length}`)
  for (const d of r.dedupeSkips) console.log(`dedupe skip: Wake "${d.name}" == ${d.caryId} (${d.distanceM} m)`)
  for (const d of r.trailDedupeSkips) console.log(`dedupe skip: Wake greenway "${d.name}" == ${d.twinId} (${d.distanceM} m)`)
  console.log(`watersheds in scope: ${r.watersheds.inScope.length} (${r.watersheds.noCountyArea} skipped: no area in the three counties); watershed links ${r.watersheds.links.length}; parks/trails not determined ${r.watersheds.notDetermined.length}`)
  console.log(`creeks: ${r.creeks.places.length} places (${r.creeks.stats.grouped} grouped, ${r.creeks.stats.tooShort} under a mile dropped, ${r.creeks.stats.noCountyArea} with no county area); creek links ${r.creeks.links.length} (${r.creeks.links.filter((x) => x.basis === 'along').length} along, ${r.creeks.links.filter((x) => x.kind === 'contained').length} in parks)`)
  console.log(`wake greenways imported ${r.wakeGreenways.imported}, kept groups ${r.wakeGreenways.kept.length}, dropped ${r.wakeGreenways.dropped.length}; skipped segments`, r.wakeGreenways.skipped)
  console.log(`greenways kept ${r.kept.length}, dropped ${r.dropped.length}; neighbours ${r.neighbours}; skipped`, r.skipped)
  console.log('by municipality:', tally('municipality'))
  console.log(`JURISDICTION mismatches: ${r.jurisdictionMismatches.length}`)
  for (const m of r.jurisdictionMismatches.slice(0, 10)) console.log(`  ${m.name}: ${m.jurisdiction} vs ${m.municipality}`)
  console.log('10 longest dropped greenways:')
  for (const g of dropByMiles) console.log(`  ${g.name} (${g.miles.toFixed(2)} mi)`)
  let placesBytes = 0
  for (const [file, text] of Object.entries(r.outputs)) {
    if (file.startsWith('places/')) placesBytes += Buffer.byteLength(text)
    else console.log(`${file}: ${Buffer.byteLength(text)} bytes`)
  }
  console.log(`places/*.json: ${Object.keys(r.details).length} files, ${placesBytes} bytes`)
  const knownBy = {}
  for (const d of Object.values(r.details)) for (const f of d.fields) if (f.status === 'known') knownBy[f.key] = (knownBy[f.key] ?? 0) + 1
  console.log('visit fields known:', knownBy)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
