export const CADENCE_DAYS: Record<string, number>
export const MARGIN_DAYS: Record<string, number>
export const REGISTRY_ID: Record<string, string>
export function registryEntry<T extends { id: string }>(registry: T[], catalogId: string): T | undefined
export function marginForDays(cadenceDays: number): number
export function cadenceFields(entry?: { cadence?: string }): { cadence?: string; cadenceDays?: number }
export interface SourceHealth {
  ageDays: number | null
  expectedBy: string | null
  status: 'fresh' | 'due' | 'stale' | 'unknown'
  stale: boolean
}
export function sourceHealth(source: { lastSuccess?: string; cadenceDays?: number }, now: Date | number): SourceHealth
