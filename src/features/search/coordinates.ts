// Coordinate search: parse typed coordinates locally (no network), plus small helpers for the "dropped point" UI. Pure.
import { distanceMeters } from '../location/distance'

export interface LatLon {
  lat: number
  lon: number
}

/** Rough extent of the area this guide covers (not a boundary): used only for a gentle notice. */
export const AREA_BBOX = { minLat: 35.4, maxLat: 36.2, minLon: -79.2, maxLon: -78.2 } as const

export const COORDINATE_ZOOM = 16

const NUM = '\\d+(?:\\.\\d+)?|\\.\\d+'
const TOKEN = new RegExp(`[+-]?(?:${NUM})|[NSEW]|,`, 'gi')

type NumTok = { kind: 'num'; value: number; text: string }
type Tok = NumTok | { kind: 'hem'; value: string } | { kind: 'comma' }

function tokenize(text: string): Tok[] | null {
  // Degree, minute and second marks (straight and curly) only separate numbers.
  const s = text
    .replace(/[°º˚′ʹ’‘'″ʺ”“"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null
  const toks: Tok[] = []
  for (const m of s.matchAll(TOKEN)) {
    const t = m[0]
    if (t === ',') toks.push({ kind: 'comma' })
    else if (/^[a-z]$/i.test(t)) toks.push({ kind: 'hem', value: t.toUpperCase() })
    else toks.push({ kind: 'num', value: Number(t), text: t })
  }
  // Anything left over once the tokens are removed means the text is not a coordinate.
  return s.replace(TOKEN, '').replace(/\s+/g, '') === '' ? toks : null
}

/** Degrees, minutes, seconds -> decimal degrees. Null when the parts don't make sense. */
function dms(parts: number[]): number | null {
  const [d, m = 0, sec = 0] = parts
  if (parts.length > 1 && !Number.isInteger(d)) return null
  if (parts.length > 2 && !Number.isInteger(m)) return null
  if (m >= 60 || sec >= 60) return null
  return d + m / 60 + sec / 3600
}

function inRange(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

/** "35.79 N 78.78 W", "N35.79 W78.78", DMS and DDM: each number group is closed by (or opened with) a hemisphere letter. */
function parseHemispheres(toks: Tok[]): LatLon | null {
  const items = toks.filter((t) => t.kind !== 'comma')
  const prefix = items[0]?.kind === 'hem'
  const groups: { hem: string; nums: number[] }[] = []
  let cur: { hem: string; nums: number[] } | null = null
  for (const t of items) {
    if (t.kind === 'hem') {
      if (prefix) {
        cur = { hem: t.value, nums: [] }
        groups.push(cur)
      } else {
        if (!cur || cur.nums.length === 0) return null
        cur.hem = t.value
        cur = null
      }
    } else if (t.kind === 'num') {
      if (prefix) {
        if (!cur) return null
        cur.nums.push(t.value)
      } else {
        if (!cur) {
          cur = { hem: '', nums: [] }
          groups.push(cur)
        }
        cur.nums.push(t.value)
      }
    }
  }
  if (groups.length !== 2 || groups.some((g) => !g.hem || g.nums.length < 1 || g.nums.length > 3)) return null
  // An explicit sign next to a hemisphere letter is ambiguous ("-78.78 W"), so it is refused.
  if (groups.some((g) => g.nums.some((n) => n < 0 || Object.is(n, -0)))) return null
  const lat = groups.find((g) => g.hem === 'N' || g.hem === 'S')
  const lon = groups.find((g) => g.hem === 'E' || g.hem === 'W')
  if (!lat || !lon) return null
  const latV = dms(lat.nums)
  const lonV = dms(lon.nums)
  if (latV === null || lonV === null) return null
  return inRange(lat.hem === 'S' ? -latV : latV, lon.hem === 'W' ? -lonV : lonV)
}

/** Two signed decimals: lat, lon. Swapped only when the first cannot be a latitude and the second can. */
function parsePlainDecimal(toks: Tok[]): LatLon | null {
  const nums = toks.filter((t): t is NumTok => t.kind === 'num')
  const commas = toks.filter((t) => t.kind === 'comma').length
  if (nums.length !== 2 || commas > 1) return null
  // The comma must sit between the two numbers.
  if (commas === 1 && toks[1]?.kind !== 'comma') return null
  // Bare integers without a comma ("12 34") are far more likely a name or address than a point.
  if (commas === 0 && !nums.every((n) => n.text.includes('.'))) return null
  const [a, b] = [nums[0].value, nums[1].value]
  if (Math.abs(a) <= 90) return inRange(a, b)
  if (Math.abs(b) <= 90) return inRange(b, a)
  return null
}

/** Parses typed coordinates (lat, lon). Returns null for anything unclear; never guesses. */
export function parseCoordinates(text: string): LatLon | null {
  const toks = tokenize(text)
  if (!toks) return null
  const hems = toks.filter((t) => t.kind === 'hem').length
  if (hems === 0) return parsePlainDecimal(toks)
  if (hems !== 2) return null
  // A comma is allowed only as the separator between the two halves.
  if (toks.filter((t) => t.kind === 'comma').length > 1) return null
  return parseHemispheres(toks)
}

/** "35.79000, -78.78000" */
export function formatPoint(p: LatLon): string {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`
}

export function isOutsideArea(p: LatLon): boolean {
  return p.lat < AREA_BBOX.minLat || p.lat > AREA_BBOX.maxLat || p.lon < AREA_BBOX.minLon || p.lon > AREA_BBOX.maxLon
}

export interface NearestPlace<T> {
  place: T
  meters: number
}

/** Up to `count` catalog places nearest to the point, straight-line, nearest first. */
export function nearestPlaces<T extends { centroid: readonly [number, number] }>(
  places: readonly T[],
  p: LatLon,
  count = 3,
): NearestPlace<T>[] {
  return places
    .map((place, index) => ({ place, index, meters: distanceMeters([p.lon, p.lat], place.centroid) }))
    .filter((x) => Number.isFinite(x.meters))
    .sort((x, y) => x.meters - y.meters || x.index - y.index)
    .slice(0, count)
    .map(({ place, meters }) => ({ place, meters }))
}
