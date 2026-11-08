// Panel pieces for collections: the entry list (no place selected) and the open collection view.
import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { PlaceRow } from '../places/PlaceRow'
import { usePlaces } from '../places/usePlaces'
import { ReleaseLine } from '../places/ReleaseLine'
import { useRelease } from '../places/release'
import { publicUrl } from '../../lib/guards'
import { useCollections, useOpenCollection, resolveCollectionPlaces } from './collections'

const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-control border border-forest px-4 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link'

/** "Collections" entry: one button per collection. Renders nothing when the release has none. */
/** `compact`: a collapsed disclosure (used above the list). */
export function CollectionsEntry({ compact = false }: { compact?: boolean }) {
  const [expanded, setExpanded] = useState(!compact)
  const { collections } = useCollections()
  const { places } = usePlaces()
  const setCollectionId = useAppStore((s) => s.setCollectionId)
  // A collection with no place left in the catalog is not offered.
  const shown = places.length === 0 ? collections : collections.filter((c) => resolveCollectionPlaces(c, places).length > 0)
  if (shown.length === 0) return null
  return (
    <section aria-labelledby="collections-heading" className={`${compact ? 'mb-2' : 'mt-4'} rounded-card border border-line bg-white p-4`}>
      <h2 id="collections-heading" className="font-display text-lg font-semibold text-ink">
        {compact ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="collections-list"
            onClick={() => setExpanded((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
          >
            <span>Collections</span>
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        ) : (
          'Collections'
        )}
      </h2>
      <ul id="collections-list" hidden={!expanded} className="mt-2 space-y-2">
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setCollectionId(c.id)}
              className="w-full rounded-control border border-line px-3 py-2 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              <span className="block text-[15px] font-semibold text-ink">{c.title}</span>
              <span className="block text-[13px] leading-snug text-ink-muted">{c.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The open collection: title, summary, the rule, a close button and its places. Null if the id is unknown. */
export function CollectionView() {
  const collectionId = useAppStore((s) => s.collectionId)
  const setCollectionId = useAppStore((s) => s.setCollectionId)
  const open = useOpenCollection(collectionId)
  const { sources, status } = usePlaces()
  const release = useRelease()
  if (!open) return null
  const { collection, places } = open
  const usedSourceIds = [...new Set(places.flatMap((p) => p.sourceIds))]
  return (
    <section aria-labelledby="collection-title" className="rounded-card border border-line bg-white">
      <div className="space-y-2 p-4">
        <h2 id="collection-title" className="font-display text-xl font-semibold text-ink">
          {collection.title}
        </h2>
        <p className="text-sm leading-relaxed text-ink-soft">{collection.summary}</p>
        <p className="text-[13px] leading-snug text-ink-muted">How we chose these: {collection.curation}</p>
        <button type="button" onClick={() => setCollectionId(null)} className={BUTTON}>
          Close collection
        </button>
      </div>
      {places.length === 0 ? (
        <p className="border-t border-line p-4 text-sm text-ink-muted">
          {status === 'ready' ? 'None of this collection’s places are in the current data.' : 'Loading places…'}
        </p>
      ) : (
        <ul aria-label={`Places in ${collection.title}`} className="border-t border-line">
          {places.map((p) => (
            <PlaceRow key={p.id} place={p} />
          ))}
        </ul>
      )}
      <div className="space-y-1 border-t border-line p-4 text-[13px] text-ink-muted">
        <h3 className="text-xs font-semibold tracking-wide uppercase">Sources</h3>
        <ul className="space-y-1">
          {usedSourceIds.map((id) => {
            const s = sources.find((x) => x.id === id)
            if (!s) return <li key={id}>{id}</li>
            return (
              <li key={id}>
                {publicUrl(s.url) ? (
                  <a href={s.url} className="font-medium text-link underline underline-offset-2 hover:text-ink">
                    {s.name}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{s.name}</span>
                )}
                {s.license && <span> · Licence: {s.license}</span>}
              </li>
            )
          })}
        </ul>
        <ReleaseLine release={release} />
      </div>
    </section>
  )
}
