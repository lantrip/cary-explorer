// Core domain types: a canonical Place (centroid and bbox as [lon, lat]) and the Source it came from.
export type ThemeId = 'parks-trails' | 'history' | 'birds-wildlife' | 'water' | 'art-community'

export type CategoryId =
  | 'park'
  | 'trail'
  | 'history'
  | 'wildlife'
  | 'water'
  | 'art'
  | 'community'
  | 'fire-station'

/** Visit fields a place can be filtered by; present only when the field is known with a source. */
export type AmenityKey =
  | 'restrooms'
  | 'parking'
  | 'playground'
  | 'picnicShelter'
  | 'dogPark'
  | 'walkingTrails'
  | 'pavedSurface'
  | 'wheelchair'
  | 'water'

export interface Place {
  id: string
  name: string
  aliases: string[]
  category: CategoryId
  /** Derived from `category` by the catalog parser; not stored in the JSON. */
  theme: ThemeId
  municipality: string
  county?: string
  /** Where the place sits against the scope rules: in the core area, in the 5-mile nearby buffer, or outside (dropped by the pipeline). */
  coverage?: 'core' | 'nearby' | 'outside'
  /** Representative point in WGS84 [lon, lat], not a guaranteed entrance. */
  centroid: [number, number]
  bbox?: [number, number, number, number]
  description: string
  address?: string
  stationNumber?: number
  /** Official page for the place (e.g. its eBird hotspot page). */
  url?: string
  /** True = local dev preview data, never published. */
  localOnly?: boolean
  /** Visit-field keys that are KNOWN for this place (with a source), in fixed order. Omitted when none. Absence means unknown, never "no". */
  amenities?: AmenityKey[]
  /** At least one; each id matches a Source in the catalog. */
  sourceIds: string[]
}

export interface Source {
  id: string
  /** Dataset title (e.g. "Greenway Trails (existing and proposed)"). */
  title?: string
  /** Publisher. */
  name: string
  url: string
  license?: string
  retrievedAt?: string
}
