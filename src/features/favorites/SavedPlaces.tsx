// "Saved places" entry in the panel: a disclosure listing favorites like list rows. Device-local only.
import { useState } from 'react'
import { PlaceRow } from '../places/PlaceRow'
import { usePlaces } from '../places/usePlaces'
import { useFavorites } from './favoritesStore'

export function SavedPlaces({ compact = false }: { compact?: boolean }) {
  const { ids, persistent } = useFavorites()
  const { places } = usePlaces()
  const [open, setOpen] = useState(false)
  const byId = new Map(places.map((p) => [p.id, p]))
  // Ids missing from the catalog are skipped silently (and pruned on the next save).
  const saved = ids.map((id) => byId.get(id)).filter((p) => p !== undefined)
  return (
    <section aria-labelledby="saved-heading" className={`${compact ? 'mb-3' : 'mt-4'} rounded-card border border-line bg-white p-4`}>
      <h2 id="saved-heading" className="font-display text-lg font-semibold text-ink">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="saved-list"
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
        >
          <span>Saved places{saved.length > 0 ? ` (${saved.length})` : ''}</span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      </h2>
      <div id="saved-list" hidden={!open} className="mt-2 space-y-2">
        <p className="text-[13px] leading-snug text-ink-muted">Saved on this device only. Not shared or synced.</p>
        {!persistent && (
          <p role="status" className="text-[13px] leading-snug text-ink">
            Saving isn&apos;t available in this browser; saved places will be lost when you close the page.
          </p>
        )}
        {saved.length === 0 ? (
          <p className="text-sm text-ink-muted">No saved places yet. Use “Save place” on a place card.</p>
        ) : (
          <ul aria-label="Saved places" className="-mx-4">
            {saved.map((p) => (
              <PlaceRow key={p.id} place={p} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
