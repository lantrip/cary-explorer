export interface CollectionRecord {
  id: string
  title: string
  summary: string
  placeIds: string[]
  curation: string
}
export interface CollectionsFile {
  collections: CollectionRecord[]
}
export const COLLECTION_MAX_PLACES: number
export function buildCollections(
  places: {
    id: string
    name: string
    category: string
    municipality?: string
    coverage?: string
    amenities?: string[]
  }[],
  details?: Record<string, { fields?: { key: string; status: string }[] } | undefined>,
  options?: { trailMiles?: Map<string, number> },
): CollectionsFile
export function validateCollections(data: unknown, placeIds: Set<string>): string[]
