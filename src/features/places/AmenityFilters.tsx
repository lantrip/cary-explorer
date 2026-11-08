// "Amenities" disclosure: one aria-pressed switch per visit field that at least one loaded place has confirmed.
// Secondary control, mirrors the Layers disclosure.
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { AMENITY_LABEL, AMENITY_NOTE, availableAmenities } from './amenities'
import { usePlaces } from './usePlaces'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-1'

export const AMENITY_PANEL_ID = 'amenity-filters'

export function AmenityFilters() {
  const { places } = usePlaces()
  const selected = useAppStore((s) => s.amenityFilters)
  const toggleAmenity = useAppStore((s) => s.toggleAmenity)
  const clearAmenities = useAppStore((s) => s.clearAmenities)
  const options = useMemo(() => availableAmenities(places), [places])

  return (
    <div id={AMENITY_PANEL_ID} className="mt-2 max-h-[40vh] overflow-y-auto rounded-card border border-line bg-white p-3 text-ink md:max-h-none">
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">No confirmed amenity information is available yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Filter by amenity">
          {options.map(({ key, count }) => {
            const on = selected.includes(key)
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAmenity(key)}
                  className={`inline-flex min-h-11 min-w-11 items-center gap-2 rounded-control border px-3 text-sm font-medium ${focusRing} ${
                    on ? 'border-forest bg-forest-tint text-ink' : 'border-line bg-white text-ink-muted hover:bg-ground'
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 ${on ? 'text-forest' : 'text-ink-muted'}`}
                  >
                    {on ? <path d="M5 12l5 5L20 7" /> : <circle cx="12" cy="12" r="7" strokeWidth={2} />}
                  </svg>
                  {AMENITY_LABEL[key]}
                  <span className="text-xs text-ink-muted">({count})</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[13px] leading-snug text-ink-muted">{AMENITY_NOTE}</p>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={clearAmenities}
          className={`mt-2 inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-link hover:bg-subtle ${focusRing}`}
        >
          Clear
        </button>
      )}
    </div>
  )
}
