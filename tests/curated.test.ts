import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { curatedRelationships, loadCurated } from '../pipeline/lib/curated.mjs'
import { build } from '../pipeline/scripts/build-catalog.mjs'
import { parseRelationships } from '../src/features/places/relationships'

const ids = new Set(['a', 'b', 'c'])
const entry = { from: 'a', to: 'b', note: 'Linked on the town map.', source: 'https://example.org/map' }
const fixture = fileURLToPath(new URL('./fixtures/curated-valid.json', import.meta.url))
const committed = fileURLToPath(new URL('../pipeline/relationships.curated.json', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'curated-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('curatedRelationships', () => {
  it('emits a valid entry as a curated relationship the app parses', () => {
    const out = curatedRelationships([entry], ids)
    expect(out).toEqual([{ from: 'a', to: 'b', kind: 'curated', evidence: 'Linked on the town map. Source: https://example.org/map' }])
    expect(parseRelationships({ relationships: out })).toEqual([{ from: 'a', to: 'b', kind: 'curated' }])
  })
  it('accepts an empty list', () => {
    expect(curatedRelationships([], ids)).toEqual([])
  })
  it('fails on an unknown id', () => {
    expect(() => curatedRelationships([{ ...entry, to: 'ghost' }], ids)).toThrow(/"to" id "ghost" is not in the catalog/)
  })
  it('fails when the source is missing, empty or not https', () => {
    expect(() => curatedRelationships([{ ...entry, source: undefined }], ids)).toThrow(/"source" is required/)
    expect(() => curatedRelationships([{ ...entry, source: '  ' }], ids)).toThrow(/"source" is required/)
    expect(() => curatedRelationships([{ ...entry, source: 'http://example.org' }], ids)).toThrow(/must be an https URL/)
    expect(() => curatedRelationships([{ ...entry, source: 'not a url' }], ids)).toThrow(/must be an https URL/)
  })
  it('fails when the note is missing or from equals to', () => {
    expect(() => curatedRelationships([{ ...entry, note: '' }], ids)).toThrow(/"note" is required/)
    expect(() => curatedRelationships([{ ...entry, to: 'a' }], ids)).toThrow(/same place/)
  })
  it('fails on a duplicate pair, in either order', () => {
    expect(() => curatedRelationships([entry, { ...entry }], ids)).toThrow(/duplicates entry 1/)
    expect(() => curatedRelationships([entry, { ...entry, from: 'b', to: 'a' }], ids)).toThrow(/duplicates entry 1/)
  })
  it('reports every problem at once', () => {
    expect(() => curatedRelationships([{ ...entry, to: 'ghost' }, { ...entry, from: 'c', source: '' }], ids)).toThrow(/entry 1[\s\S]*entry 2/)
  })
})

describe('loadCurated', () => {
  it('treats a missing file as empty and rejects a non-array', () => {
    expect(loadCurated(join(tmp, 'missing.json'))).toEqual([])
    writeFileSync(join(tmp, 'object.json'), '{}')
    expect(() => loadCurated(join(tmp, 'object.json'))).toThrow(/JSON array/)
    writeFileSync(join(tmp, 'broken.json'), '[')
    expect(() => loadCurated(join(tmp, 'broken.json'))).toThrow(/not valid JSON/)
  })
  it('ships empty: no real curated link has a source yet', () => {
    expect(JSON.parse(readFileSync(committed, 'utf8'))).toEqual([])
  })
})

describe('build with a curated file', () => {
  it('emits the fixture link as kind curated and fails on an unknown id', { timeout: 60_000 }, () => {
    const withLink = build({ write: false, curatedPath: fixture })
    const curated = withLink.relationships.relationships.filter((r) => r.kind === 'curated')
    expect(curated).toHaveLength(1)
    expect(curated[0]).toMatchObject({
      from: 'cary-park-new-hope-church-road-trailhead-park',
      to: 'cary-greenway-american-tobacco-trail',
    })
    writeFileSync(join(tmp, 'bad.json'), JSON.stringify([{ ...JSON.parse(readFileSync(fixture, 'utf8'))[0], to: 'no-such-place' }]))
    expect(() => build({ write: false, curatedPath: join(tmp, 'bad.json') })).toThrow(/is not in the catalog/)
  })
})
