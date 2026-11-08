// Amenity filters on verified visit fields: pure helpers shared by the parser, filter, URL and UI.
// A place lists an amenity only when the field is KNOWN with a source. A missing key means "unknown", never "no".
import type { AmenityKey, Place } from '../../types/place'

/** Fixed order, used for the UI, the URL and the parser output. */
export const AMENITY_KEYS: readonly AmenityKey[] = [
  'restrooms',
  'parking',
  'playground',
  'picnicShelter',
  'dogPark',
  'walkingTrails',
  'pavedSurface',
  'wheelchair',
  'water',
]

export const AMENITY_LABEL: Record<AmenityKey, string> = {
  restrooms: 'Restrooms',
  parking: 'Parking',
  playground: 'Playground',
  picnicShelter: 'Picnic shelter',
  dogPark: 'Dog park',
  walkingTrails: 'Walking trails',
  pavedSurface: 'Paved',
  wheelchair: 'Wheelchair accessible',
  water: 'Drinking water',
}

export const AMENITY_NOTE =
  'Only places with confirmed information from a source are shown. Places without data are not counted as lacking it.'

const isKey = (v: unknown): v is AmenityKey => typeof v === 'string' && (AMENITY_KEYS as readonly string[]).includes(v)

/** Keeps known keys only, drops duplicates, returns them in fixed order. */
export function normalizeAmenities(values: readonly unknown[]): AmenityKey[] {
  const wanted = new Set(values.filter(isKey))
  return AMENITY_KEYS.filter((k) => wanted.has(k))
}

/** Catalog `amenities` field: undefined when absent, malformed or empty after cleaning. */
export function parseAmenities(value: unknown): AmenityKey[] | undefined {
  if (!Array.isArray(value)) return undefined
  const clean = normalizeAmenities(value)
  return clean.length > 0 ? clean : undefined
}

/** AND semantics: a place passes only if every selected amenity is known for it. */
export function hasAmenities(place: Pick<Place, 'amenities'>, selected: readonly AmenityKey[]): boolean {
  return selected.every((k) => place.amenities?.includes(k) === true)
}

export function filterByAmenities<T extends Pick<Place, 'amenities'>>(places: readonly T[], selected: readonly AmenityKey[]): T[] {
  return selected.length === 0 ? (places as T[]) : places.filter((p) => hasAmenities(p, selected))
}

/** Amenities that at least one of the places has, with the number of places, in fixed order. */
export function availableAmenities(places: readonly Pick<Place, 'amenities'>[]): { key: AmenityKey; count: number }[] {
  const counts = new Map<AmenityKey, number>()
  for (const p of places) for (const k of p.amenities ?? []) counts.set(k, (counts.get(k) ?? 0) + 1)
  return AMENITY_KEYS.filter((k) => counts.has(k)).map((key) => ({ key, count: counts.get(key) ?? 0 }))
}

/** `amenities=` value; empty string when none. */
export function serializeAmenities(selected: readonly AmenityKey[]): string {
  return normalizeAmenities(selected).join(',')
}

export function parseAmenitiesParam(raw: string): AmenityKey[] {
  if (raw.length > 200) return []
  return normalizeAmenities(raw.split(','))
}

function nameList(selected: readonly AmenityKey[]): string {
  const names = selected.map((k) => AMENITY_LABEL[k].toLowerCase())
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The sentence for an empty result caused by amenity filters; null when none are selected. */
export function emptyAmenitiesText(selected: readonly AmenityKey[]): string | null {
  if (selected.length === 0) return null
  return `No places with confirmed ${nameList(selected)}. Many places don't have this information yet.`
}
