import type { SourceHealth } from '../lib/health.mjs'
export interface FreshnessRow extends SourceHealth {
  id: string
  cadence: string | null
  lastSuccess: string | null
  ok: boolean
}
export interface FreshnessResult {
  rows: FreshnessRow[]
  stale: FreshnessRow[]
  exitCode: 0 | 1
}
export function checkFreshness(manifest: unknown, now: Date | number): FreshnessResult
export function formatReport(result: FreshnessResult): string
