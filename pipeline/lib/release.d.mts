export interface Release {
  manifest: {
    version: string
    generatedFrom: string | null
    artifacts: { catalog: string; relationships: string; layers: Record<string, string>; places: string; collections?: string }
    sources: unknown[]
  }
  catalogPath: string
  relationshipsPath: string
  layerPaths: Record<string, string>
  placesDir: string
  collectionsPath?: string
}
export function readRelease(dataDir: string): Release
export function artifactPath(dataDir: string, rel: string): string
