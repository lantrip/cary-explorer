// Visit information (issue #41, decision section 18): 14 fixed fields per place, each "known" only when a
// source affirmatively states it. "No", empty and null all become "unknown" - an inventory never proves absence.
// Pure functions; build-catalog.mjs does the file IO and the geometry joins.

export const VISIT_FIELDS = [
  ['address', 'Address'],
  ['entrances', 'Entrances'],
  ['parking', 'Parking'],
  ['restrooms', 'Restrooms'],
  ['pavedSurface', 'Paved surface'],
  ['stepsSlope', 'Steps and slope'],
  ['wheelchair', 'Wheelchair access'],
  ['hours', 'Hours'],
  ['water', 'Drinking water'],
  ['dogPark', 'Dog park'],
  ['playground', 'Playground'],
  ['picnicShelter', 'Picnic shelter'],
  ['walkingTrails', 'Walking trails'],
  ['phone', 'Phone'],
]
export const VISIT_KEYS = VISIT_FIELDS.map(([k]) => k)

/** Visit fields exposed as catalog `amenities` (issue #84), in this fixed order. */
export const AMENITY_KEYS = [
  'restrooms',
  'parking',
  'playground',
  'picnicShelter',
  'dogPark',
  'walkingTrails',
  'pavedSurface',
  'wheelchair',
  'water',
]

/**
 * Amenity keys that are fully confirmed in a place's computed visit fields, in AMENITY_KEYS order. Empty when none.
 * Partial values ("... on some segments") stay known facts on the card but never match a filter. `wheelchair` counts
 * only for "Accessible (...)"; `pavedSurface` only for "Paved (...)" (not "Mostly paved", "Unpaved", "Not paved" or "Mixed").
 */
export function amenitiesOf(fields) {
  const partial = /on some segments/i
  const known = new Set(
    (fields ?? [])
      .filter((f) => f?.status === 'known')
      .filter((f) => {
        const v = String(f.value ?? '')
        if (f.key === 'wheelchair') return /^accessible\b/i.test(v) && !partial.test(v)
        if (f.key === 'pavedSurface') return /^paved\b/i.test(v) && !partial.test(v)
        return true
      })
      .map((f) => f.key),
  )
  return AMENITY_KEYS.filter((k) => known.has(k))
}

/** Sources whose fields explicitly state accessibility. Only these may back a known `wheelchair` value. */
export const ACCESSIBILITY_SOURCES = new Set(['cary-greenways', 'wake-greenways'])

export const SRC_WAKE_PARKS = 'wake-parks'
export const SRC_WAKE_ENTRANCES = 'wake-park-entrances'
export const SRC_CARY_FEATURES = 'cary-park-features'
export const SRC_CARY_GREENWAYS = 'cary-greenways'
export const SRC_WAKE_GREENWAYS = 'wake-greenways'
export const SRC_WAKE_FIRE = 'wake-fire-stations'

const PAVED = new Set(['asphalt', 'concrete'])

const norm = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '')
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ') : '')

/** True only for an affirmative flag ("Yes", "Y", "true", "Yes - ..."). "No", null, empty, anything else is false. */
export function isYes(v) {
  const s = norm(v)
  return s === 'y' || s === 'true' || s === 'yes' || /^yes\b/.test(s)
}

/** YYYY-MM-DD for a source: sourceModified when present, otherwise retrievedAt. */
export function verifiedDate(meta) {
  const raw = meta?.sourceModified || meta?.retrievedAt
  const d = typeof raw === 'string' ? raw.slice(0, 10) : ''
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined
}

const unknown = (key, label) => ({ key, label, status: 'unknown' })
const known = (key, label, value, sourceId, verifiedAt) => ({ key, label, status: 'known', value, sourceId, verifiedAt })

/** Most common non-empty value; `undefined` on an empty list or a tie (never guess between addresses). */
function consensus(values) {
  const counts = new Map()
  for (const v of values.map(text).filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return undefined
  return ranked[0][0]
}

/** Wake ADDRESS plus Address2 when Address2 adds something (it is usually a repeat or "City, NC ZIP"). */
export function wakeAddress(props) {
  const a = text(props?.ADDRESS)
  const b = text(props?.Address2)
  if (!a) return b
  if (!b || a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())) {
    return b.length > a.length ? b : a
  }
  return `${a}, ${b}`
}

/** "3 entrances (2 vehicle, 1 pedestrian)": each entrance is counted once, vehicle first, then greenway, then pedestrian. */
export function describeEntrances(entrances) {
  const n = entrances.length
  if (!n) return undefined
  let vehicle = 0
  let greenway = 0
  let pedestrian = 0
  let other = 0
  for (const e of entrances) {
    if (isYes(e.VEHICLEENTRANCE)) vehicle++
    else if (isYes(e.GREENWAYENTRANCE)) greenway++
    else if (isYes(e.PEDESTRIANENTRANCE)) pedestrian++
    else other++
  }
  const parts = [
    vehicle && `${vehicle} vehicle`,
    greenway && `${greenway} greenway`,
    pedestrian && `${pedestrian} pedestrian`,
    other && `${other} other`,
  ].filter(Boolean)
  return `${n} ${n === 1 ? 'entrance' : 'entrances'} (${parts.join(', ')})`
}

/**
 * Surface from the existing greenway segments' `surftype`. Returns a display value or undefined (no typed segment).
 * Untyped segments are mentioned, never assumed.
 */
export function describeSurface(segments) {
  const typed = segments.map((s) => text(s?.surftype)).filter(Boolean)
  if (!typed.length) return undefined
  const kinds = [...new Set(typed.map((t) => t.toLowerCase()))].sort()
  const paved = typed.filter((t) => PAVED.has(t.toLowerCase())).length
  const pavedKinds = kinds.filter((k) => PAVED.has(k))
  let out
  if (paved === typed.length) out = `Paved (${pavedKinds.join('/')})`
  else if (paved === 0) out = `Not paved (${kinds.join(', ')})`
  else if (paved * 2 >= typed.length) out = `Mostly paved (${pavedKinds.join('/')}); also ${kinds.filter((k) => !PAVED.has(k)).join(', ')}`
  else out = `Mixed: ${kinds.join(', ')}`
  if (typed.length < segments.length) out += '; surface not recorded for some segments'
  return out
}

/** Wheelchair access only from an explicit `ada` flag on the greenway segments. Never derived from the surface. */
export function describeAccessibility(segments) {
  if (!segments.length) return undefined
  const yes = segments.filter((s) => isYes(s?.ada)).length
  if (!yes) return undefined
  return yes === segments.length
    ? 'Accessible (per Town of Cary greenway data)'
    : 'Accessible on some segments (per Town of Cary greenway data)'
}

const WAKE_PAVED = new Set(['asphalt', 'concrete', 'boardwalk', 'boardwlk'])
const WAKE_NATURAL = new Set(['natural', 'natural surface', 'native material', 'imported loose material', 'chunk wood', 'mulch', 'gravel', 'dirt'])

/** One Wake TRAIL_SURFACE value -> 'paved' (with kinds), 'natural', or undefined (blank, "Other", unrecognised, mixed paved/natural text). */
export function classifyWakeSurface(raw) {
  const n = norm(raw)
  if (!n || n === 'other') return undefined
  if (WAKE_NATURAL.has(n)) return { type: 'natural' }
  const parts = n.split('/').map((x) => x.trim())
  if (parts.length && parts.every((x) => WAKE_PAVED.has(x))) {
    return { type: 'paved', kinds: parts.map((x) => (x === 'boardwlk' ? 'boardwalk' : x)) }
  }
  return undefined
}

/**
 * Surface from Wake County greenway segments ({ surface }: TRAIL_SURFACE). Known only when a segment clearly states
 * a paved or natural surface. All segments paved -> "Paved (...)"; some paved -> "Paved on some segments"; only natural
 * stated -> "Unpaved (natural surface)" (qualified "on some segments" when others state nothing). Otherwise undefined.
 */
export function describeWakeSurface(segments) {
  const types = segments.map((s) => classifyWakeSurface(s?.surface))
  const paved = types.filter((t) => t?.type === 'paved')
  const natural = types.filter((t) => t?.type === 'natural').length
  if (paved.length === segments.length && paved.length) {
    return `Paved (${[...new Set(paved.flatMap((t) => t.kinds))].sort().join('/')})`
  }
  if (paved.length) return 'Paved on some segments'
  if (natural === segments.length && natural) return 'Unpaved (natural surface)'
  if (natural) return 'Unpaved (natural surface) on some segments'
  return undefined
}

/** Wheelchair access from Wake ACCESSIBILITY_STATUS, only when it is exactly "Accessible". "Not accessible", "Not evaluated" and blanks never count. */
export function describeWakeAccessibility(segments) {
  if (!segments.length) return undefined
  const yes = segments.filter((s) => norm(s?.access) === 'accessible').length
  if (!yes) return undefined
  return yes === segments.length
    ? 'Accessible (per Wake County greenway data)'
    : 'Accessible on some segments (per Wake County greenway data)'
}

/**
 * Build the 14 visit fields for one place.
 * ctx: {
 *   wake?: Wake parks properties (wake-park-* places),
 *   fire?: { address } for wake-fire-* places (the only visit field a fire station has),
 *   caryPoints?: Cary park feature-map properties inside the park (cary-park-* places),
 *   entrances?: joined Wake park-entrance properties,
 *   segments?: existing greenway segment properties (cary-greenway-* places),
 *   dates: { wake, entrances, caryFeatures, greenways }  YYYY-MM-DD per source
 * }
 */
export function buildVisitFields(ctx = {}) {
  const { wake, fire, caryPoints = [], entrances = [], segments = [], wakeSegments, dates = {} } = ctx
  const label = Object.fromEntries(VISIT_FIELDS)
  const out = {}
  const set = (key, value, sourceId, date) => {
    out[key] = value && sourceId && date ? known(key, label[key], value, sourceId, date) : unknown(key, label[key])
  }

  // address
  if (fire) set('address', text(fire.address), SRC_WAKE_FIRE, dates.fire)
  else if (wake) set('address', wakeAddress(wake), SRC_WAKE_PARKS, dates.wake)
  else set('address', consensus(entrances.map((e) => wakeAddress(e))), SRC_WAKE_ENTRANCES, dates.entrances)

  // entrances and parking
  set('entrances', describeEntrances(entrances), SRC_WAKE_ENTRANCES, dates.entrances)
  const parking = entrances.some((e) => isYes(e.PARKINGLOT))
    ? 'Parking lot'
    : entrances.some((e) => isYes(e.PARKINGSTREET))
      ? 'Street parking'
      : undefined
  set('parking', parking, SRC_WAKE_ENTRANCES, dates.entrances)

  // yes/no amenity flags: primary source first, entrances as a fallback
  const flags = [
    ['restrooms', 'RESTROOMS', 'restroom', 'Yes'],
    ['dogPark', 'DOGPARK', 'dogpark', 'Yes'],
    ['playground', 'PLAYGROUND', 'playground', 'Yes'],
    ['picnicShelter', 'PICNICSHELTER', null, 'Yes'],
    ['walkingTrails', 'WALKINGTRAILS', 'naturetrail', 'Yes'],
  ]
  for (const [key, wakeField, caryField, value] of flags) {
    if (wake && isYes(wake[wakeField])) set(key, value, SRC_WAKE_PARKS, dates.wake)
    else if (caryField && caryPoints.some((p) => isYes(p[caryField]))) set(key, value, SRC_CARY_FEATURES, dates.caryFeatures)
    else if (entrances.some((e) => isYes(e[wakeField]))) set(key, value, SRC_WAKE_ENTRANCES, dates.entrances)
    else set(key, undefined)
  }

  // phone
  if (wake && text(wake.PHONE)) set('phone', text(wake.PHONE), SRC_WAKE_PARKS, dates.wake)
  else set('phone', consensus(entrances.map((e) => e.PHONE)), SRC_WAKE_ENTRANCES, dates.entrances)

  // trail surface and explicit accessibility (never inferred from the surface)
  if (wakeSegments) {
    set('pavedSurface', describeWakeSurface(wakeSegments), SRC_WAKE_GREENWAYS, dates.wakeGreenways)
    set('wheelchair', describeWakeAccessibility(wakeSegments), SRC_WAKE_GREENWAYS, dates.wakeGreenways)
  } else {
    set('pavedSurface', describeSurface(segments), SRC_CARY_GREENWAYS, dates.greenways)
    set('wheelchair', describeAccessibility(segments), SRC_CARY_GREENWAYS, dates.greenways)
  }

  // no source for these yet
  for (const key of ['stepsSlope', 'hours', 'water']) set(key, undefined)

  return VISIT_KEYS.map((k) => out[k])
}

/** Validate one detail file; returns error strings. `sourceIds` is the set of catalog source ids. */
export function validateDetail(detail, placeId, sourceIds) {
  const errors = []
  const at = `places/${placeId}.json`
  if (!detail || typeof detail !== 'object') return [`${at}: not an object`]
  if (detail.id !== placeId) errors.push(`${at}: id "${detail.id}" does not match the file name`)
  const fields = detail.fields
  if (!Array.isArray(fields)) return [...errors, `${at}: fields is not an array`]
  const keys = fields.map((f) => f?.key)
  if (keys.length !== VISIT_KEYS.length || keys.some((k, i) => k !== VISIT_KEYS[i])) {
    errors.push(`${at}: fields must be exactly [${VISIT_KEYS.join(', ')}] in order (got ${keys.join(', ')})`)
    return errors
  }
  const labels = Object.fromEntries(VISIT_FIELDS)
  for (const f of fields) {
    const w = `${at} ${f.key}`
    if (f.label !== labels[f.key]) errors.push(`${w}: label must be "${labels[f.key]}"`)
    if (f.status === 'unknown') {
      if (f.value !== undefined) errors.push(`${w}: unknown field must not carry a value`)
    } else if (f.status === 'known') {
      if (typeof f.value !== 'string' || !f.value.trim()) errors.push(`${w}: known field needs a value`)
      if (typeof f.sourceId !== 'string' || !f.sourceId) errors.push(`${w}: known field needs a sourceId`)
      else if (sourceIds && !sourceIds.has(f.sourceId)) errors.push(`${w}: sourceId "${f.sourceId}" is not a catalog source`)
      if (typeof f.verifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.verifiedAt)) {
        errors.push(`${w}: known field needs verifiedAt as YYYY-MM-DD`)
      }
      if (f.key === 'wheelchair' && !ACCESSIBILITY_SOURCES.has(f.sourceId)) {
        errors.push(`${w}: wheelchair access may only be known from an explicit accessibility source`)
      } else if (f.key === 'wheelchair' && f.sourceId === SRC_WAKE_GREENWAYS && !/^Accessible\b/.test(f.value ?? '')) {
        errors.push(`${w}: wake-greenways may back wheelchair access only with an affirmative "Accessible" value`)
      }
    } else errors.push(`${w}: status must be "known" or "unknown"`)
  }
  return errors
}
