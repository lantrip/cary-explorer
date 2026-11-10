import type { Polygon, Position, Scope } from './geo.mjs'
export const CREEK_LINK_M: number
export const CREEK_MIN_M: number
export const CREEK_SIMPLIFY_M: number
export const ALONG_MIN_M: number
export const ALONG_BUFFER_M: number
export const CREEK_IN_PARK_MIN_M: number
export interface Creek {
  name: string
  gnisid: number | null
  ids: string[]
  lines: Position[][]
  lengthM: number
}
export function groupCreeks(
  features: { properties?: Record<string, unknown> | null; geometry: unknown }[],
  scope: Pick<Scope, 'nearby'>,
  linkM?: number,
): Creek[]
export function simplifyCreekLines(lines: Position[][], toleranceM?: number): Position[][]
export function midpoint(line: Position[]): Position
export function creekPin(lines: Position[][], allowed: (p: Position) => boolean): Position | null
export function creekDescription(name: string, lengthM: number): string
export function alongLengthM(trailLines: Position[][], creekLines: Position[][], bufferM?: number): number
export interface CreekLink {
  from: string
  to: string
  kind: 'contained' | 'nearby'
  basis?: 'along'
  alongM?: number
}
export function creekRelationships(
  creeks: { id: string; lines: Position[][] }[],
  items: { id: string; kind: 'park' | 'trail'; polygons?: Polygon[]; lines?: Position[][] }[],
): CreekLink[]
