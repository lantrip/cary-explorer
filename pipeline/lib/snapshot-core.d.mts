export interface Source {
  id: string
  publisher: string
  title: string
  type: 'ods' | 'arcgis' | 'arcgis-hub'
  url: string
  licence: string
  licenceStatus: 'open' | 'restricted' | 'unclear'
  attribution: string
  cadence: 'weekly' | 'monthly'
  fields: string[]
  where?: string
  hubItemId?: string
  hubLayer?: number
  dir: string
  enabled: boolean
}
export interface RunResult { id: string; ok: boolean; recordCount: number | null; expectedCount: number | null; error: string | null }
export function validateRegistry(sources: unknown): string[]
export function applyAllowlist(feature: any, fields: string[]): any
export function sortById<T extends { id?: unknown }>(items: T[]): T[]
export function snapshotSource(source: Source, opts: { fetch?: typeof fetch; outRoot: string; now?: () => Date }): Promise<Record<string, unknown> & { recordCount: number; expectedCount: number }>
export function runSnapshots(opts: {
  sources: Source[]
  only?: string
  fetch?: typeof fetch
  outRoot: string
  lastRunPath?: string
  now?: () => Date
  log?: (m: string) => void
}): Promise<{ ok: boolean; results: RunResult[] }>
export function loadRegistry(path: string): Promise<Source[]>
