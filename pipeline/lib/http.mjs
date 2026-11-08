// Shared helpers for the source adapters. `fetch` is always injected so tests never touch the network.

/** GET a URL and parse JSON. `arcgis: true` also fails on ArcGIS' in-body `{ error }` responses (HTTP 200). */
export async function getJson(fetchFn, url, { arcgis = false } = {}) {
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const json = await res.json()
  if (arcgis && json && json.error) throw new Error(`ArcGIS error ${json.error.code ?? ''} ${json.error.message ?? ''} for ${url}`)
  return json
}

/** Epoch milliseconds -> ISO string; null for anything that is not a number. */
export function isoFromEpoch(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null
}
