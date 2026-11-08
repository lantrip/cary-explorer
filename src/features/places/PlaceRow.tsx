// A place row for panel lists outside the main ListView (collections, saved places). Selecting shows the card.
import { useAppStore } from '../../store/useAppStore'
import type { Place } from '../../types/place'
import { CategoryBadge } from '../themes/CategoryIcon'
import { categoryLabel, getTheme } from '../themes/themes'

export function PlaceRow({ place }: { place: Place }) {
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const setSheetState = useAppStore((s) => s.setSheetState)
  const setView = useAppStore((s) => s.setView)
  return (
    <li>
      <button
        type="button"
        data-place-id={place.id}
        onClick={() => {
          setSelectedPlaceId(place.id)
          setView('map')
          setSheetState('half')
        }}
        className="grid min-h-16 w-full grid-cols-[28px_1fr_16px] items-center gap-3 border-b border-line bg-white px-4 text-left hover:bg-ground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-link"
      >
        <CategoryBadge category={place.category} color={getTheme(place.theme).color} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
          <span className="block truncate text-[13px] text-ink-muted">
            {categoryLabel[place.category]} · {place.municipality}
          </span>
        </span>
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-ink-muted"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </li>
  )
}
