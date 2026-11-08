// On-demand loader, defensive parser and hook for per-place visit details (the places folder named by the manifest).
import { useCallback, useEffect, useState } from 'react'
import { fetchBoundedJson, HttpError } from '../../lib/boundedJson'
import { isRecord } from '../../lib/guards'
import { useRelease } from './release'
import {
  VISIT_FIELD_KEYS,
  type PlaceDetails,
  type VisitField,
  type VisitFieldKey,
} from '../../types/data-model'

export const MAX_DETAILS_BYTES = 64 * 1024
const BUDGET_MESSAGE = 'Place details exceed the download budget.'
const MAX_VALUE_LENGTH = 200
const ID_PATTERN = /^[a-z0-9-]{1,120}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const isValidPlaceId = (id: unknown): id is string =>
  typeof id === 'string' && ID_PATTERN.test(id)

/** `base` is the release's places folder URL (ends with a slash). */
export const placeDetailsUrl = (base: string, id: string) => `${base}${encodeURIComponent(id)}.json`

const KEY_SET = new Set<string>(VISIT_FIELD_KEYS)

/** Parses a details payload; unknown keys are dropped and unsourced "known" fields become unknown. */
export function parsePlaceDetails(raw: unknown, id: string): PlaceDetails | null {
  if (!isRecord(raw) || !Array.isArray(raw.fields)) return null
  const byKey = new Map<VisitFieldKey, VisitField>()
  for (const item of raw.fields) {
    if (!isRecord(item) || typeof item.key !== 'string' || !KEY_SET.has(item.key)) continue
    const key = item.key as VisitFieldKey
    if (byKey.has(key)) continue
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : key
    const value =
      typeof item.value === 'string' ? item.value.trim().slice(0, MAX_VALUE_LENGTH) : ''
    const sourceId =
      typeof item.sourceId === 'string' && item.sourceId.trim() ? item.sourceId.trim() : ''
    const verifiedAt =
      typeof item.verifiedAt === 'string' && DATE_PATTERN.test(item.verifiedAt)
        ? item.verifiedAt
        : ''
    if (item.status === 'known' && value && sourceId && verifiedAt) {
      byKey.set(key, { key, label, status: 'known', value, sourceId, verifiedAt })
    } else {
      byKey.set(key, { key, label, status: 'unknown' })
    }
  }
  // Fixed order; keys the file omitted are not invented.
  const fields = VISIT_FIELD_KEYS.flatMap((k) => {
    const f = byKey.get(k)
    return f ? [f] : []
  })
  return { id, fields }
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

/** "2026-11-02" -> "Nov 2, 2026" (UTC, so the day never shifts). */
export function formatVerifiedDate(value: string): string {
  if (!DATE_PATTERN.test(value)) return value
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date)
}

export interface SplitFields {
  known: VisitField[]
  /** Unknown fields for the compact "Not verified" line (wheelchair is reported separately). */
  unknown: VisitField[]
  /** True when wheelchair access is not verified; it is always shown explicitly, never inferred. */
  wheelchairUnknown: boolean
}

export function splitFields(fields: VisitField[]): SplitFields {
  const known = fields.filter((f) => f.status === 'known')
  const unknown = fields.filter((f) => f.status !== 'known' && f.key !== 'wheelchair')
  const wheelchairUnknown = !known.some((f) => f.key === 'wheelchair')
  return { known, unknown, wheelchairUnknown }
}

/**
 * Fetches and parses details for one id. Resolves null when the file is genuinely absent (404) or its content is
 * invalid. Rejects on abort and on transient failures (network, timeout, HTTP errors other than 404) so they aren't cached.
 */
export async function loadPlaceDetails(
  base: string,
  id: string,
  signal: AbortSignal,
): Promise<PlaceDetails | null> {
  if (!isValidPlaceId(id)) return null
  let raw: unknown
  try {
    raw = await fetchBoundedJson(placeDetailsUrl(base, id), {
      signal,
      maxBytes: MAX_DETAILS_BYTES,
      label: 'Place details',
      budgetMessage: BUDGET_MESSAGE,
    })
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null
    // Bad JSON or an oversized file will not fix itself on retry, so it counts as missing.
    if (err instanceof SyntaxError || (err instanceof Error && err.message === BUDGET_MESSAGE)) return null
    throw err
  }
  return parsePlaceDetails(raw, id)
}

const cache = new Map<string, PlaceDetails | null>()

/** Cached details: undefined when not loaded yet, null when known to be missing. */
export const getCachedPlaceDetails = (id: string) => cache.get(id)

/** Loads through the per-id cache. Successes and genuine absences are cached; failures are not. */
export async function loadPlaceDetailsCached(
  base: string,
  id: string,
  signal: AbortSignal,
): Promise<PlaceDetails | null> {
  if (cache.has(id)) return cache.get(id) ?? null
  const details = await loadPlaceDetails(base, id, signal)
  cache.set(id, details)
  return details
}

export interface PlaceDetailsResult {
  status: 'loading' | 'ready' | 'missing' | 'error'
  details: PlaceDetails | null
  /** Re-requests after an 'error'. */
  retry: () => void
}

const noop = () => {}

export function usePlaceDetails(id: string | null): PlaceDetailsResult {
  const release = useRelease()
  const [loaded, setLoaded] = useState<{ id: string; details: PlaceDetails | null } | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => {
    setFailedId(null)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!release || !id || !isValidPlaceId(id) || cache.has(id)) return
    const controller = new AbortController()
    loadPlaceDetailsCached(release.placesBaseUrl, id, controller.signal).then(
      (details) => {
        setFailedId(null)
        setLoaded({ id, details })
      },
      () => {
        if (!controller.signal.aborted) setFailedId(id)
      },
    )
    return () => controller.abort()
  }, [id, release, attempt])

  if (!id || !isValidPlaceId(id)) return { status: 'missing', details: null, retry: noop }
  const entry = cache.has(id) ? { id, details: cache.get(id) ?? null } : loaded?.id === id ? loaded : null
  if (entry) {
    return entry.details
      ? { status: 'ready', details: entry.details, retry: noop }
      : { status: 'missing', details: null, retry: noop }
  }
  return failedId === id
    ? { status: 'error', details: null, retry }
    : { status: 'loading', details: null, retry: noop }
}
