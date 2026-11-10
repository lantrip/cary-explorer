// Source freshness. Pure functions; the clock is always an argument so publish stays deterministic.
// Table (days): weekly = 7 + 3 margin, monthly = 31 + 7 margin. A source is "stale" once now passes lastSuccess + cadence + margin.
// "due" means the cadence has passed but the margin has not (a refresh is expected but not yet late).
const DAY_MS = 86_400_000

export const CADENCE_DAYS = { weekly: 7, monthly: 31 }
export const MARGIN_DAYS = { weekly: 3, monthly: 7 }

// Catalog source id -> registry id, where they differ. Duplicated from REGISTRY_ID in build-catalog.mjs (owned elsewhere); keep in step.
export const REGISTRY_ID = {
  'cary-parks': 'parks-and-recreation-feature-polygons',
  'cary-greenways': 'proposed-greenway-trails',
  'cary-park-features': 'parks-and-recreation-feature-map',
}

/** The registry entry for a catalog source id, or undefined. */
export function registryEntry(registry, catalogId) {
  const id = REGISTRY_ID[catalogId] ?? catalogId
  return registry.find((r) => r.id === id)
}

/** Margin in days for a cadence length (7 -> 3, anything longer -> 7). */
export const marginForDays = (cadenceDays) => (cadenceDays <= CADENCE_DAYS.weekly ? MARGIN_DAYS.weekly : MARGIN_DAYS.monthly)

/** { cadence, cadenceDays } for a registry entry, or {} when the cadence is unknown. */
export function cadenceFields(entry) {
  const days = CADENCE_DAYS[entry?.cadence]
  return days ? { cadence: entry.cadence, cadenceDays: days } : {}
}

/**
 * Freshness of one manifest source at `now` (Date or ms). Returns
 * { ageDays, expectedBy (ISO) | null, status: 'fresh' | 'due' | 'stale' | 'unknown', stale: boolean }.
 * Sources without lastSuccess or cadenceDays (older manifests) are 'unknown' and never stale.
 */
export function sourceHealth(source, now) {
  const last = Date.parse(source?.lastSuccess ?? '')
  const nowMs = now instanceof Date ? now.getTime() : now
  const days = source?.cadenceDays
  const ageDays = Number.isFinite(last) ? Math.floor((nowMs - last) / DAY_MS) : null
  if (!Number.isFinite(last) || !(days > 0)) return { ageDays, expectedBy: null, status: 'unknown', stale: false }
  const due = last + days * DAY_MS
  const expectedBy = due + marginForDays(days) * DAY_MS
  const status = nowMs > expectedBy ? 'stale' : nowMs > due ? 'due' : 'fresh'
  return { ageDays, expectedBy: new Date(expectedBy).toISOString(), status, stale: status === 'stale' }
}
