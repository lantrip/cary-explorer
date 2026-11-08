import type { Polygon, Position } from './geo.mjs'
export const NEARBY_M: number
export const NEAREST_MAX_M: number
export const CONTAINED_MIN_M: number
export function lengthInsideM(lines: Position[][], park: { polyBoxes: { polygon: Polygon; bbox: number[] }[] }): number
export interface RelationshipItem {
  id: string
  kind: 'park' | 'trail'
  polygons?: Polygon[]
  lines?: Position[][]
  points?: Position[]
}
export interface Relationship {
  from: string
  to: string
  kind: 'contained' | 'nearby' | 'curated'
  distanceM?: number
  basis?: 'within-400m' | 'nearest' | 'watershed'
  /** Trail-to-watershed links only, when the trail crosses several watersheds: the share (0-1) of its length in this one. */
  share?: number
}
export function computeRelationships(items: RelationshipItem[]): { relationships: Relationship[] }
