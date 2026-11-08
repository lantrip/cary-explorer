// Trail line and park area data: parsed from the two layer GeoJSON files, indexed by place, and shared through one small store.
import { useEffect, useSyncExternalStore } from 'react'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import MultiLineString from 'ol/geom/MultiLineString'
import MultiPolygon from 'ol/geom/MultiPolygon'
import Polygon from 'ol/geom/Polygon'
import type Geometry from 'ol/geom/Geometry'
import { fromLonLat } from 'ol/proj'
import { fetchBoundedJson } from '../../lib/boundedJson'
import { isRecord } from '../../lib/guards'
import { getRelease } from '../places/release'

export type GeometryStatus = 'existing' | 'proposed'
export type GeometryKind = 'line' | 'area'
export type LayerLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export const LAYER_NAMES = ['greenways', 'parks', 'water'] as const
const LAYER_MAX_BYTES = 2 * 1024 * 1024

const isPosition = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length >= 2 &&
  typeof v[0] === 'number' &&
  typeof v[1] === 'number' &&
  Math.abs(v[0]) <= 180 &&
  Math.abs(v[1]) <= 90
const isLine = (v: unknown): v is number[][] => Array.isArray(v) && v.length >= 2 && v.every(isPosition)
const isRing = (v: unknown): v is number[][] => Array.isArray(v) && v.length >= 4 && v.every(isPosition)
const isPolygon = (v: unknown): v is number[][][] => Array.isArray(v) && v.length >= 1 && v.every(isRing)

const project = (p: number[]) => fromLonLat([p[0], p[1]])
const projectLine = (line: number[][]) => line.map(project)
const projectPolygon = (rings: number[][][]) => rings.map(projectLine)

/** GeoJSON geometry (EPSG:4326) to an OpenLayers geometry (EPSG:3857), or null when it is not a usable line or polygon. */
function buildGeometry(raw: unknown): { geometry: Geometry; kind: GeometryKind } | null {
  if (!isRecord(raw)) return null
  const c = raw.coordinates
  switch (raw.type) {
    case 'LineString':
      return isLine(c) ? { geometry: new LineString(projectLine(c)), kind: 'line' } : null
    case 'MultiLineString':
      return Array.isArray(c) && c.length >= 1 && c.every(isLine)
        ? { geometry: new MultiLineString(c.map(projectLine)), kind: 'line' }
        : null
    case 'Polygon':
      return isPolygon(c) ? { geometry: new Polygon(projectPolygon(c)), kind: 'area' } : null
    case 'MultiPolygon':
      return Array.isArray(c) && c.length >= 1 && c.every(isPolygon)
        ? { geometry: new MultiPolygon(c.map(projectPolygon)), kind: 'area' }
        : null
    default:
      return null
  }
}

/** A missing or unknown status counts as existing; only "proposed" is proposed. */
export function normalizeStatus(value: unknown): GeometryStatus {
  return typeof value === 'string' && value.trim().toLowerCase() === 'proposed' ? 'proposed' : 'existing'
}

/** Parses one layer file. Throws when it is not a FeatureCollection; drops individual bad features. */
export function parseLayerFeatures(raw: unknown): Feature[] {
  if (!isRecord(raw) || !Array.isArray(raw.features)) throw new Error('Layer is not a GeoJSON FeatureCollection.')
  const out: Feature[] = []
  for (const item of raw.features) {
    if (!isRecord(item)) continue
    const props = isRecord(item.properties) ? item.properties : null
    const placeId = props?.placeId
    if (typeof placeId !== 'string' || placeId.trim() === '') continue
    const built = buildGeometry(item.geometry)
    if (!built) continue
    const feature = new Feature(built.geometry)
    feature.setProperties(
      { placeId, kind: built.kind, status: built.kind === 'line' ? normalizeStatus(props?.status) : 'existing' },
      true,
    )
    out.push(feature)
  }
  return out
}

export type GeometryIndex = ReadonlyMap<string, Feature[]>

export function buildGeometryIndex(features: readonly Feature[]): GeometryIndex {
  const index = new Map<string, Feature[]>()
  for (const f of features) {
    const id = f.get('placeId') as string
    const list = index.get(id)
    if (list) list.push(f)
    else index.set(id, [f])
  }
  return index
}

/** True when any of a place's features is a proposed part. */
export function hasProposedPart(features: readonly Feature[] | undefined): boolean {
  return features?.some((f) => f.get('status') === 'proposed') ?? false
}

export interface GeometryState {
  status: LayerLoadStatus
  /** placeId to its features (EPSG:3857). The identity changes only when new data arrives. */
  index: GeometryIndex
  lines: Feature[]
  areas: Feature[]
  error?: string
}

export interface GeometryLoad {
  features: Feature[]
  /** One message per layer file that failed. */
  failures: string[]
}
export type GeometryLoader = (signal: AbortSignal) => Promise<GeometryLoad>

const NO_FEATURES: Feature[] = []
const EMPTY_INDEX: GeometryIndex = new Map()
const IDLE: GeometryState = { status: 'idle', index: EMPTY_INDEX, lines: NO_FEATURES, areas: NO_FEATURES }

const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError'

/** Loads the files named in the release manifest. A failed file is reported; the other still loads. */
export async function loadGeometry(signal: AbortSignal): Promise<GeometryLoad> {
  const release = await getRelease()
  const names = LAYER_NAMES.filter((n) => release.layerUrls[n])
  const settled = await Promise.allSettled(
    names.map(async (name) =>
      parseLayerFeatures(
        await fetchBoundedJson(release.layerUrls[name], {
          signal,
          maxBytes: LAYER_MAX_BYTES,
          label: `The ${name} layer`,
          budgetMessage: `The ${name} layer exceeds the download budget.`,
        }),
      ),
    ),
  )
  const features: Feature[] = []
  const failures: string[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') features.push(...r.value)
    else failures.push(r.reason instanceof Error ? r.reason.message : `Could not load the ${names[i]} layer.`)
  })
  return { features, failures }
}

export interface GeometryStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => GeometryState
  /** Starts the single shared load when idle. */
  ensureLoaded: () => void
  /** Loads again after a failure; earlier features stay in place until the new load finishes. */
  retry: () => void
}

export function createGeometryStore(load: GeometryLoader = loadGeometry): GeometryStore {
  let state: GeometryState = IDLE
  let controller: AbortController | null = null
  const listeners = new Set<() => void>()

  function set(next: GeometryState) {
    state = next
    listeners.forEach((l) => l())
  }

  function start() {
    const own = new AbortController()
    controller = own
    set({ ...state, status: 'loading', error: undefined })
    load(own.signal).then(
      ({ features, failures }) => {
        if (controller !== own) return
        controller = null
        const index = buildGeometryIndex(features)
        const data = {
          index,
          lines: features.filter((f) => f.get('kind') === 'line'),
          areas: features.filter((f) => f.get('kind') === 'area'),
        }
        set(failures.length ? { status: 'error', ...data, error: failures.join(' ') } : { status: 'ready', ...data })
      },
      (err: unknown) => {
        if (controller !== own || own.signal.aborted || isAbort(err)) return
        controller = null
        set({ ...state, status: 'error', error: err instanceof Error ? err.message : 'Could not load the layers.' })
      },
    )
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => state,
    ensureLoaded() {
      if (state.status === 'idle') start()
    },
    retry() {
      if (state.status === 'error') start()
    },
  }
}

export const geometryStore = createGeometryStore()

export interface GeometryLayers extends GeometryState {
  retry: () => void
}

export function useGeometryLayers(): GeometryLayers & { status: Exclude<LayerLoadStatus, 'idle'> } {
  const snapshot = useSyncExternalStore(geometryStore.subscribe, geometryStore.getSnapshot)
  useEffect(() => {
    geometryStore.ensureLoaded()
  }, [])
  return { ...snapshot, status: snapshot.status === 'idle' ? 'loading' : snapshot.status, retry: geometryStore.retry }
}
