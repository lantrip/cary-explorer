// "Discover" section on the place card: up to three connected discoveries (one per theme), a fire-station line on parks,
// and nothing at all when a place has no qualifying relationships. Slots for birds (#8) and nearby history (#24) go in discoverFor.
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { Place } from '../../types/place'
import { CategoryBadge } from '../themes/CategoryIcon'
import { getTheme } from '../themes/themes'
import { discoverFor } from './discover'
import { useRelationships } from './relationships'
import { usePlaces } from './usePlaces'

export function ConnectedPlaces({ place }: { place: Place }) {
  const index = useRelationships()
  const { places, sources } = usePlaces()
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const result = useMemo(
    () => (index ? discoverFor(place.id, index, new Map(places.map((p) => [p.id, p])), sources) : null),
    [index, places, sources, place.id],
  )

  if (!result?.visible) return null
  const { discoveries, fireStation, notes } = result
  const headingId = `place-${place.id}-discover`
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Discover
      </h3>
      {discoveries.length ? (
        <ul className="border-t border-line">
          {discoveries.map((d) => (
            <li key={d.place.id} className="border-b border-line">
              <button
                type="button"
                onClick={() => setSelectedPlaceId(d.place.id)}
                aria-label={`${d.heading}: ${d.place.name}. ${d.reason} ${d.kindLabel}.`}
                className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
              >
                <CategoryBadge category={d.place.category} color={getTheme(d.place.theme).color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold tracking-wide text-ink-muted uppercase">{d.heading}</span>
                  <span className="block text-[14px] font-medium text-ink">{d.place.name}</span>
                  <span className="block text-[13px] text-ink-muted">{d.reason}</span>
                  <span className="block text-[12px] text-ink-muted">
                    {d.kindLabel}
                    {d.vintage ? ` · ${d.vintage}` : ''}
                  </span>
                </span>
                <svg
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                  width={16}
                  height={16}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-ink-muted"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {notes.map((n) => (
        <p key={n} className="text-[13px] text-ink-muted">
          {n}
        </p>
      ))}
      {fireStation ? (
        <p className="text-[13px] text-ink-muted">
          Nearest fire station:{' '}
          <button
            type="button"
            onClick={() => setSelectedPlaceId(fireStation.place.id)}
            className="inline-flex min-h-11 items-center text-left font-medium text-link underline underline-offset-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
          >
            {fireStation.text}
          </button>
        </p>
      ) : null}
    </section>
  )
}
