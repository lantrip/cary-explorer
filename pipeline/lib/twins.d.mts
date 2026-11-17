import type { Polygon, Position } from './geo.mjs'
export const CONTAIN_TOL_M: number
export function distanceToPolygonsM(point: Position, polygons: Polygon[]): number
export interface TwinCandidate {
  id: string
  names: Set<string>
  polygons?: Polygon[]
}
export function findContainedTwin<T extends TwinCandidate>(normalizedName: string, pt: Position, candidates: T[]): { candidate: T; distanceM: number } | undefined
