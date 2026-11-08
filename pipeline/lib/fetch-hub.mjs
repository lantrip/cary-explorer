// ArcGIS Hub open-data download adapter, for layers whose own REST host is unreachable from our network
// (Wake Greenways is on maps.wake.gov, which times out) but whose Hub item is public. Dependency-free; `fetch` and
// `sleep` are injected for tests. Returns the same shape as fetch-arcgis.mjs.
//
// Source fields used: `hubItemId` (32 hex), `hubLayer` (default 0), `licence` (must equal the licence the Hub
// dataset states, so a licence change at the publisher fails the run instead of slipping through) and `where`
// (default "OBJECTID>0").
//
// Why a `where`: the plain download URL serves a cached export that can be a year old (Wake Greenways: 1,033
// cached features against 1,299 live). Any non-default `where` makes the Hub build a fresh export from the live
// service, and the count check in snapshot-core then compares that export against the dataset's record count.

import { roundCoords } from './geo.mjs'
import { getJson, isoFromEpoch } from './http.mjs'

const HUB = 'https://hub.arcgis.com'
const POLL_MS = 5000
const MAX_POLLS = 60

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


const sameLicence = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

export async function fetchHub(source, { fetch: fetchFn = globalThis.fetch, sleep = defaultSleep } = {}) {
  const item = source.hubItemId
  if (!/^[0-9a-f]{32}$/.test(String(item ?? ''))) throw new Error(`${source.id}: hubItemId must be a 32-character hex item id`)
  const layer = Number.isInteger(source.hubLayer) ? source.hubLayer : 0
  const where = typeof source.where === 'string' && source.where.trim() ? source.where : 'OBJECTID>0'

  const meta = (await getJson(fetchFn, `${HUB}/api/v3/datasets/${item}_${layer}`))?.data?.attributes
  if (!meta) throw new Error(`${source.id}: no Hub dataset metadata for ${item}_${layer}`)
  if (!sameLicence(meta.license, source.licence)) {
    throw new Error(`${source.id}: Hub dataset licence is "${meta.license ?? 'none'}", registry says "${source.licence}"`)
  }
  const expectedCount = meta.recordCount
  if (!Number.isInteger(expectedCount)) throw new Error(`${source.id}: Hub dataset has no record count`)
  const edited = meta.itemModified ?? meta.modified
  const sourceModified = isoFromEpoch(edited)

  const request = `${HUB}/api/download/v1/items/${item}/geojson?${new URLSearchParams({ redirect: 'false', layers: String(layer), where })}`
  let resultUrl
  for (let i = 0; i < MAX_POLLS && !resultUrl; i++) {
    const job = await getJson(fetchFn, request)
    if (job.status === 'Completed' && job.resultUrl) resultUrl = job.resultUrl
    else if (job.status === 'Failed' || job.status === 'Error') throw new Error(`${source.id}: Hub export failed: ${job.message ?? job.status}`)
    else await sleep(POLL_MS)
  }
  if (!resultUrl) throw new Error(`${source.id}: Hub export not ready after ${MAX_POLLS} polls`)
  const url = new URL(resultUrl)
  if (url.origin !== HUB) throw new Error(`${source.id}: unexpected export host ${url.origin}`)

  const fc = await getJson(fetchFn, url.href)
  // The export carries 15 decimals (sub-nanometre). Six is about 0.1 m, the same precision the layers ship at.
  const features = (fc.features ?? []).map((f) => (f.geometry ? { ...f, geometry: { ...f.geometry, coordinates: roundCoords(f.geometry.coordinates) } } : f))
  return { features, expectedCount, sourceModified, idField: 'OBJECTID' }
}
