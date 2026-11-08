import { describe, expect, it } from 'vitest'
import { createScope } from '../pipeline/lib/geo.mjs'
import { bboxOf, greenwayFeatures, normalize } from '../pipeline/scripts/build-catalog.mjs'
import { builtCatalog } from './helpers/builtCatalog'

const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
})
// core x 0..10, buffer x -5..15, crossing limit x -8..18
const scope = createScope({ core: rect(0, -5, 10, 5), nearby: rect(-5, -5, 15, 5), crossing: rect(-8, -5, 18, 5) })

describe('greenwayFeatures', () => {
  it('yields existing then proposed features with status', () => {
    const fs = greenwayFeatures('g', [[[1, 0], [2, 0]]], [[[3, 0], [4, 0]]], scope)
    expect(fs.map((f: any) => f.properties)).toEqual([
      { placeId: 'g', status: 'existing', outsideCore: false },
      { placeId: 'g', status: 'proposed', outsideCore: false },
    ])
    expect(fs[0].geometry.type).toBe('MultiLineString')
  })

  it('emits only existing when nothing is proposed, and cuts proposed past the crossing limit', () => {
    expect(greenwayFeatures('g', [[[1, 0], [2, 0]]], [], scope).map((f: any) => f.properties.status)).toEqual(['existing'])
    const far = greenwayFeatures('g', [[[1, 0], [2, 0]]], [[[30, 0], [31, 0]]], scope)
    expect(far.map((f: any) => f.properties.status)).toEqual(['existing'])
  })
})

describe('built greenways', () => {
  const out = builtCatalog()
  const green = out.outputs['layers/greenways.geojson']
  const features = JSON.parse(green).features

  it('gives every feature a lowercase status and lists existing first per place', () => {
    const seen = new Map<string, string[]>()
    for (const f of features) {
      expect(['existing', 'proposed']).toContain(f.properties.status)
      seen.set(f.properties.placeId, [...(seen.get(f.properties.placeId) ?? []), f.properties.status])
    }
    for (const statuses of seen.values()) expect(statuses[0]).toBe('existing')
    expect(features.some((f: any) => f.properties.status === 'proposed')).toBe(true)
  })

  it('creates no place or feature for proposed-only greenways, and ignores proposed in the bbox', () => {
    const trails = out.catalog.places.filter((p: any) => p.sourceIds.includes('cary-greenways'))
    const placeIds = new Set(trails.map((p: any) => p.id))
    const layered = new Set(out.catalog.places.filter((p: any) => p.sourceIds.some((s: string) => s === 'cary-greenways' || s === 'wake-greenways')).map((p: any) => p.id))
    expect(features.every((f: any) => layered.has(f.properties.placeId))).toBe(true)
    expect(trails.every((p: any) => placeIds.has(p.id))).toBe(true)
    const names = new Set(trails.map((p: any) => normalize(p.name)))
    expect(names.size).toBe(trails.length)
    for (const p of trails) {
      const own = features.filter((f: any) => f.properties.placeId === p.id && f.properties.status === 'existing')
      const pts = own.flatMap((f: any) => f.geometry.coordinates.flat())
      const [minX, minY, maxX, maxY] = bboxOf(pts)
      expect((p.bbox as number[])[0]).toBeLessThanOrEqual(minX + 1e-6)
      expect((p.bbox as number[])[1]).toBeLessThanOrEqual(minY + 1e-6)
      expect((p.bbox as number[])[2]).toBeGreaterThanOrEqual(maxX - 1e-6)
      expect((p.bbox as number[])[3]).toBeGreaterThanOrEqual(maxY - 1e-6)
    }
  })
})
