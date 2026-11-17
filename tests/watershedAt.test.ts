import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readRelease } from '../pipeline/lib/release.mjs'
import { MY_WATERSHED_LABEL, intentLabel, parseIntent, type IntentContext } from '../src/features/search/intent'
import { TOWNS } from '../src/features/towns/coverage'
import { watershedAt, watershedLineText, type WatershedFeature } from '../src/features/watersheds/watershedAt'

const release = readRelease(fileURLToPath(new URL('../public/data', import.meta.url)))
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const water = readJson(release.layerPaths.water) as { features: { properties: { placeId: string }; geometry: WatershedFeature['geometry'] }[] }
const features: WatershedFeature[] = water.features.map((f) => ({ placeId: f.properties.placeId, geometry: f.geometry }))
const catalog = readJson(release.catalogPath) as { places: { id: string; name: string; centroid: [number, number] }[] }
const rels = readJson(release.relationshipsPath).relationships as { from: string; to: string; kind: string; basis?: string }[]

describe('watershedAt on synthetic shapes', () => {
  const ring = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  const donut: WatershedFeature = { placeId: 'donut', geometry: { type: 'Polygon', coordinates: [ring(0, 0, 10, 10), ring(4, 4, 6, 6)] } }
  const multi: WatershedFeature = {
    placeId: 'multi',
    geometry: { type: 'MultiPolygon', coordinates: [[ring(20, 0, 22, 2)], [ring(30, 0, 32, 2)]] },
  }
  it('respects holes and both polygon types', () => {
    expect(watershedAt([1, 1], [donut, multi])).toBe('donut')
    expect(watershedAt([5, 5], [donut, multi])).toBeNull()
    expect(watershedAt([31, 1], [donut, multi])).toBe('multi')
    expect(watershedAt([25, 1], [donut, multi])).toBeNull()
  })
  it('ignores lines and bad input', () => {
    const line: WatershedFeature = { placeId: 'creek', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }
    expect(watershedAt([0.5, 0.5], [line, { placeId: 'x', geometry: null }])).toBeNull()
    expect(watershedAt([NaN, 1], [donut])).toBeNull()
  })
})

describe('watershedAt on the published water layer', () => {
  const polygons = features.filter((f) => f.geometry && /Polygon/.test(f.geometry.type))
  it('has watershed polygons to test against', () => {
    expect(polygons.length).toBeGreaterThan(10)
  })
  it("puts Bond Park's centroid in the watershed its catalog link names", () => {
    const bond = catalog.places.find((p) => p.id === 'cary-park-fred-g-bond-metro-park')!
    const linked = rels.find((r) => r.from === bond.id && r.kind === 'contained' && r.basis === 'watershed')!
    expect(watershedAt(bond.centroid, polygons)).toBe(linked.to)
  })
  it('never puts a single-watershed park centroid in a different watershed than its link', () => {
    const byFrom = new Map<string, string[]>()
    for (const r of rels) {
      if (r.kind === 'contained' && r.basis === 'watershed' && r.from.startsWith('cary-park-')) byFrom.set(r.from, [...(byFrom.get(r.from) ?? []), r.to])
    }
    const single = [...byFrom].filter(([, to]) => to.length === 1)
    expect(single.length).toBeGreaterThan(5)
    let agreed = 0
    for (const [id, [to]] of single) {
      const place = catalog.places.find((p) => p.id === id)!
      const got = watershedAt(place.centroid, polygons)
      // A centroid can sit just outside an oddly shaped park, but never in a different watershed.
      expect(got === null || got === to).toBe(true)
      if (got === to) agreed++
    }
    expect(agreed).toBeGreaterThan(5)
  })
  it('names the watershed with the place-card wording', () => {
    const name = catalog.places.find((p) => p.id === 'watershed-030202010801')!.name
    expect(watershedLineText(name)).toBe(`In the ${name.replace(/ watershed$/i, '')} watershed`)
    expect(watershedLineText(name)).toMatch(/^In the .+ watershed$/)
    expect(watershedLineText(name)).not.toMatch(/flow|downstream|drinking|utilit/i)
  })
  it('returns null for a point outside every polygon', () => {
    expect(watershedAt([-70, 40], polygons)).toBeNull()
    expect(watershedAt([0, 0], polygons)).toBeNull()
  })
})

describe('"which watershed am I in" intent', () => {
  const ctx: IntentContext = { towns: TOWNS, categories: ['park', 'water'], places: [] }
  it.each(['which watershed am I in', 'What watershed am I in?', '  WHAT WATERSHED IS THIS POINT IN!! ', 'what watershed is this point in'])(
    'parses %j',
    (text) => {
      expect(parseIntent(text, ctx)).toEqual({ kind: 'my-watershed' })
    },
  )
  it('does not match other phrases', () => {
    expect(parseIntent('which watershed', ctx)).toBeNull()
    expect(parseIntent('watershed am I in today', ctx)).toBeNull()
  })
  it('offers a suggestion that says it uses the location', () => {
    expect(intentLabel({ kind: 'my-watershed' }, TOWNS, new Map())).toBe(MY_WATERSHED_LABEL)
    expect(MY_WATERSHED_LABEL).toMatch(/uses your location/)
  })
})
