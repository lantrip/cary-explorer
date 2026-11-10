// Pure helpers for the Credits & privacy dialog: join manifest sources to catalog sources, format dates, decide which sections show.
import { formatUtcLongDate } from '../../lib/dates'
import type { ManifestSource } from '../places/release'
import { ageInDays, sourceFreshness, updatedAgoText } from '../places/freshness'
import type { Source } from '../../types/place'

export interface CreditsRow {
  id: string
  /** Main label: the dataset title, else the publisher name, else the id. */
  title: string
  /** Publisher (catalog source name), or the id when the catalog has no source with that id. */
  name: string
  /** Catalog source url, when there is one. */
  url?: string
  licence: string
  retrievedAt?: string
  lastSuccess?: string
  /** Shown only when above 0. */
  recordCount?: number
  /** False when the source failed in the latest refresh. */
  ok: boolean
  /** Credit line for sources whose licence requires attribution (CC BY family). */
  credit?: string
  /** "Updated N days ago", from lastSuccess (else retrievedAt); absent when neither is a date. */
  updatedText?: string
  /** True when the source is past its cadence plus margin. */
  stale: boolean
  /** "Older than expected (updates weekly)"; set only when stale. */
  staleText?: string
}

export const LICENCE_UNKNOWN = 'Not stated'

/** True for Creative Commons Attribution licences (CC BY, CC BY-SA, ...), not CC0. */
export function requiresCredit(licence: string | undefined): boolean {
  return /^CC[\s-]BY\b/i.test(licence?.trim() ?? '')
}

/** One row per manifest source, in manifest order. The catalog supplies name and url by matching id. */
export function buildCreditsRows(
  manifestSources: ManifestSource[],
  catalogSources: Source[],
  now: Date = new Date(),
): CreditsRow[] {
  const byId = new Map(catalogSources.map((s) => [s.id, s]))
  return manifestSources.map((m) => {
    const cat = byId.get(m.id)
    const name = cat?.name.trim() || m.id
    const title = cat?.title?.trim() || name
    const licence = m.licence?.trim() || cat?.license?.trim() || LICENCE_UNKNOWN
    const age = ageInDays(m.lastSuccess ?? m.retrievedAt ?? cat?.retrievedAt, now)
    const stale = sourceFreshness(m, now) === 'stale'
    return {
      id: m.id,
      title,
      name,
      url: cat?.url,
      licence,
      retrievedAt: m.retrievedAt ?? cat?.retrievedAt,
      lastSuccess: m.lastSuccess,
      recordCount: m.recordCount !== undefined && m.recordCount > 0 ? m.recordCount : undefined,
      ok: m.ok,
      updatedText: age === null ? undefined : updatedAgoText(age),
      stale,
      staleText: stale && m.cadence ? `Older than expected (updates ${m.cadence})` : stale ? 'Older than expected' : undefined,
      credit: requiresCredit(licence) ? `Adapted from data by ${name}, licensed ${licence}.` : undefined,
    }
  })
}

/** The eBird section only appears when eBird is actually one of the catalog's sources. */
export function showEbirdSection(catalogSources: Source[]): boolean {
  return catalogSources.some((s) => s.id === 'ebird')
}

export const formatCreditDate = formatUtcLongDate

// Basemap credit. Keep in step with createBasemapLayer() in features/map/basemap.ts (OpenLayers' OSM source).
export const BASEMAP_CREDIT = {
  provider: 'OpenStreetMap',
  text: '© OpenStreetMap contributors',
  copyrightUrl: 'https://www.openstreetmap.org/copyright',
  library: 'OpenLayers',
  libraryUrl: 'https://openlayers.org/',
} as const
