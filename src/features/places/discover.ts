// "Discover" on the place card: up to three connected discoveries, one per theme, built only from released relationship data.
// Pure functions; ConnectedPlaces.tsx renders the result. Copy states membership or straight-line distance, never flow or service.
import type { Place, Source } from '../../types/place'
import { basinOf, divideNote, moreWatershedsNote, watershedNotDetermined, type ReleasedRelationship, type RelationshipIndex } from './relationships'

export type DiscoverTheme = 'creek' | 'watershed' | 'trail-park' | 'curated'
/** Decision 29's three kinds of connection. */
export type DiscoverKind = 'contained' | 'nearby' | 'curated'

export interface Discovery {
  theme: DiscoverTheme
  /** Short heading, e.g. "Meet this creek". */
  heading: string
  place: Place
  /** One sentence (the watershed keeps its "In the X watershed · Y basin" line). */
  reason: string
  kind: DiscoverKind
  /** "Inside", "Nearby · 0.3 mi straight-line" or "Curated". */
  kindLabel: string
  /** Source vintage such as "USGS, retrieved Nov 2026"; only for creek and watershed discoveries whose source date is loaded. */
  vintage?: string
}

export interface FireStationLine {
  place: Place
  /** "Cary Fire Station 4 · 0.9 mi straight-line", without the "Nearest fire station:" lead-in. */
  text: string
}

export interface DiscoverResult {
  discoveries: Discovery[]
  fireStation: FireStationLine | null
  /** Notes tied to the watershed discovery (a divide, extra watersheds) or "Watershed not determined". */
  notes: string[]
  /** False when the card should render nothing at all. */
  visible: boolean
}

type SourceLike = Pick<Source, 'id' | 'name' | 'retrievedAt'>

export const MAX_DISCOVERIES = 3
const METRES_PER_MILE = 1609.344
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const miles = (m: number) => `${Math.max(0.1, Math.round((m / METRES_PER_MILE) * 10) / 10).toFixed(1)} mi`
const isWatershedPlace = (p: Place) => p.category === 'water' && /watershed$/i.test(p.name)
const isCreek = (p: Place) => p.category === 'water' && !isWatershedPlace(p)
const isWatershedLink = (r: ReleasedRelationship) => r.kind === 'contained' && r.basis === 'watershed'
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** "USGS, retrieved Nov 2026" from the loaded sources; undefined when the place has no source with a valid date. */
export function sourceVintage(place: Place, sources: readonly SourceLike[]): string | undefined {
  for (const id of place.sourceIds) {
    const s = sources.find((x) => x.id === id)
    if (!s?.retrievedAt) continue
    const d = new Date(s.retrievedAt)
    if (Number.isNaN(d.getTime())) continue
    return `${id.startsWith('usgs-') ? 'USGS' : s.name}, retrieved ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
  }
  return undefined
}

interface Cand {
  rel: ReleasedRelationship
  other: Place
  /** True when the viewed place is the link's `from`. */
  outgoing: boolean
}

const byNameThenId = (a: Cand, b: Cand) => a.other.name.localeCompare(b.other.name) || a.other.id.localeCompare(b.other.id)

/** Chooses the discoveries, the fire-station line and the watershed notes for one place. */
export function discoverFor(
  placeId: string,
  index: RelationshipIndex,
  placesById: ReadonlyMap<string, Place>,
  sources: readonly SourceLike[] = [],
): DiscoverResult {
  const self = placesById.get(placeId)
  if (!self) return { discoveries: [], fireStation: null, notes: [], visible: false }
  const cands: Cand[] = []
  for (const rel of index.get(placeId) ?? []) {
    const outgoing = rel.from === placeId
    const other = placesById.get(outgoing ? rel.to : rel.from)
    // A same-named place is the same real thing in another dataset (decision 29): never link to it.
    if (!other || other.id === placeId || norm(other.name) === norm(self.name)) continue
    cands.push({ rel, other, outgoing })
  }

  // Nearest fire station: its own line on park cards, never a discovery (decision 32).
  const stn = cands
    .filter((c) => c.outgoing && c.rel.basis === 'nearest' && self.category === 'park' && c.other.category === 'fire-station')
    .sort((a, b) => (a.rel.distanceM ?? Infinity) - (b.rel.distanceM ?? Infinity))[0]
  const fireStation: FireStationLine | null = stn
    ? { place: stn.other, text: `${stn.other.name} · ${stn.rel.distanceM === undefined ? '' : `${miles(stn.rel.distanceM)} `}straight-line` }
    : null

  const picks: Discovery[] = []
  const used = new Set<string>()
  const add = (d: Discovery) => {
    if (picks.length >= MAX_DISCOVERIES || used.has(d.place.id)) return
    used.add(d.place.id)
    picks.push(d)
  }

  // (a) Meet this creek: a creek the place contains, or a creek this trail follows (or one that passes through this watershed).
  if (!isCreek(self)) {
    const c = cands
      .filter((x) => isCreek(x.other) && (x.rel.basis === 'along' ? x.outgoing : x.rel.kind === 'contained'))
      .sort(
        (a, b) =>
          Number(b.rel.basis !== 'along') - Number(a.rel.basis !== 'along') ||
          (b.rel.alongM ?? 0) - (a.rel.alongM ?? 0) ||
          byNameThenId(a, b),
      )[0]
    if (c) {
      const n = c.other.name
      const along = c.rel.basis === 'along'
      add({
        theme: 'creek',
        heading: 'Meet this creek',
        place: c.other,
        reason: along
          ? `This trail follows ${n}${c.rel.alongM === undefined ? '' : ` for about ${miles(c.rel.alongM)}`}.`
          : isWatershedPlace(self)
            ? `${n} passes through this watershed.`
            : `${n} runs through this park.`,
        kind: along ? 'nearby' : 'contained',
        kindLabel: along ? 'Nearby · alongside the creek' : 'Inside',
        vintage: sourceVintage(c.other, sources),
      })
    }
  }

  // (b) The watershed this place is in (largest share first); today's wording with the basin.
  const ws = cands.filter((c) => c.outgoing && isWatershedLink(c.rel)).sort((a, b) => (b.rel.share ?? 1) - (a.rel.share ?? 1))[0]
  if (ws) {
    const name = ws.other.name.replace(/ watershed$/i, '')
    const basin = basinOf(ws.other)
    const line = ws.rel.share === undefined ? `In the ${name} watershed` : `Passes through the ${name} watershed`
    add({
      theme: 'watershed',
      heading: 'Your watershed',
      place: ws.other,
      reason: basin ? `${line} · ${basin} basin` : line,
      kind: 'contained',
      kindLabel: 'Inside',
      vintage: sourceVintage(ws.other, sources),
    })
  }

  // (c) A trail or park: contained first, then within 400 m (closest first).
  const tp = cands
    .filter((c) => c.other.category === 'trail' || c.other.category === 'park')
    .filter(
      (c) =>
        (c.rel.kind === 'contained' && (!isWatershedLink(c.rel) || !c.outgoing)) ||
        c.rel.basis === 'along' ||
        c.rel.basis === 'within-400m' ||
        // A fire station's nearest park: the station card has no other nearby place.
        (c.rel.basis === 'nearest' && self.category === 'fire-station'),
    )
    .sort(
      (a, b) =>
        Number(b.rel.kind === 'contained') - Number(a.rel.kind === 'contained') ||
        (a.rel.distanceM ?? Infinity) - (b.rel.distanceM ?? Infinity) ||
        byNameThenId(a, b),
    )[0]
  if (tp) {
    const { rel, other } = tp
    const n = other.name
    if (rel.basis === 'along') {
      add({
        theme: 'trail-park',
        heading: 'Walk on',
        place: other,
        reason: `${n} follows this creek${rel.alongM === undefined ? '' : ` for about ${miles(rel.alongM)}`}.`,
        kind: 'nearby',
        kindLabel: 'Nearby · alongside the creek',
      })
    } else if (rel.kind === 'contained') {
      const inWatershed = isWatershedPlace(self)
      add({
        theme: 'trail-park',
        heading: other.category === 'trail' ? 'Walk on' : self.category === 'trail' ? 'A park on the way' : 'Park it runs through',
        place: other,
        reason:
          other.category === 'trail'
            ? inWatershed
              ? `${n} passes through this watershed.`
              : `${n} runs through this park.`
            : inWatershed
              ? `${n} is in this watershed.`
              : `${self.name} runs through ${n}.`,
        kind: 'contained',
        kindLabel: 'Inside',
      })
    } else {
      add({
        theme: 'trail-park',
        heading: other.category === 'trail' ? 'Nearby trail' : 'Nearby park',
        place: other,
        reason: rel.distanceM === undefined ? 'Nearby, straight line.' : `About ${miles(rel.distanceM)} away, straight line.`,
        kind: 'nearby',
        kindLabel: rel.distanceM === undefined ? 'Nearby · straight-line' : `Nearby · ${miles(rel.distanceM)} straight-line`,
      })
    }
  }

  // (d) Curated links fill whatever is left.
  for (const c of cands.filter((x) => x.rel.kind === 'curated').sort(byNameThenId)) {
    add({
      theme: 'curated',
      heading: 'Also worth a look',
      place: c.other,
      reason: `A hand-picked link between ${self.name} and ${c.other.name}.`,
      kind: 'curated',
      kindLabel: 'Curated',
    })
  }

  const notes: string[] = []
  if (picks.some((d) => d.theme === 'watershed')) {
    const more = moreWatershedsNote(placeId, index, placesById)
    const divide = divideNote(placeId, index, placesById)
    if (more) notes.push(more)
    if (divide) notes.push(divide)
  } else if (watershedNotDetermined(placeId, index, placesById)) notes.push('Watershed not determined')

  return { discoveries: picks, fireStation, notes, visible: picks.length > 0 || fireStation !== null || notes.length > 0 }
}
