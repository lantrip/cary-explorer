// Resolves a published release through public/data/manifest.json, the only mutable file.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SAFE = /^[a-z0-9._/-]+$/

/** Rejects artifact paths that could escape the data dir or point off-site. */
export function artifactPath(dataDir, rel) {
  if (typeof rel !== 'string' || !rel) throw new Error(`unsafe artifact path: ${JSON.stringify(rel)}`)
  if (rel.startsWith('/') || rel.includes('..') || rel.includes('://') || !SAFE.test(rel)) {
    throw new Error(`unsafe artifact path: ${JSON.stringify(rel)}`)
  }
  return join(dataDir, rel)
}

export function readRelease(dataDir) {
  const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8'))
  const a = manifest.artifacts
  if (!a || typeof a !== 'object') throw new Error(`manifest in ${dataDir} has no "artifacts" (legacy or unpublished release)`)
  const layerPaths = {}
  for (const [name, rel] of Object.entries(a.layers ?? {})) layerPaths[name] = artifactPath(dataDir, rel)
  return {
    manifest,
    catalogPath: artifactPath(dataDir, a.catalog),
    relationshipsPath: artifactPath(dataDir, a.relationships),
    layerPaths,
    placesDir: artifactPath(dataDir, a.places),
    collectionsPath: a.collections ? artifactPath(dataDir, a.collections) : undefined,
  }
}
