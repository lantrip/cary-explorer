// Loader and pure helpers for place-to-place relationships (the hashed relationships file named by the manifest).
import { useEffect, useState } from 'react'
import { fetchBoundedJson } from '../../lib/boundedJson'
import type { Relationship } from '../../types/data-model'
import type { Place } from '../../types/place'
import { useRelease } from './release'

const MAX_BYTES = 1_000_000
const KINDS = ['contained', 'nearby', 'curated'] as const
const METRES_PER_MILE = 1609.344

/** A relationship as released: trail-to-watershed links may carry `share` (0-1 of the trail's length in that watershed) when the trail crosses several. */
export type ReleasedRelationship = Relationship & { share?: number }

export type RelationshipIndex = Map<string, ReleasedRelationship[]>

export interface Connection {
  place: Place
  label: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** Keeps well-formed records only; anything malformed or of an unknown kind is dropped. */
export function parseRelationships(payload: unknown): ReleasedRelationship[] {
  if (!isRecord(payload) || !Array.isArray(payload.relationships)) return []
  const out: ReleasedRelationship[] = []
  for (const item of payload.relationships) {
    if (!isRecord(item)) continue
    const { from, to, kind, distanceM, basis, share } = item
    if (!nonEmpty(from) || !nonEmpty(to) || from === to) continue
    if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) continue
    const rel: ReleasedRelationship = { from, to, kind: kind as Relationship['kind'] }
    if (typeof distanceM === 'number' && Number.isFinite(distanceM) && distanceM >= 0) {
      rel.distanceM = distanceM
    }
    if (basis === 'within-400m' || basis === 'nearest' || basis === 'watershed') rel.basis = basis
    if (typeof share === 'number' && share > 0 && share <= 1 && rel.basis === 'watershed') rel.share = share
    out.push(rel)
  }
  return out
}

/** Indexes each relationship under both of its place ids. */
export function indexRelationships(rels: ReleasedRelationship[]): RelationshipIndex {
  const index: RelationshipIndex = new Map()
  for (const rel of rels) {
    for (const id of [rel.from, rel.to]) {
      const list = index.get(id)
      if (list) list.push(rel)
      else index.set(id, [rel])
    }
  }
  return index
}

export async function loadRelationships(
  url: string,
  signal: AbortSignal,
  maxBytes = MAX_BYTES,
): Promise<RelationshipIndex> {
  return indexRelationships(
    parseRelationships(
      await fetchBoundedJson(url, {
        signal,
        maxBytes,
        label: 'Relationships',
        budgetMessage: 'Relationships exceed the download budget.',
      }),
    ),
  )
}

function formatMiles(distanceM: number): string {
  const miles = Math.max(0.1, Math.round((distanceM / METRES_PER_MILE) * 10) / 10)
  return `${miles.toFixed(1)} mi`
}

function labelFor(rel: ReleasedRelationship, placeId: string, other: Place): string {
  if (rel.kind === 'contained' && rel.basis === 'watershed') {
    // Boundary membership only; never a flow or downstream claim.
    // A trail that crosses several watersheds carries `share` on each link; one watershed keeps "In the".
    const name = other.name.replace(/ watershed$/i, '')
    if (rel.from === placeId) return rel.share === undefined ? `In the ${name} watershed` : `Passes through the ${name} watershed`
    return other.category === 'trail' ? `${other.name} passes through this watershed` : `${other.name} is in this watershed`
  }
  if (rel.kind === 'contained') {
    return rel.from === placeId ? `Runs through ${other.name}` : `${other.name} runs through this park`
  }
  if (rel.kind === 'curated') return 'Connected (curated)'
  const away =
    rel.distanceM === undefined ? 'Nearby (straight line)' : `About ${formatMiles(rel.distanceM)} away (straight line)`
  return rel.basis === 'nearest' ? `Closest place: ${away}` : away
}

const isWatershed = (r: ReleasedRelationship) => r.kind === 'contained' && r.basis === 'watershed'

const KIND_ORDER: Record<Relationship['kind'], number> = { contained: 0, curated: 1, nearby: 2 }

/** Up to `limit` connected places ordered contained, curated, then nearby (closest first). */
function sameNameKey(name: string | undefined): string {
  return (name ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function connectionsFor(
  placeId: string,
  index: RelationshipIndex,
  placesById: ReadonlyMap<string, Place>,
  limit = 3,
): Connection[] {
  const sorted = [...(index.get(placeId) ?? [])].sort(
    (a, b) =>
      Number(isWatershed(b)) - Number(isWatershed(a)) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity),
  )
  const seen = new Set<string>()
  const out: Connection[] = []
  // A place with the same name is the same real thing in another dataset (e.g. Cary's "Black Creek
  // Greenway" trail and its park area), so linking to it teaches nothing; skip it.
  const ownName = sameNameKey(placesById.get(placeId)?.name)
  for (const rel of sorted) {
    const otherId = rel.from === placeId ? rel.to : rel.from
    const other = placesById.get(otherId)
    if (!other || seen.has(otherId)) continue
    if (ownName && sameNameKey(other.name) === ownName) continue
    seen.add(otherId)
    out.push({ place: other, label: labelFor(rel, placeId, other) })
    if (out.length >= limit) break
  }
  return out
}

let shared: Promise<RelationshipIndex> | null = null

/** Loads once per page (after the release manifest); a failure yields an empty index (the card section just hides). */
export function useRelationships(): RelationshipIndex | null {
  const release = useRelease()
  const [index, setIndex] = useState<RelationshipIndex | null>(null)
  useEffect(() => {
    if (!release) return
    let live = true
    shared ??= loadRelationships(release.relationshipsUrl, new AbortController().signal).catch(() => {
      shared = null
      return new Map() as RelationshipIndex
    })
    void shared.then((i) => live && setIndex(i))
    return () => {
      live = false
    }
  }, [release])
  return index
}

const COUNT_WORDS = ['', 'one', 'two', 'three', 'four']

/** Explains a park that lies in more than one watershed; null for everything else. */
export function divideNote(placeId: string, index: RelationshipIndex, placesById: ReadonlyMap<string, Place>): string | null {
  if (placesById.get(placeId)?.category !== 'park') return null
  const n = new Set(
    (index.get(placeId) ?? []).filter((r) => isWatershed(r) && r.from === placeId && placesById.has(r.to)).map((r) => r.to),
  ).size
  return n >= 2 ? `This park sits on a divide between ${COUNT_WORDS[n] ?? n} watersheds.` : null
}
