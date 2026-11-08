// ArcGIS REST adapter (FeatureServer / MapServer layer). Dependency-free; `fetch` is injected for tests.
// Returns { features, expectedCount, sourceModified, idField }. Properties are NOT filtered here (core does that).

const CHUNK_IDS = 200

import { getJson as getRaw, isoFromEpoch } from './http.mjs'

const getJson = (fetchFn, url) => getRaw(fetchFn, url, { arcgis: true })

function qs(params) {
  return new URLSearchParams(params).toString()
}

export async function fetchArcgis(source, { fetch: fetchFn = globalThis.fetch } = {}) {
  const where = typeof source.where === 'string' && source.where.trim() ? source.where : '1=1'
  const base = source.url.replace(/\/+$/, '')
  // Optional spatial filter: [west, south, east, north] in WGS84; features intersecting the box are returned whole.
  const spatial = Array.isArray(source.bbox) && source.bbox.length === 4
    ? { geometry: source.bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }
    : {}
  const info = await getJson(fetchFn, `${base}?f=json`)
  const idField = info.objectIdField || 'OBJECTID'
  const pageSize = Math.max(1, Math.min(Number(info.maxRecordCount) || 1000, 2000))
  const edited = info.editingInfo?.dataLastEditDate ?? info.editingInfo?.lastEditDate
  const sourceModified = isoFromEpoch(edited)

  const count = await getJson(fetchFn, `${base}/query?${qs({ where, ...spatial, returnCountOnly: 'true', f: 'json' })}`)
  const expectedCount = count.count
  if (!Number.isInteger(expectedCount)) throw new Error(`no count returned for ${base}`)

  const outFields = [...new Set([...(source.fields ?? []), idField])].join(',')
  // Optional: `geometry: false` fetches attributes only (name lookups); `geometryPrecision` rounds output coordinates (decimal places).
  const shape = {
    ...(source.geometry === false ? { returnGeometry: 'false' } : {}),
    ...(Number.isInteger(source.geometryPrecision) ? { geometryPrecision: String(source.geometryPrecision) } : {}),
  }
  const common = { outSR: '4326', f: 'geojson', outFields, ...spatial, ...shape }
  const features = []

  if (info.advancedQueryCapabilities?.supportsPagination !== false) {
    for (let offset = 0; offset < expectedCount; offset += pageSize) {
      const page = await getJson(
        fetchFn,
        `${base}/query?${qs({ where, ...common, orderByFields: idField, resultOffset: String(offset), resultRecordCount: String(pageSize) })}`,
      )
      const got = page.features ?? []
      if (got.length === 0) break
      features.push(...got)
    }
  } else {
    const ids = (await getJson(fetchFn, `${base}/query?${qs({ where, ...spatial, returnIdsOnly: 'true', f: 'json' })}`)).objectIds ?? []
    ids.sort((a, b) => a - b)
    for (let i = 0; i < ids.length; i += CHUNK_IDS) {
      const page = await getJson(
        fetchFn,
        `${base}/query?${qs({ ...common, objectIds: ids.slice(i, i + CHUNK_IDS).join(',') })}`,
      )
      features.push(...(page.features ?? []))
    }
  }
  return { features, expectedCount, sourceModified, idField }
}
