import type { Polygon, Position } from './geo.mjs'
import type { Relationship } from './relationships.mjs'
export const WATERSHED_SIMPLIFY_M: number
export const DIVIDE_SHARE: number
export const TRAIL_MIN_SHARE: number
export const TRAIL_SINGLE_SHARE: number
export function trailShares(lines: Position[][], prepared: PreparedWatershed[]): { code: string; share: number }[]
export interface Watershed {
  huc12: string
  name: string
  placeName: string
  huc8: string
  huc8Name?: string
  huc6: string
  huc6Name?: string
  polygons: Polygon[]
}
export interface PreparedWatershed extends Watershed {
  polyBoxes: { polygon: Polygon; bbox: number[] }[]
}
interface Collection {
  features: { properties: Record<string, unknown>; geometry: unknown }[]
}
export function watershedPlaceName(huc12Name: string): string
export function watershedDescription(w: Pick<Watershed, 'huc12' | 'huc6Name' | 'huc8Name'>): string
export function mapWatersheds(input: { huc12: Collection; huc8: Collection; huc6: Collection }): Watershed[]
export function prepareWatershed(w: Watershed): PreparedWatershed
export function pointInWatershed(point: Position, w: PreparedWatershed): boolean
export function intersectsScope(w: Watershed | PreparedWatershed, prepared: unknown): boolean
export function simplifyPolygons(polygons: Polygon[], toleranceM?: number): Polygon[]
export function watershedsFor(
  item: { kind: 'park' | 'trail' | 'creek'; centroid: Position; polygons?: Polygon[] },
  prepared: PreparedWatershed[],
): string[]
export function watershedRelationships(
  items: { id: string; kind: 'park' | 'trail' | 'creek'; centroid: Position; polygons?: Polygon[]; lines?: Position[][] }[],
  prepared: PreparedWatershed[],
  idByHuc12: Map<string, string>,
): { relationships: Relationship[]; notDetermined: string[] }
export function representativePoint(w: Watershed | PreparedWatershed, target: Position, allowed: (p: Position) => boolean): Position | null
