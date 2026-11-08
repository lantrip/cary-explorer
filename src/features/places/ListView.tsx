// Accessible list of places in the active themes: name order, or relevance order while searching.
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { NearMeBar } from '../location/NearMeBar'
import { formatStraightLine, sortByDistance } from '../location/distance'
import { useLocationStore } from '../location/locationStore'
import { useLayerSearch } from '../search/useLayerSearch'
import { CategoryBadge } from '../themes/CategoryIcon'
import { emptyLayersText } from '../themes/layerSelection'
import { emptyAmenitiesText } from './amenities'
import { THEMES, categoryLabel, getTheme } from '../themes/themes'
import { CoverageLabel } from '../towns/CoverageLabel'
import { ACTION_BUTTON, EMPTY_CARD } from '../../lib/styles'
import { usePlaces } from './usePlaces'

export function ListView() {
  const { status, retry } = usePlaces()
  const activeThemes = useAppStore((s) => s.activeThemes)
  const town = useAppStore((s) => s.town)
  const showAllLayers = useAppStore((s) => s.showAllLayers)
  const amenityFilters = useAppStore((s) => s.amenityFilters)
  const clearAmenities = useAppStore((s) => s.clearAmenities)
  const query = useAppStore((s) => s.searchQuery)
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const setSheetState = useAppStore((s) => s.setSheetState)
  const setView = useAppStore((s) => s.setView)
  const setActiveThemes = useAppStore((s) => s.setActiveThemes)
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId)

  // Empty query yields name order; otherwise keep the search's relevance order. Same selection as the map.
  const { results: rows, hiddenLayers } = useLayerSearch(query, Infinity)
  const coords = useLocationStore((s) => s.coords)
  // With location on, nearest first (places without coordinates last); otherwise the search order as is.
  const ordered = useMemo(
    () => (coords ? sortByDistance(rows, coords) : rows.map((item) => ({ item, meters: null as number | null }))),
    [rows, coords],
  )

  if (rows.length === 0) {
    const noThemes = status === 'ready' && activeThemes.length === 0
    const trimmed = query.trim()
    const layerText = status === 'ready' && !noThemes ? emptyLayersText(hiddenLayers) : null
    const amenityText = status === 'ready' && !noThemes && !layerText ? emptyAmenitiesText(amenityFilters) : null
    const text =
      amenityText ? amenityText :
      layerText ? `${trimmed ? `No places match “${trimmed}”. ` : 'Nothing to show. '}${layerText}` :
      status === 'loading'
        ? 'Loading places…'
        : status === 'error'
          ? 'Could not load places.'
          : noThemes
            ? 'No themes selected — turn on a theme to see places.'
            : trimmed
              ? `No places match “${trimmed}”.`
              : town
                ? 'No places match the selected themes in this town.'
                : 'No places match the selected themes.'
    return (
      <>
      <NearMeBar />
      <div className={`${EMPTY_CARD} space-y-3`}>
        {noThemes ? (
          <>
            <p className="font-display text-xl font-semibold text-ink">Nothing to show yet</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Turn on a theme to see places on the map and in the list.
            </p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
        )}
        {status === 'error' && (
          <button type="button" onClick={retry} className={ACTION_BUTTON}>
            Try again
          </button>
        )}
        {layerText && (
          <button type="button" onClick={showAllLayers} className={ACTION_BUTTON}>
            Show all layers
          </button>
        )}
        {amenityText && (
          <button type="button" onClick={clearAmenities} className={ACTION_BUTTON}>
            Clear amenity filters
          </button>
        )}
        {noThemes && (
          <button
            type="button"
            onClick={() => setActiveThemes(THEMES.map((t) => t.id))}
            className={ACTION_BUTTON}
          >
            Turn on all themes
          </button>
        )}
      </div>
      </>
    )
  }

  return (
    <>
    <NearMeBar />
    <ul aria-label="Places" className="flex flex-col">
      {ordered.map(({ item: place, meters }) => {
        const selected = place.id === selectedPlaceId
        return (
          <li key={place.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedPlaceId(place.id)
                // Show the card: switch to map view (desktop and mobile), and on mobile reveal the map at half height.
                setView('map')
                setSheetState('half')
              }}
              data-place-id={place.id}
              aria-current={selected ? 'true' : undefined}
              className={`grid min-h-16 w-full grid-cols-[28px_1fr_16px] items-center gap-3 border-b border-line px-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-link ${
                selected
                  ? 'bg-forest-tint shadow-[inset_3px_0_0_0_var(--color-forest)]'
                  : 'bg-white hover:bg-ground'
              }`}
            >
              <CategoryBadge
                category={place.category}
                color={getTheme(place.theme).color}
                size="sm"
              />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
                <span className="block truncate text-[13px] text-ink-muted">
                  {categoryLabel[place.category]} · {place.municipality}
                </span>
                {coords && meters !== null && (
                  <span className="block truncate text-[13px] text-ink-muted">{formatStraightLine(meters)}</span>
                )}
                <CoverageLabel coverage={place.coverage} className="mt-0.5" />
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
                className={`h-4 w-4 shrink-0 ${selected ? 'text-forest' : 'text-ink-muted'}`}
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        )
      })}
    </ul>
    </>
  )
}
