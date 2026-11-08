// Pure parse/serialise of the shareable URL state (query string). No DOM access: safe to unit test in Node.
import type { ThemeId } from '../types/place'
import { isTownSlug } from '../features/towns/coverage'
import { parseAmenitiesParam, serializeAmenities } from '../features/places/amenities'
import type { AmenityKey } from '../types/place'
import { parseLayers, serializeLayers, type LayerOverrides } from '../features/themes/layerSelection'

export type UrlView = 'map' | 'list'
export interface UrlCamera {
  zoom: number
  lat: number
  lon: number
}
export interface UrlState {
  place: string | null
  themes: ThemeId[]
  /** Layer switches that differ from the theme defaults; absent or empty means defaults. */
  layers?: LayerOverrides
  /** Active amenity filters; absent or empty means none. */
  amenities?: AmenityKey[]
  view: UrlView
  q: string
  town: string | null
  map: UrlCamera | null
  /** The Credits & privacy dialog is open (`about=1`). Absent means closed. */
  about?: boolean
  /** Open curated collection id (`collection=<id>`); validated against the release by the app. */
  collection?: string | null
}
/** What a URL can contain; absent keys mean "not specified". */
export type ParsedUrlState = Partial<{
  place: string
  themes: ThemeId[]
  layers: LayerOverrides
  amenities: AmenityKey[]
  view: UrlView
  q: string
  town: string
  map: UrlCamera
  about: true
  collection: string
}>

export const ALL_THEME_IDS: readonly ThemeId[] = ['parks-trails', 'history', 'birds-wildlife', 'water', 'art-community']
export const DEFAULT_CAMERA: UrlCamera = { zoom: 12, lat: 35.7915, lon: -78.7811 }
export const ZOOM_RANGE = { min: 8, max: 20 }
export const LAT_RANGE = { min: 35.0, max: 36.6 }
export const LON_RANGE = { min: -79.6, max: -78.0 }
export const MAX_QUERY_LENGTH = 200
const COLLECTION_ID = /^[a-z0-9-]{1,60}$/
const PLACE_ID = /^[a-z0-9-]{1,120}$/
const NUMBER = /^-?\d{1,6}(\.\d{1,12})?$/

function num(s: string): number | null {
  if (!NUMBER.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function parseCamera(raw: string): UrlCamera | null {
  if (raw.length > 60) return null
  const parts = raw.split('/')
  if (parts.length !== 3) return null
  const [z, la, lo] = parts.map(num)
  if (z === null || la === null || lo === null) return null
  if (la < LAT_RANGE.min || la > LAT_RANGE.max || lo < LON_RANGE.min || lo > LON_RANGE.max) return null
  return { zoom: Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, z)), lat: la, lon: lo }
}

/** Reads a location.search string. Validates every value, drops what is invalid, never throws. */
export function parseUrlState(search: string): ParsedUrlState {
  const out: ParsedUrlState = {}
  try {
    // Huge inputs are not worth parsing; legitimate URLs are far shorter.
    const params = new URLSearchParams(search.length > 4000 ? '' : search)

    const place = params.get('place')
    if (place !== null && PLACE_ID.test(place)) out.place = place

    const themes = params.get('themes')
    if (themes !== null && themes.length <= 200) {
      if (themes === 'none') out.themes = []
      else {
        const wanted = new Set(themes.split(','))
        const valid = ALL_THEME_IDS.filter((id) => wanted.has(id))
        if (valid.length > 0) out.themes = valid
      }
    }

    // `layers=-id,id`: only the deviation from the defaults. Unknown ids are dropped here; ids of inactive themes when applied.
    const layers = params.get('layers')
    if (layers !== null) {
      const parsed = parseLayers(layers)
      if (Object.keys(parsed).length > 0) out.layers = parsed
    }

    // `amenities=restrooms,parking`: unknown values are dropped.
    const amenities = params.get('amenities')
    if (amenities !== null) {
      const parsed = parseAmenitiesParam(amenities)
      if (parsed.length > 0) out.amenities = parsed
    }

    const view = params.get('view')
    if (view === 'map' || view === 'list') out.view = view

    const q = params.get('q')
    if (q !== null) {
      const trimmed = q.trim().slice(0, MAX_QUERY_LENGTH)
      if (trimmed) out.q = trimmed
    }

    const town = params.get('town')
    if (town !== null && isTownSlug(town)) out.town = town

    const map = params.get('map')
    if (map !== null) {
      const camera = parseCamera(map)
      if (camera) out.map = camera
    }

    if (params.get('about') === '1') out.about = true

    const collection = params.get('collection')
    if (collection !== null && COLLECTION_ID.test(collection)) out.collection = collection
  } catch {
    return {}
  }
  return out
}

const sameCamera = (a: UrlCamera, b: UrlCamera) =>
  a.zoom.toFixed(2) === b.zoom.toFixed(2) && a.lat.toFixed(5) === b.lat.toFixed(5) && a.lon.toFixed(5) === b.lon.toFixed(5)

// Keep commas and slashes readable; everything else is percent-encoded.
const enc = (s: string) => encodeURIComponent(s).replace(/%2C/gi, ',').replace(/%2F/gi, '/')

/** Search string ("?a=b&...", or "" when everything is default) with defaults omitted and a stable key order. */
export function serializeUrlState(state: UrlState): string {
  const parts: string[] = []
  if (state.place && PLACE_ID.test(state.place)) parts.push(`place=${enc(state.place)}`)
  const active = ALL_THEME_IDS.filter((id) => state.themes.includes(id))
  if (active.length === 0) parts.push('themes=none')
  else if (active.length < ALL_THEME_IDS.length) parts.push(`themes=${enc(active.join(','))}`)
  const layers = serializeLayers(active, state.layers ?? {})
  if (layers) parts.push(`layers=${enc(layers)}`)
  const amenities = serializeAmenities(state.amenities ?? [])
  if (amenities) parts.push(`amenities=${enc(amenities)}`)
  if (state.view === 'list') parts.push('view=list')
  const q = state.q.trim().slice(0, MAX_QUERY_LENGTH)
  if (q) parts.push(`q=${enc(q)}`)
  if (isTownSlug(state.town)) parts.push(`town=${enc(state.town)}`)
  const cam = state.map
  if (cam && !sameCamera(cam, DEFAULT_CAMERA)) {
    const zoom = Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, cam.zoom))
    parts.push(`map=${zoom.toFixed(2)}/${cam.lat.toFixed(5)}/${cam.lon.toFixed(5)}`)
  }
  if (state.collection && COLLECTION_ID.test(state.collection)) parts.push(`collection=${enc(state.collection)}`)
  if (state.about) parts.push('about=1')
  return parts.length ? `?${parts.join('&')}` : ''
}
