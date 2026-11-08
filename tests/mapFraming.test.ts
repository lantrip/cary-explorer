import { describe, expect, it } from 'vitest'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import { fromLonLat } from 'ol/proj'
import { geometryStyleFor } from '../src/features/map/geometryStyles'
import { pickBest } from '../src/features/map/picking'
import { FRAME_MAX_ZOOM, geometryExtent, planFrame, selectedGeometryFeatures, shouldFrame } from '../src/features/map/framing'
import type { FramedState } from '../src/features/map/framing'

describe('pickBest', () => {
  it('prefers pins and clusters over lines over areas', () => {
    const area = { kind: 'area' as const, id: 'area' }
    const line = { kind: 'line' as const, id: 'line' }
    const pin = { kind: 'pin' as const, id: 'pin' }
    expect(pickBest([area, line, pin])).toBe(pin)
    expect(pickBest([area, line])).toBe(line)
    expect(pickBest([line, area])).toBe(line)
    expect(pickBest([area])).toBe(area)
  })
  it('keeps the first of equal kinds and returns undefined for no hits', () => {
    const a = { kind: 'line' as const, id: 'a' }
    const b = { kind: 'line' as const, id: 'b' }
    expect(pickBest([a, b])).toBe(a)
    expect(pickBest([])).toBeUndefined()
  })
})

describe('planFrame', () => {
  const lineFeature = new Feature(new LineString([fromLonLat([-78.9, 35.8]), fromLonLat([-78.8, 35.9])]))
  const bbox: [number, number, number, number] = [-79, 35.7, -78.7, 36]

  it('prefers the geometry extent over the bbox', () => {
    const plan = planFrame({ bbox }, [lineFeature])
    expect(plan.kind).toBe('geometry')
    expect(plan.kind === 'geometry' && plan.extent).toEqual(geometryExtent([lineFeature]))
  })
  it('falls back to the bbox, then to the centroid', () => {
    const plan = planFrame({ bbox }, [])
    expect(plan.kind).toBe('bbox')
    if (plan.kind === 'bbox') expect(plan.extent[0]).toBeCloseTo(fromLonLat([-79, 35.7])[0], 3)
    expect(planFrame({ bbox }, undefined).kind).toBe('bbox')
    expect(planFrame({}, undefined).kind).toBe('centroid')
    expect(planFrame({}, []).kind).toBe('centroid')
  })
  it('unions several features', () => {
    const other = new Feature(new LineString([fromLonLat([-78.5, 35.5]), fromLonLat([-78.4, 35.6])]))
    const [minX, minY, maxX, maxY] = geometryExtent([lineFeature, other])!
    expect(minX).toBeCloseTo(fromLonLat([-78.9, 35.8])[0], 3)
    expect(maxX).toBeCloseTo(fromLonLat([-78.4, 35.6])[0], 3)
    expect(minY).toBeLessThan(maxY)
  })
  it('caps the zoom at 17', () => {
    expect(FRAME_MAX_ZOOM).toBe(17)
  })
})

describe('shouldFrame', () => {
  const framed = (kind: FramedState['kind'], moved = false): FramedState => ({ placeId: 'a', kind, moved })

  it('frames a new selection, but not one from a shared link that carries a camera', () => {
    expect(shouldFrame('selection', { origin: 'user', framed: null, hasGeometry: true })).toBe(true)
    expect(shouldFrame('selection', { origin: 'url', framed: null, hasGeometry: true })).toBe(false)
  })
  it('re-frames when the sheet or panel changes', () => {
    expect(shouldFrame('layout', { origin: 'user', framed: framed('geometry', true), hasGeometry: true })).toBe(true)
    expect(shouldFrame('layout', { origin: 'url', framed: framed('shared'), hasGeometry: true })).toBe(true)
  })
  it('refits once to late geometry after a bbox or centroid frame', () => {
    expect(shouldFrame('geometry', { origin: 'user', framed: framed('bbox'), hasGeometry: true })).toBe(true)
    expect(shouldFrame('geometry', { origin: 'user', framed: framed('centroid'), hasGeometry: true })).toBe(true)
  })
  it('does not refit to late geometry when the user moved, it is already geometry, or the place has none', () => {
    expect(shouldFrame('geometry', { origin: 'user', framed: framed('bbox', true), hasGeometry: true })).toBe(false)
    expect(shouldFrame('geometry', { origin: 'user', framed: framed('geometry'), hasGeometry: true })).toBe(false)
    expect(shouldFrame('geometry', { origin: 'user', framed: framed('centroid'), hasGeometry: false })).toBe(false)
    expect(shouldFrame('geometry', { origin: 'user', framed: null, hasGeometry: true })).toBe(false)
  })
  it('never refits a shared-link camera when layers arrive', () => {
    expect(shouldFrame('geometry', { origin: 'url', framed: framed('shared'), hasGeometry: true })).toBe(false)
  })
})

describe('selectedGeometryFeatures', () => {
  it('returns distinct copies with the same properties and geometry, and the selected style is the casing pair', () => {
    const original = new Feature(new LineString([fromLonLat([-78.9, 35.8]), fromLonLat([-78.8, 35.9])]))
    original.setProperties({ placeId: 'a', kind: 'line', status: 'proposed' }, true)
    const [copy] = selectedGeometryFeatures([original], 'parks-trails')
    expect(copy).not.toBe(original)
    expect(copy.getGeometry()!.getExtent()).toEqual(original.getGeometry()!.getExtent())
    expect(copy.get('placeId')).toBe('a')
    expect(copy.get('theme')).toBe('parks-trails')
    expect(original.get('theme')).toBeUndefined()
    const style = geometryStyleFor(copy.get('kind'), copy.get('status'), copy.get('theme'), true)
    expect(Array.isArray(style) && style.map((s) => s.getStroke()!.getWidth())).toEqual([7, 4])
    expect(selectedGeometryFeatures(undefined, 'water')).toEqual([])
  })
})
