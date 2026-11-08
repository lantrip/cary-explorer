// Curated collections (issue #45): transparent rules over data that already exists in the release.
// Each collection records the rule it was built with in `curation`. Collections whose data does not exist yet
// (history, creeks, public art, birding) are NOT shipped empty; they are listed as pending in docs/collections.md.
// Never build a collection around sensitive wildlife locations.

export const COLLECTION_MAX_PLACES = 12

const byName = (a, b) => a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const count = (p) => (p.amenities ?? []).length
const cary = (p) => (p.municipality === 'Cary' ? 0 : 1)

/** Most confirmed amenities first, Cary on ties, then name. */
const byFacilities = (a, b) => count(b) - count(a) || cary(a) - cary(b) || byName(a, b)

const knownField = (detail, key) => (detail?.fields ?? []).some((f) => f?.key === key && f.status === 'known')

/**
 * Pure builder. `places` are catalog places, `details` maps place id -> parsed places/<id>.json,
 * `trailMiles` maps trail place id -> miles as computed by the build (trails without a figure rank last).
 * Returns { collections } with only non-empty collections, in a fixed order.
 */
export function buildCollections(places, details = {}, { trailMiles = new Map() } = {}) {
  const collections = []

  const withRestroom = places.filter(
    (p) => p.category === 'park' && (p.amenities ?? []).includes('restrooms') && knownField(details[p.id], 'entrances'),
  )
  if (withRestroom.length > 0) {
    const shown = Math.min(COLLECTION_MAX_PLACES, withRestroom.length)
    collections.push({
      id: 'short-visit-restroom',
      title: 'Parks with restrooms and mapped entrances',
      summary: `Parks with a confirmed restroom and a recorded entrance; the ${shown} with the most confirmed facilities, of ${withRestroom.length} that qualify.`,
      placeIds: [...withRestroom].sort(byFacilities).slice(0, COLLECTION_MAX_PLACES).map((p) => p.id),
      curation: `Parks with a recorded restroom and entrance (a park with either unknown is left out), most confirmed facilities first, Cary first on ties, then by name; top ${COLLECTION_MAX_PLACES} of ${withRestroom.length} qualifying parks.`,
    })
  }

  const paved = places.filter((p) => p.category === 'trail' && (p.amenities ?? []).includes('pavedSurface'))
  if (paved.length > 0) {
    const miles = (p) => trailMiles.get(p.id) ?? -1
    const shown = Math.min(COLLECTION_MAX_PLACES, paved.length)
    collections.push({
      id: 'paved-trails',
      title: 'Paved trails',
      summary: `Trails whose surface is recorded as paved; the ${shown} longest, of ${paved.length} that qualify.`,
      placeIds: [...paved].sort((a, b) => miles(b) - miles(a) || byName(a, b)).slice(0, COLLECTION_MAX_PLACES).map((p) => p.id),
      curation: `Trails with a confirmed paved surface (partly paved trails are left out), longest first by the trail length computed from the greenway data, then by name; top ${COLLECTION_MAX_PLACES} of ${paved.length} qualifying trails. This says nothing about wheelchair access.`,
    })
  }

  return { collections }
}

/** Release gate. Returns error strings; empty when the collections are valid for this catalog. */
export function validateCollections(data, placeIds) {
  const errors = []
  if (data === null || typeof data !== 'object' || !Array.isArray(data.collections)) {
    return ['collections: must be { collections: [...] }']
  }
  const seen = new Set()
  for (const [i, c] of data.collections.entries()) {
    const label = `collections[${i}]${typeof c?.id === 'string' ? ` "${c.id}"` : ''}`
    if (c === null || typeof c !== 'object') {
      errors.push(`${label}: must be an object`)
      continue
    }
    if (typeof c.id !== 'string' || !/^[a-z0-9-]{1,60}$/.test(c.id)) errors.push(`${label}: id must be 1-60 chars of a-z, 0-9, "-"`)
    else if (seen.has(c.id)) errors.push(`${label}: duplicate id`)
    else seen.add(c.id)
    for (const key of ['title', 'summary', 'curation']) {
      if (typeof c[key] !== 'string' || !c[key].trim()) errors.push(`${label}: ${key} must be a non-empty string`)
    }
    if (!Array.isArray(c.placeIds) || c.placeIds.length === 0) {
      errors.push(`${label}: placeIds must be a non-empty array`)
      continue
    }
    const inCollection = new Set()
    for (const id of c.placeIds) {
      if (typeof id !== 'string' || !id) errors.push(`${label}: placeIds must be non-empty strings`)
      else if (!placeIds.has(id)) errors.push(`${label}: place "${id}" is not in the catalog`)
      else if (inCollection.has(id)) errors.push(`${label}: place "${id}" listed twice`)
      else inCollection.add(id)
    }
  }
  return errors
}
