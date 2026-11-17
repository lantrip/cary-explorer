import type { Relationship } from './relationships.mjs'
export interface CuratedEntry {
  from: string
  to: string
  note: string
  source: string
}
export function loadCurated(path: string): unknown[]
export function curatedRelationships(entries: unknown[], placeIds: Set<string>, label?: string): Relationship[]
