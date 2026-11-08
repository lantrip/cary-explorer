#!/usr/bin/env node
// Snapshot eBird hotspots for the Cary area (eBird API 2.0) into pipeline/sources/ebird/.
// Usage: node pipeline/scripts/snapshot-ebird.mjs   (node >= 22, no dependencies)
// Needs EBIRD_API_KEY in the environment or in .env at the repo root (KEY=VALUE, parsed here).
// The key is sent only in the x-ebirdapitoken header and is never printed or written.
// Writes: hotspots.geojson (minimal fields + inCaryLimits), meta.json (provenance, counts, attribution, terms).
// Output is git-ignored (see .gitignore) until the owner confirms the API terms (issue #5).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const OUT = join(REPO, 'pipeline', 'sources', 'ebird')
const BOUNDARY = join(REPO, 'pipeline', 'sources', 'boundaries', 'cary-corporate-limits.geojson')

const API = 'https://api.ebird.org/v2'
// Wake, Chatham, Durham: Cary spans all three.
const REGIONS = ['US-NC-183', 'US-NC-037', 'US-NC-063']
const PAUSE_MS = 1000
const RETRY_MS = 2000
const ATTRIBUTION = 'Data: eBird.org (Cornell Lab of Ornithology)'
const TERMS = 'non-commercial; not for public redistribution until the owner confirms the API terms (issue #5)'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Minimal KEY=VALUE parse of .env. Only EBIRD_API_KEY is read; values are never logged.
async function readEbirdKey() {
  if (process.env.EBIRD_API_KEY) return process.env.EBIRD_API_KEY.trim()
  let text = ''
  try {
    text = await readFile(join(REPO, '.env'), 'utf8')
  } catch {
    // no .env file; handled below
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?EBIRD_API_KEY\s*=\s*(.*?)\s*$/)
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2').trim()
  }
  return ''
}

// Point-in-polygon, plain ray casting in lon/lat. A ring is [[lng, lat], ...]; ring 0 is the outer ring, the rest are holes.
function inRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  throw new Error(`unsupported boundary geometry: ${geometry.type}`)
}

async function loadBoundary() {
  const geo = JSON.parse(await readFile(BOUNDARY, 'utf8'))
  const polys = geo.features.flatMap((f) => polygonsOf(f.geometry))
  return polys.map((rings) => {
    const outer = rings[0]
    const lngs = outer.map((p) => p[0])
    const lats = outer.map((p) => p[1])
    return { rings, bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] }
  })
}

function inCaryLimits(lng, lat, polys) {
  return polys.some(({ rings, bbox }) => {
    if (lng < bbox[0] || lat < bbox[1] || lng > bbox[2] || lat > bbox[3]) return false
    if (!inRing(lng, lat, rings[0])) return false
    return !rings.slice(1).some((hole) => inRing(lng, lat, hole))
  })
}

// One GET per region. Retries once on 5xx. The key goes in the header only, never in the URL.
async function fetchRegion(region, key) {
  const url = `${API}/ref/hotspot/${region}?fmt=json`
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, {
      headers: { 'x-ebirdapitoken': key, accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (res.ok) {
      const data = await res.json()
      if (!Array.isArray(data)) throw new Error(`${region}: unexpected response shape`)
      return data
    }
    if (res.status >= 500 && attempt === 1) {
      console.log(`${region}: HTTP ${res.status}, retrying once`)
      await sleep(RETRY_MS)
      continue
    }
    throw new Error(`${region}: HTTP ${res.status}`)
  }
  throw new Error(`${region}: no response`)
}

const key = await readEbirdKey()
if (!key) {
  console.error('EBIRD_API_KEY is not set. Add it to .env at the repo root (see pipeline/sources/ebird/README.md).')
  process.exit(1)
}

const boundary = await loadBoundary()

// Fetch everything before writing anything, so a failed run leaves the last good files in place.
const countsByRegion = {}
const byLocId = new Map()
for (const [i, region] of REGIONS.entries()) {
  if (i > 0) await sleep(PAUSE_MS)
  const raw = await fetchRegion(region, key)
  countsByRegion[region] = raw.length
  for (const h of raw) {
    if (typeof h.locId !== 'string' || typeof h.lat !== 'number' || typeof h.lng !== 'number') continue
    if (byLocId.has(h.locId)) continue
    byLocId.set(h.locId, {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: {
        locId: h.locId,
        locName: h.locName,
        lat: h.lat,
        lng: h.lng,
        subnational2Code: h.subnational2Code,
        ebirdUrl: `https://ebird.org/hotspot/${h.locId}`,
        inCaryLimits: inCaryLimits(h.lng, h.lat, boundary),
      },
    })
  }
  console.log(`${region}: ${raw.length} hotspots returned`)
}

const features = [...byLocId.values()]
const inCaryCount = features.filter((f) => f.properties.inCaryLimits).length
const retrievedAt = new Date().toISOString()

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'hotspots.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n')
const meta = {
  source: 'eBird API 2.0',
  endpoint: `${API}/ref/hotspot/{region}?fmt=json`,
  regions: REGIONS,
  retrievedAt,
  countsByRegion,
  inCaryCount,
  attribution: ATTRIBUTION,
  terms: TERMS,
}
await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
console.log(`wrote ${features.length} unique hotspots (${inCaryCount} inside Cary limits) to pipeline/sources/ebird/`)
