// Types for the helpers that tests import from build-catalog.mjs.
export type Position = number[]
export interface SourceRecordRef {
  sourceId: string
  recordId: string
}
export function uniqueRecords(list: SourceRecordRef[]): SourceRecordRef[]
export type Ring = Position[]
export type Polygon = Ring[]
export function normalize(name: unknown): string
export function slug(text: string): string
export function round(n: number, decimals?: number): number
export function pointInPolygon(point: Position, polygon: Polygon): boolean
export function pointInGeometry(point: Position, geometry: unknown): boolean
export function centroid(polygons: Polygon[]): [number, number]
export function bboxOf(positions: Position[]): [number, number, number, number]
export function vertexNearestBboxCentre(positions: Position[]): [number, number]
export interface ParkGroup {
  key: string
  name: string
  category: 'park' | 'community'
  kind: string
  acres: number
  polygons: Polygon[]
  parcels: number
  realids: string[]
}
export interface GreenwayGroup {
  key: string
  name: string
  miles: number
  lines: Position[][]
  segments: number
  segmentIds: string[]
}
export function groupParks(features: unknown[]): ParkGroup[]
export function groupGreenways(features: unknown[]): { kept: GreenwayGroup[]; dropped: GreenwayGroup[] }
export function greenwayFeatures(
  placeId: string,
  existingLines: Position[][],
  proposedLines: Position[][],
  scope: unknown,
): { type: 'Feature'; properties: { placeId: string; status: 'existing' | 'proposed'; outsideCore: boolean }; geometry: { type: 'MultiLineString'; coordinates: Position[][] } }[]
export function assignIds(
  existing: Record<string, string>,
  entries: { key: string; prefix: string; name: string }[],
): Record<string, string>
export const TOWNS: string[]
export const UNINCORPORATED_WAKE: string
export function municipalityOf(
  point: Position,
  towns: { features: { properties?: { BASENAME?: string }; geometry: unknown }[] },
  county: string | undefined,
): string
export function stripJurisdiction(jurisdiction: unknown): string
export function build(options?: { write?: boolean; outDir?: string; curatedPath?: string }): {
  relationships: {
    relationships: { from: string; to: string; kind: string; distanceM?: number; basis?: string }[]
  }
  dedupeSkips: { name: string; caryId: string; distanceM: number; objectId: unknown }[]
  trailDedupeSkips: { name: string; twinId: string; distanceM: number }[]
  wakeGreenways: { kept: WakeGreenwayGroup[]; dropped: WakeGreenwayGroup[]; skipped: { cary: number; private: number; unnamed: number; notExisting: number }; imported: number }
  catalog: { sources: unknown[]; places: Record<string, unknown>[] }
  outputs: Record<string, string>
  details: Record<string, { id: string; fields: import('../lib/visit.mjs').VisitField[]; sourceRecords?: SourceRecordRef[]; references?: { title: string; url: string; publisher: string }[] }>
  parks: ParkGroup[]
  kept: GreenwayGroup[]
  dropped: GreenwayGroup[]
  neighbours: number
  skipped: { inCary: number; outside: number; duplicate: number }
  jurisdictionMismatches: { name: string; jurisdiction: string; municipality: string }[]
  geometryRepair: import('../lib/repair.mjs').RepairReport
  ids: Record<string, string>
}
export function carynUrl(url: unknown): unknown
export const DEDUPE_M: number
export function findCaryTwin(
  name: unknown,
  pt: Position,
  caryNames: { id: string; centroid: Position; names: Set<string>; polygons?: Polygon[] }[],
): { candidate: { id: string; centroid: Position; names: Set<string>; polygons?: Polygon[] }; distanceM: number } | undefined
export const ENTRANCE_NAME_MAX_M: number
export function joinEntrances(
  place: { name: string; aliases?: string[]; centroid: Position },
  ctx: { polygons?: Polygon[] } | undefined,
  entrances: { geometry?: { coordinates?: Position }; properties?: Record<string, unknown> }[],
  aliasNames?: string[],
  otherNames?: Set<string>,
): { geometry?: { coordinates?: Position }; properties?: Record<string, unknown> }[]
export function buildDetails(
  places: { id: string; name: string; aliases?: string[]; centroid: Position }[],
  visitCtx: Map<string, Record<string, unknown>>,
  entrances: unknown[],
  aliasMap: Record<string, string[]>,
  dates: { wake?: string; entrances?: string; caryFeatures?: string; greenways?: string; wakeGreenways?: string; fire?: string },
  records?: Map<string, SourceRecordRef[]>,
): Record<string, { id: string; fields: import('../lib/visit.mjs').VisitField[]; sourceRecords?: SourceRecordRef[]; references?: { title: string; url: string; publisher: string }[] }>
export const WAKE_GREENWAY_SIMPLIFY_M: number
export function lineLengthM(lines: Position[][]): number
export function fireStationName(label: unknown): { name: string; stationNumber?: number } | undefined
export interface FireStation {
  stationId: string
  name: string
  stationNumber?: number
  address?: string
  agency?: string
  pt: Position
}
export function groupFireStations(features: unknown[]): FireStation[]
export function fireStationDescription(s: Pick<FireStation, 'address' | 'agency'>): string
export function wakeGreenwayStatus(raw: unknown): 'existing' | 'proposed' | undefined
export function wakeOwnerLabel(owner: unknown): string | undefined
export function dominantSurface(segments: { surface?: unknown; lengthM: number }[]): string | undefined
export interface WakeGreenwayGroup {
  key: string
  name: string
  miles: number
  lines: Position[][]
  proposedLines: Position[][]
  segments: number
  owners: string[]
  surface: string | undefined
  objectIds: string[]
}
export function groupWakeGreenways(features: unknown[]): {
  kept: WakeGreenwayGroup[]
  dropped: WakeGreenwayGroup[]
  skipped: { cary: number; private: number; unnamed: number; notExisting: number }
}
export function findTrailTwin(
  name: unknown,
  lines: Position[][],
  candidates: { id: string; centroid: Position; names: Set<string> }[],
): { twin: { id: string; centroid: Position; names: Set<string> }; distanceM: number } | undefined
export function registryTitle(registry: { id: string; title?: string }[], catalogId: string): string
export function registryLicenceStatus(registry: { id: string; licenceStatus?: string }[], catalogId: string): string
