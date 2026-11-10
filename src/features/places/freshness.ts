// Source freshness at view time. Mirrors pipeline/lib/health.mjs (weekly 7d + 3d margin, monthly 31d + 7d); keep in step.
// The manifest holds only lastSuccess and cadenceDays, so the answer depends on the clock and is computed here, never at publish.
import type { ManifestSource } from './release'

const DAY_MS = 86_400_000

export type Freshness = 'fresh' | 'due' | 'stale' | 'unknown'

/** Margin after the cadence before a source counts as older than expected. */
export const marginDays = (cadenceDays: number) => (cadenceDays <= 7 ? 3 : 7)

/** Fresh until lastSuccess + cadence, due until the margin passes, then stale. Unknown without both fields (older manifests). */
export function sourceFreshness(source: Pick<ManifestSource, 'lastSuccess' | 'cadenceDays'>, now: Date): Freshness {
  const last = Date.parse(source.lastSuccess ?? '')
  const days = source.cadenceDays
  if (!Number.isFinite(last) || !days || days <= 0) return 'unknown'
  const due = last + days * DAY_MS
  const nowMs = now.getTime()
  return nowMs > due + marginDays(days) * DAY_MS ? 'stale' : nowMs > due ? 'due' : 'fresh'
}

/** Whole days since `iso`, never negative; null when it is not a date. */
export function ageInDays(iso: string | undefined, now: Date): number | null {
  const t = Date.parse(iso ?? '')
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / DAY_MS)) : null
}

/** "Updated 3 days ago", "Updated today", "Updated 1 day ago". */
export function updatedAgoText(days: number): string {
  return days === 0 ? 'Updated today' : `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** True when any of the given source ids is stale in the release's source list. */
export function anySourceStale(sources: ManifestSource[], ids: string[], now: Date): boolean {
  const wanted = new Set(ids)
  return sources.some((s) => wanted.has(s.id) && sourceFreshness(s, now) === 'stale')
}
