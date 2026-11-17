import { describe, expect, it } from 'vitest'
import {
  formatRepairReport,
  newReport,
  repairFeatures,
  repairGeometry,
  ringSelfIntersections,
} from '../pipeline/lib/repair.mjs'

const sq = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]] // counter-clockwise
const hole = [[1, 1], [1, 2], [2, 2], [2, 1], [1, 1]] // clockwise

describe('repairGeometry', () => {
  it('passes a valid polygon through unchanged (same object, no counts)', () => {
    const g = { type: 'Polygon', coordinates: [sq, hole] }
    const r = repairGeometry(g)
    expect(r.geometry).toBe(g)
    expect(r.selfIntersections).toBe(0)
    expect(r.wrongWinding).toBe(0)
    expect(Object.values(r.stats).every((v) => v === 0)).toBe(true)
  })

  it('closes rings, removes duplicate vertices and drops degenerate holes', () => {
    const broken = {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [0, 0], [4, 0], [4, 4], [4, 4], [0, 4]], // unclosed, two duplicates
        hole,
        [[1, 1], [2, 2], [1, 1]], // degenerate hole
      ],
    }
    const r = repairGeometry(broken)
    expect(r.geometry).toEqual({ type: 'Polygon', coordinates: [sq, hole] })
    expect(r.stats).toMatchObject({ closedRings: 1, duplicateVertices: 2, droppedRings: 1 })
    expect(r.selfIntersections).toBe(0)
  })

  it('drops a polygon whose outer ring is degenerate, and the geometry when nothing is left', () => {
    const multi = { type: 'MultiPolygon', coordinates: [[sq], [[[5, 5], [6, 6], [5, 5]]]] }
    const r = repairGeometry(multi)
    expect(r.geometry).toEqual({ type: 'MultiPolygon', coordinates: [[sq]] })
    const gone = repairGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] })
    expect(gone.geometry).toBeNull()
    expect(gone.stats.droppedGeometries).toBe(1)
  })

  it('reports a bow-tie self-intersection and does not change the ring', () => {
    const bow = { type: 'Polygon', coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] }
    const r = repairGeometry(bow)
    expect(r.selfIntersections).toBe(1)
    expect(r.geometry).toBe(bow)
    expect(ringSelfIntersections(sq)).toBe(0)
  })

  it('reports winding and only rewrites it on request', () => {
    const cw = { type: 'Polygon', coordinates: [[...sq].reverse()] }
    const r = repairGeometry(cw)
    expect(r.wrongWinding).toBe(1)
    expect(r.geometry).toBe(cw)
    const fixed = repairGeometry(cw, { fixWinding: true })
    expect(fixed.geometry).toEqual({ type: 'Polygon', coordinates: [sq] })
    expect(fixed.stats.windingReversed).toBe(1)
  })

  it('removes duplicate line vertices and drops lines under 2 positions', () => {
    const r = repairGeometry({ type: 'MultiLineString', coordinates: [[[0, 0], [0, 0], [1, 1]], [[2, 2], [2, 2]]] })
    expect(r.geometry).toEqual({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] })
    expect(r.stats).toMatchObject({ duplicateVertices: 2, droppedLines: 1 })
    expect(repairGeometry({ type: 'LineString', coordinates: [[1, 1], [1, 1]] }).geometry).toBeNull()
  })
})

describe('repairFeatures', () => {
  it('tallies by source, drops empty features and lists self-intersections', () => {
    const f = (placeId: string, geometry: unknown) => ({ type: 'Feature', properties: { placeId }, geometry })
    const out = repairFeatures(
      [
        f('a', { type: 'Polygon', coordinates: [sq] }),
        f('b', { type: 'Polygon', coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] }),
        f('c', { type: 'LineString', coordinates: [[1, 1], [1, 1]] }),
      ],
      (x: { properties: { placeId: string } }) => (x.properties.placeId === 'c' ? 'src-line' : 'src-poly'),
    )
    expect(out.features.map((x: { properties: { placeId: string } }) => x.properties.placeId)).toEqual(['a', 'b'])
    expect(out.report.bySource['src-poly']).toMatchObject({ features: 2 })
    expect(out.report.bySource['src-line']).toMatchObject({ droppedLines: 1, droppedGeometries: 1 })
    expect(out.report.selfIntersections).toEqual([{ placeId: 'b', source: 'src-poly', count: 1 }])
    expect(out.report.dropped).toEqual([{ placeId: 'c', source: 'src-line' }])
    expect(formatRepairReport(out.report).join('\n')).toContain('self-intersection: b (src-poly)')
    expect(formatRepairReport(newReport())).toEqual(['geometry self-intersections: none'])
  })
})
