import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../pipeline/scripts/build-catalog.mjs'
// @ts-expect-error untyped .mjs pipeline module
import { publish } from '../pipeline/scripts/publish.mjs'
import { builtCatalog } from './helpers/builtCatalog'

const dir = mkdtempSync(join(tmpdir(), 'determinism-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const hashes = (root: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else out[f.slice(root.length)] = createHash('sha256').update(readFileSync(f)).digest('hex')
    }
  }
  walk(root)
  return out
}

const stageAndPublish = (outputs: Record<string, string>, name: string) => {
  const staging = join(dir, name, 'staging')
  for (const [file, text] of Object.entries(outputs)) {
    mkdirSync(dirname(join(staging, file)), { recursive: true })
    writeFileSync(join(staging, file), text)
  }
  const outDir = join(dir, name, 'out')
  // allowStale + no last-run/overrides: nothing outside the staged snapshot build may influence the result.
  const res = publish({ stagingDir: staging, outDir, lastRunPath: join(dir, 'none.json'), overridesPath: join(dir, 'none-overrides.json'), env: {}, allowStale: true })
  expect(res.errors).toEqual([])
  return outDir
}

describe('release determinism', () => {
  it('two builds from the same snapshots are byte-identical, and so are the published release files', () => {
    const first = builtCatalog()
    const second = build({ write: false })
    expect(Object.keys(second.outputs)).toEqual(Object.keys(first.outputs))
    for (const [file, text] of Object.entries(first.outputs)) expect(second.outputs[file], file).toBe(text)
    expect(second.geometryRepair).toEqual(first.geometryRepair)

    const a = hashes(stageAndPublish(first.outputs, 'a'))
    const b = hashes(stageAndPublish(second.outputs, 'b'))
    expect(b).toEqual(a)
    expect(Object.keys(a)).toContain('/manifest.json')
  }, 60_000)

  it('the manifest carries one registry entry per catalog source, with no invented dates', () => {
    const built = builtCatalog()
    const manifest = JSON.parse(readFileSync(join(stageAndPublish(built.outputs, 'registry'), 'manifest.json'), 'utf8'))
    expect(manifest.sources.map((s: { id: string }) => s.id)).toEqual((built.catalog.sources as { id: string }[]).map((s) => s.id).sort())
    for (const s of manifest.sources) {
      expect(s.title, s.id).toBeTruthy()
      expect(s.attribution, s.id).toBeTruthy()
      expect(s.coverage, s.id).toBeTruthy()
      expect(s.licence, s.id).toBeTruthy()
      expect(s.retrievedAt, s.id).toBeTruthy()
      if ('sourceModified' in s) expect(Number.isFinite(Date.parse(s.sourceModified)), s.id).toBe(true)
    }
    // USGS snapshots state no modified date, so the field is absent rather than guessed.
    expect(manifest.sources.find((s: { id: string }) => s.id === 'usgs-wbd-huc12')).not.toHaveProperty('sourceModified')
    expect(manifest.sources.find((s: { id: string }) => s.id === 'wake-parks').sourceModified).toBe('2026-09-01T14:36:42.334Z')
  }, 60_000)
})
