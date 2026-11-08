// Registry validation + per-source snapshot + run-all. Dependency-free; `fetch` injectable.
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fetchArcgis } from './fetch-arcgis.mjs'
import { fetchHub } from './fetch-hub.mjs'
import { fetchOds } from './fetch-ods.mjs'

const TYPES = new Set(['ods', 'arcgis', 'arcgis-hub'])
const LICENCE_STATUS = new Set(['open', 'restricted', 'unclear'])
const CADENCE = new Set(['weekly', 'monthly'])
const REQUIRED = ['id', 'publisher', 'title', 'type', 'url', 'licence', 'licenceStatus', 'attribution', 'cadence', 'fields', 'dir', 'enabled']

/** Returns a list of problems (empty when valid). Enabled sources must have licenceStatus "open". */
export function validateRegistry(sources) {
  const errors = []
  if (!Array.isArray(sources)) return ['registry must be an array']
  const ids = new Set()
  const dirs = new Set()
  sources.forEach((s, i) => {
    const where = `source[${i}]${s?.id ? ` (${s.id})` : ''}`
    for (const k of REQUIRED) if (s?.[k] === undefined) errors.push(`${where}: missing ${k}`)
    if (!s) return
    if (!TYPES.has(s.type)) errors.push(`${where}: bad type ${s.type}`)
    if (!LICENCE_STATUS.has(s.licenceStatus)) errors.push(`${where}: bad licenceStatus ${s.licenceStatus}`)
    if (!CADENCE.has(s.cadence)) errors.push(`${where}: bad cadence ${s.cadence}`)
    if (s.where !== undefined && (typeof s.where !== 'string' || !s.where.trim())) errors.push(`${where}: where must be a non-empty string`)
    if (s.bbox !== undefined && !(Array.isArray(s.bbox) && s.bbox.length === 4 && s.bbox.every((n) => Number.isFinite(n)) && s.bbox[0] < s.bbox[2] && s.bbox[1] < s.bbox[3])) errors.push(`${where}: bbox must be [west, south, east, north]`)
    if (s.type === 'arcgis-hub' && !/^[0-9a-f]{32}$/.test(String(s.hubItemId ?? ''))) errors.push(`${where}: arcgis-hub needs hubItemId (32 hex)`)
    if (!Array.isArray(s.fields)) errors.push(`${where}: fields must be an array`)
    if (typeof s.enabled !== 'boolean') errors.push(`${where}: enabled must be boolean`)
    if (s.enabled && s.licenceStatus !== 'open') errors.push(`${where}: enabled source must have licenceStatus "open" (is "${s.licenceStatus}")`)
    if (typeof s.dir === 'string' && (s.dir.startsWith('/') || s.dir.split('/').includes('..'))) errors.push(`${where}: dir must be relative`)
    if (ids.has(s.id)) errors.push(`${where}: duplicate id`)
    if (dirs.has(s.dir)) errors.push(`${where}: duplicate dir`)
    ids.add(s.id)
    dirs.add(s.dir)
  })
  return errors
}

/** Keep only allowlisted properties (those present on the feature). */
export function applyAllowlist(feature, fields) {
  const props = feature.properties ?? {}
  return {
    type: 'Feature',
    properties: Object.fromEntries(fields.filter((k) => k in props).map((k) => [k, props[k]])),
    geometry: feature.geometry,
  }
}

function sortKey(v) {
  return typeof v === 'number' ? [0, v, ''] : [1, 0, String(v ?? '')]
}

/** Stable sort by id (number or string); features without an id keep their relative order at the end. */
export function sortById(items) {
  return items
    .map((it, i) => ({ it, i, k: it.id === undefined || it.id === null ? [2, 0, ''] : sortKey(it.id) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || (a.k[2] < b.k[2] ? -1 : a.k[2] > b.k[2] ? 1 : 0) || a.i - b.i)
    .map((x) => x.it)
}

async function writeAtomic(path, text, tag) {
  const tmp = `${path}.${tag}.tmp`
  await writeFile(tmp, text)
  return { tmp, path }
}

/** Fetch one source, check the count, and only then replace data.geojson / meta.json. Throws on failure. */
export async function snapshotSource(source, { fetch: fetchFn = globalThis.fetch, outRoot, now = () => new Date() } = {}) {
  const adapter = source.type === 'arcgis' ? fetchArcgis : source.type === 'arcgis-hub' ? fetchHub : fetchOds
  const raw = await adapter(source, { fetch: fetchFn })
  const retrievedAt = now().toISOString()
  if (raw.features.length !== raw.expectedCount) {
    throw new Error(`${source.id}: fetched ${raw.features.length} features, expected ${raw.expectedCount}`)
  }
  const idField = raw.idField
  // Sources without an id field (opendatasoft exports come back in arbitrary order) sort by their canonical JSON.
  let items = raw.features.map((f) => ({ id: idField ? (f.properties?.[idField] ?? f.id) : JSON.stringify(applyAllowlist(f, source.fields)), f }))
  items = sortById(items)
  const features = items.map(({ f }) => applyAllowlist(f, source.fields))
  const meta = {
    sourceId: source.id,
    url: source.url,
    licence: source.licence,
    licenceStatus: source.licenceStatus,
    attribution: source.attribution,
    retrievedAt,
    sourceModified: raw.sourceModified ?? null,
    recordCount: features.length,
    expectedCount: raw.expectedCount,
    fields: source.fields,
  }
  const dir = join(outRoot, source.dir)
  await mkdir(dir, { recursive: true })
  const pending = [
    await writeAtomic(join(dir, 'data.geojson'), JSON.stringify({ type: 'FeatureCollection', features }) + '\n', 'new'),
    await writeAtomic(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'new'),
  ]
  if (raw.catalog) pending.push(await writeAtomic(join(dir, 'metadata.json'), JSON.stringify(raw.catalog, null, 2) + '\n', 'new'))
  try {
    for (const p of pending) await rename(p.tmp, p.path)
  } catch (e) {
    await Promise.all(pending.map((p) => rm(p.tmp, { force: true })))
    throw e
  }
  return meta
}

/** Snapshot all enabled sources (or one via `only`). Writes lastRunPath. Returns { ok, results }. */
export async function runSnapshots({ sources, only, fetch: fetchFn = globalThis.fetch, outRoot, lastRunPath, now = () => new Date(), log = () => {} }) {
  const problems = validateRegistry(sources)
  if (problems.length) throw new Error(`invalid registry:\n  ${problems.join('\n  ')}`)
  const startedAt = now().toISOString()
  let chosen = sources.filter((s) => s.enabled)
  if (only) {
    chosen = []
    for (const id of String(only).split(',').filter(Boolean)) {
      const hit = sources.find((s) => s.id === id)
      if (!hit) throw new Error(`unknown source id: ${id}`)
      if (!hit.enabled) throw new Error(`source ${id} is disabled (licenceStatus: ${hit.licenceStatus})`)
      chosen.push(hit)
    }
  }
  const results = []
  for (const s of chosen) {
    try {
      const meta = await snapshotSource(s, { fetch: fetchFn, outRoot, now })
      results.push({ id: s.id, ok: true, recordCount: meta.recordCount, expectedCount: meta.expectedCount, error: null })
      log(`${s.id}: ${meta.recordCount}/${meta.expectedCount} OK`)
    } catch (e) {
      results.push({ id: s.id, ok: false, recordCount: null, expectedCount: null, error: e instanceof Error ? e.message : String(e) })
      log(`${s.id}: FAILED ${results.at(-1).error}`)
    }
  }
  if (lastRunPath) {
    await mkdir(dirname(lastRunPath), { recursive: true })
    await writeFile(lastRunPath, JSON.stringify({ startedAt, sources: results }, null, 2) + '\n')
  }
  return { ok: results.every((r) => r.ok), results }
}

export async function loadRegistry(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}
