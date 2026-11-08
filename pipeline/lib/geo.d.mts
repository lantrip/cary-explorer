export type Position = number[]
export type Ring = Position[]
export type Polygon = Ring[]
export type Coverage = 'core' | 'nearby' | 'outside'
export interface Prepared {
  polys: { polygon: Polygon; bbox: number[] }[]
  bbox: number[]
}
export interface Scope {
  core: Prepared
  nearby: Prepared
  crossing: Prepared
}
export function polygonsOf(geometry: unknown): Polygon[]
export function linesOf(geometry: unknown): Position[][]
export function pointInPolygon(point: Position, polygon: Polygon): boolean
export function pointInGeometry(point: Position, geometry: unknown): boolean
export function roundTo(n: number, decimals?: number): number
export function roundCoords<T>(c: T, decimals?: number): T
export function extent(positions: Position[]): number[]
export function prepare(source: unknown): Prepared
export function inPrepared(point: Position, prepared: Prepared): boolean
export function createScope(sources: { core: unknown; nearby: unknown; crossing: unknown }): Scope
export function classify(point: Position, scope: Scope): Coverage
export function classifyLine(lines: Position[][], scope: Scope): Coverage
export function splitLines(lines: Position[][], prepared: Prepared): { inside: boolean; coordinates: Position[] }[]
export function clipToLimit(
  lines: Position[][],
  crossingLimit: Prepared,
  core?: Prepared,
): { lines: Position[][]; partsOutsideCore: boolean }
export function splitByCore(lines: Position[][], core: Prepared): { inside: Position[][]; outside: Position[][] }
export function haversineM(a: Position, b: Position): number
export function simplifyLine(line: Position[], toleranceM: number): Position[]
