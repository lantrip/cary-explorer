export type Position = number[]
export interface RepairStats {
  closedRings: number
  duplicateVertices: number
  droppedRings: number
  droppedLines: number
  droppedGeometries: number
  windingReversed: number
}
export interface RepairResult {
  geometry: { type: string; coordinates: unknown } | null
  stats: RepairStats
  selfIntersections: number
  wrongWinding: number
}
export function signedArea(ring: Position[]): number
export function ringSelfIntersections(ring: Position[]): number
export function repairGeometry(geometry: unknown, options?: { fixWinding?: boolean }): RepairResult
export interface RepairReport {
  bySource: Record<string, Record<string, number>>
  selfIntersections: { placeId: string; source: string; count: number }[]
  dropped: { placeId: string; source: string }[]
}
export const newReport: () => RepairReport
export function repairFeatures<F extends { properties?: { placeId?: string }; geometry: unknown }>(
  features: F[],
  sourceOf: (f: F) => string | undefined,
  options?: { fixWinding?: boolean; into?: RepairReport },
): { features: F[]; report: RepairReport }
export function formatRepairReport(report: RepairReport): string[]
