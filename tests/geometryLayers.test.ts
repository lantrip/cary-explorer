import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toLonLat } from 'ol/proj'
import {
  buildGeometryIndex,
  createGeometryStore,
  hasProposedPart,
  normalizeStatus,
  parseLayerFeatures,
} from '../src/features/map/layers'
import {
  AREA_LAYER_MIN_ZOOM,
  AREA_MIN_ZOOM,
  CASING_WIDTH,
  LAYER_Z,
  PROPOSED_LINE_DASH,
  geometryStyleFor,
  getLineStyle,
} from '../src/features/map/geometryStyles'
import { parseCatalog } from '../src/features/places/catalog'

const line = [[-78.9, 35.8], [-78.91, 35.81]]
const ring = [[-78.9, 35.8], [-78.91, 35.8], [-78.91, 35.81], [-78.9, 35.8]]
const feat = (props: unknown, geometry: unknown) => ({ type: 'Feature', properties: props, geometry })
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features })

describe('parseLayerFeatures', () => {
  it('keeps lines and areas, projects to EPSG:3857 and sets placeId, status and kind', () => {
    const out = parseLayerFeatures(
      collection(
        feat({ placeId: 'a', status: 'proposed' }, { type: 'MultiLineString', coordinates: [line] }),
        feat({ placeId: 'b' }, { type: 'MultiPolygon', coordinates: [[ring]] }),
      ),
    )
    expect(out.map((f) => [f.get('placeId'), f.get('kind'), f.get('status')])).toEqual([
      ['a', 'line', 'proposed'],
      ['b', 'area', 'existing'],
    ])
    const [lon, lat] = toLonLat(out[0].getGeometry()!.getExtent().slice(0, 2))
    expect(lon).toBeCloseTo(-78.91, 4)
    expect(lat).toBeCloseTo(35.8, 4)
  })

  it('drops features with a bad placeId, geometry type or coordinates', () => {
    const out = parseLayerFeatures(
      collection(
        feat({ placeId: '' }, { type: 'LineString', coordinates: line }),
        feat({ placeId: '  ' }, { type: 'LineString', coordinates: line }),
        feat({ placeId: 5 }, { type: 'LineString', coordinates: line }),
        feat({}, { type: 'LineString', coordinates: line }),
        feat(null, { type: 'LineString', coordinates: line }),
        feat({ placeId: 'p' }, { type: 'Point', coordinates: [-78.9, 35.8] }),
        feat({ placeId: 'p' }, null),
        feat({ placeId: 'p' }, { type: 'LineString', coordinates: [[-78.9, 35.8]] }),
        feat({ placeId: 'p' }, { type: 'LineString', coordinates: [[-78.9, 'x'], [1, 2]] }),
        feat({ placeId: 'p' }, { type: 'LineString', coordinates: [[-978.9, 35.8], [1, 2]] }),
        feat({ placeId: 'p' }, { type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] }),
        'junk',
        null,
        feat({ placeId: 'ok' }, { type: 'LineString', coordinates: line }),
      ),
    )
    expect(out.map((f) => f.get('placeId'))).toEqual(['ok'])
  })

  it('throws when the file is not a FeatureCollection', () => {
    expect(() => parseLayerFeatures(null)).toThrow()
    expect(() => parseLayerFeatures({ type: 'FeatureCollection' })).toThrow()
    expect(() => parseLayerFeatures([])).toThrow()
  })

  it('normalises status: only "proposed" is proposed, a missing status is existing', () => {
    expect(normalizeStatus('proposed')).toBe('proposed')
    expect(normalizeStatus(' Proposed ')).toBe('proposed')
    expect(normalizeStatus('existing')).toBe('existing')
    expect(normalizeStatus(undefined)).toBe('existing')
    expect(normalizeStatus(3)).toBe('existing')
    expect(normalizeStatus('under construction')).toBe('existing')
    const [f] = parseLayerFeatures(collection(feat({ placeId: 'a' }, { type: 'LineString', coordinates: line })))
    expect(f.get('status')).toBe('existing')
  })

  it('indexes by placeId and reports proposed parts', () => {
    const features = parseLayerFeatures(
      collection(
        feat({ placeId: 'a', status: 'existing' }, { type: 'LineString', coordinates: line }),
        feat({ placeId: 'a', status: 'proposed' }, { type: 'LineString', coordinates: line }),
        feat({ placeId: 'b' }, { type: 'Polygon', coordinates: [ring] }),
      ),
    )
    const index = buildGeometryIndex(features)
    expect(index.get('a')).toHaveLength(2)
    expect(index.get('b')).toHaveLength(1)
    expect(index.get('c')).toBeUndefined()
    expect(hasProposedPart(index.get('a'))).toBe(true)
    expect(hasProposedPart(index.get('b'))).toBe(false)
    expect(hasProposedPart(undefined)).toBe(false)
  })
})

describe('geometry store', () => {
  const features = () =>
    parseLayerFeatures(
      collection(
        feat({ placeId: 'a' }, { type: 'LineString', coordinates: line }),
        feat({ placeId: 'b' }, { type: 'Polygon', coordinates: [ring] }),
      ),
    )

  it('loads once, splits lines and areas, and exposes the index', async () => {
    let calls = 0
    const store = createGeometryStore(async () => {
      calls += 1
      return { features: features(), failures: [] }
    })
    expect(store.getSnapshot().status).toBe('idle')
    store.ensureLoaded()
    store.ensureLoaded()
    expect(store.getSnapshot().status).toBe('loading')
    await new Promise((r) => setTimeout(r))
    const s = store.getSnapshot()
    expect(calls).toBe(1)
    expect(s.status).toBe('ready')
    expect(s.lines).toHaveLength(1)
    expect(s.areas).toHaveLength(1)
    expect(s.index.get('b')).toHaveLength(1)
  })

  it('reports an error and retries, keeping loaded data in between', async () => {
    let fail = true
    const store = createGeometryStore(async () => {
      if (fail) throw new Error('boom')
      return { features: features(), failures: [] }
    })
    store.ensureLoaded()
    await new Promise((r) => setTimeout(r))
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: 'boom' })
    fail = false
    store.retry()
    expect(store.getSnapshot().status).toBe('loading')
    await new Promise((r) => setTimeout(r))
    expect(store.getSnapshot().status).toBe('ready')
    store.retry() // no-op when ready
    expect(store.getSnapshot().status).toBe('ready')
  })

  it('a partly failed load is an error but keeps the features that did load', async () => {
    const store = createGeometryStore(async () => ({ features: features(), failures: ['parks failed'] }))
    store.ensureLoaded()
    await new Promise((r) => setTimeout(r))
    expect(store.getSnapshot()).toMatchObject({ status: 'error', error: 'parks failed' })
    expect(store.getSnapshot().lines).toHaveLength(1)
  })
})

describe('layer order and styles', () => {
  it('stacks basemap < areas < lines < clusters < selected geometry < selected pin', () => {
    const order = [LAYER_Z.basemap, LAYER_Z.areas, LAYER_Z.lines, LAYER_Z.clusters, LAYER_Z.selectedGeometry, LAYER_Z.selectedPin]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(new Set(order).size).toBe(order.length)
  })

  it('shows park areas from zoom 13 (minZoom is exclusive)', () => {
    expect(AREA_MIN_ZOOM).toBe(13)
    expect(AREA_LAYER_MIN_ZOOM).toBeLessThan(13)
    expect(AREA_LAYER_MIN_ZOOM).toBeGreaterThan(12.99)
  })

  it('existing trails are 3 px solid; proposed are 2 px dashed and fainter', () => {
    const existing = getLineStyle('parks-trails', 'existing').getStroke()!
    const proposed = getLineStyle('parks-trails', 'proposed').getStroke()!
    expect(existing.getWidth()).toBe(3)
    expect(existing.getLineDash()).toBeNull()
    expect(existing.getColor()).toBe('#2F7A4A')
    expect(proposed.getWidth()).toBe(2)
    expect(proposed.getLineDash()).toEqual(PROPOSED_LINE_DASH)
    expect(String(proposed.getColor())).toMatch(/^rgba\(47,122,74,0\.6\)$/)
  })

  it('areas use a ~25% theme fill and a 1 px stroke', () => {
    const style = geometryStyleFor('area', 'existing', 'parks-trails', false) as ReturnType<typeof getLineStyle>
    expect(style.getFill()!.getColor()).toBe('rgba(47,122,74,0.25)')
    expect(style.getStroke()!.getWidth()).toBe(1)
  })

  it('selected lines get a 7 px white casing under a 4 px line; proposed is dashed inside the casing', () => {
    const solid = geometryStyleFor('line', 'existing', 'parks-trails', true) as ReturnType<typeof getLineStyle>[]
    expect(solid.map((s) => s.getStroke()!.getWidth())).toEqual([CASING_WIDTH, 4])
    expect(solid[0].getStroke()!.getColor()).toBe('#ffffff')
    expect(solid[1].getStroke()!.getLineDash()).toBeNull()
    const dashed = geometryStyleFor('line', 'proposed', 'parks-trails', true) as ReturnType<typeof getLineStyle>[]
    expect(dashed[0].getStroke()!.getLineDash()).toBeNull()
    expect(dashed[1].getStroke()!.getLineDash()).toEqual(PROPOSED_LINE_DASH)
  })

  it('selected areas are stronger: more fill and a 2 px stroke', () => {
    const style = geometryStyleFor('area', 'existing', 'parks-trails', true) as ReturnType<typeof getLineStyle>
    expect(style.getFill()!.getColor()).toBe('rgba(47,122,74,0.4)')
    expect(style.getStroke()!.getWidth()).toBe(2)
  })

  it('returns the same cached style objects', () => {
    expect(geometryStyleFor('line', 'existing', 'water', false)).toBe(geometryStyleFor('line', 'existing', 'water', false))
    expect(geometryStyleFor('line', 'existing', 'water', true)).toBe(geometryStyleFor('line', 'existing', 'water', true))
    expect(geometryStyleFor('line', 'existing', 'water', false)).not.toBe(geometryStyleFor('line', 'existing', 'history', false))
  })
})

// The real published layer files, found through the manifest (the pipeline may republish with new hashes).
describe('published layer files', () => {
  const dataDir = join(__dirname, '..', 'public', 'data')
  const manifest = JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8')) as {
    artifacts: { catalog: string; layers: Record<string, string> }
  }
  const read = (rel: string) => JSON.parse(readFileSync(join(dataDir, rel), 'utf8')) as unknown
  const catalog = parseCatalog(read(manifest.artifacts.catalog))
  const placeIds = new Set(catalog.places.map((p) => p.id))

  for (const name of ['greenways', 'parks'] as const) {
    it(`${name}: every feature parses and links to a catalog place`, () => {
      const raw = read(manifest.artifacts.layers[name]) as { features: unknown[] }
      const features = parseLayerFeatures(raw)
      expect(features.length).toBe(raw.features.length)
      expect(features.length).toBeGreaterThan(0)
      for (const f of features) {
        expect(placeIds.has(f.get('placeId') as string)).toBe(true)
        expect(['existing', 'proposed']).toContain(f.get('status'))
        expect(f.get('kind')).toBe(name === 'greenways' ? 'line' : 'area')
      }
    })
  }
})
