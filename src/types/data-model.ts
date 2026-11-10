// Minimal data model for the pipeline (issue #13). Types only; no runtime imports.

/** A raw record as fetched from one source, kept with its provenance. */
export interface SourceRecord {
  /** Registry id of the source this record came from (matches `SourceRegistryEntry.id`). */
  sourceId: string
  /** The publisher's own id for the record, kept as-is. */
  recordId: string
  /** Canonical place this record was linked to, if any. */
  placeId?: string
  /** When the record was fetched from the source (ISO 8601). */
  fetchedAt: string
  /** Allowlisted source fields only; see `SourceRegistryEntry.fields`. */
  properties: Record<string, unknown>
}

/** A named group of places shown together (for example a theme or a curated list). */
export interface Collection {
  id: string
  title: string
  /** One-line description shown with the collection. */
  description: string
  /** Ids of the places in this collection, in display order. */
  placeIds: string[]
}

/** A link between two places. Relationships are never merged; each keeps its kind. */
export interface Relationship {
  from: string
  to: string
  /** `contained`: one place lies within the other; `nearby`: within 400 m; `curated`: set by hand in overrides. */
  kind: 'contained' | 'nearby' | 'curated'
  /** Straight-line distance in metres, present for `nearby`. */
  distanceM?: number
  /** For `nearby`: within 400 m, or the closest place found beyond that. For `contained`: `watershed` means a park or trail lies in a USGS watershed place (not a trail running through a park). */
  basis?: 'within-400m' | 'nearest' | 'watershed' | 'along'
  /** For `along` (kind `nearby`, from a trail to a creek): metres of the trail within 50 m of the creek line, rounded to 10 m. */
  alongM?: number
  /** Why the link exists (for example the geometry test or the override note). */
  evidence?: string
}

/** One entry in `pipeline/sources.config.json`. */
export interface SourceRegistryEntry {
  /** Stable source id, used in `SourceRecord.sourceId` and manifests. */
  id: string
  /** Organisation that publishes the data. */
  publisher: string
  /** Human-readable name of the dataset or service. */
  title: string
  /** Access protocol: Socrata-style opendatasoft API or ArcGIS REST. */
  type: 'ods' | 'arcgis'
  /** Service or dataset URL the adapter fetches from. */
  url: string
  /** Licence name or identifier as published by the source. */
  licence: string
  /** Whether the licence allows publishing. Only `open` sources can be enabled. */
  licenceStatus: 'open' | 'restricted' | 'unclear'
  /** Attribution text to show with the data. */
  attribution: string
  /** How often the source is refreshed. */
  cadence: 'weekly' | 'monthly'
  /** Public field allowlist; all other source fields are dropped at snapshot time. */
  fields: string[]
  /** Snapshot directory name under `pipeline/sources/`. */
  dir: string
  /** When false, the snapshot step skips this source. */
  enabled: boolean
}

/** The 14 visit-information fields, in display order. */
export const VISIT_FIELD_KEYS = [
  'address',
  'entrances',
  'parking',
  'restrooms',
  'pavedSurface',
  'stepsSlope',
  'wheelchair',
  'hours',
  'water',
  'dogPark',
  'playground',
  'picnicShelter',
  'walkingTrails',
  'phone',
] as const

export type VisitFieldKey = (typeof VISIT_FIELD_KEYS)[number]

/** One visit fact for a place. A `known` field always carries a source and a verification date. */
export interface VisitField {
  key: VisitFieldKey
  label: string
  status: 'known' | 'unknown'
  value?: string
  sourceId?: string
  /** YYYY-MM-DD */
  verifiedAt?: string
}

/** Contents of `/data/places/<id>.json`. */
export interface PlaceDetails {
  id: string
  fields: VisitField[]
}
