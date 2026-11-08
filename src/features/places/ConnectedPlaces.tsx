// "Connected" section on the place card: up to three related places the visitor can jump to.
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { Place } from '../../types/place'
import { CategoryBadge } from '../themes/CategoryIcon'
import { getTheme } from '../themes/themes'
import { connectionsFor, divideNote, useRelationships } from './relationships'
import { usePlaces } from './usePlaces'

export function ConnectedPlaces({ place }: { place: Place }) {
  const index = useRelationships()
  const { places } = usePlaces()
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const { connections, note } = useMemo(() => {
    if (!index) return { connections: [], note: null }
    const byId = new Map(places.map((p) => [p.id, p]))
    return { connections: connectionsFor(place.id, index, byId), note: divideNote(place.id, index, byId) }
  }, [index, places, place.id])

  if (connections.length === 0) return null
  const headingId = `place-${place.id}-connected`
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Connected
      </h3>
      <ul className="border-t border-line">
        {connections.map(({ place: other, label }) => (
          <li key={other.id} className="border-b border-line">
            <button
              type="button"
              onClick={() => setSelectedPlaceId(other.id)}
              className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              <CategoryBadge category={other.category} color={getTheme(other.theme).color} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{other.name}</span>
                <span className="block text-[13px] text-ink-muted">{label}</span>
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
      {note ? <p className="text-[13px] text-ink-muted">{note}</p> : null}
    </section>
  )
}
