// "Showing a point at …" line with Clear, the outside-area notice and the nearest places (straight line).
import { useMemo } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { usePlaces } from '../places/usePlaces'
import { formatStraightLine } from '../location/distance'
import type { Place } from '../../types/place'
import { formatPoint, isOutsideArea, nearestPlaces } from './coordinates'

const linkButton =
  'min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link'

export function CoordinatePanel({ onPick }: { onPick: (place: Place) => void }) {
  const pin = useAppStore((s) => s.droppedPin)
  const setDroppedPin = useAppStore((s) => s.setDroppedPin)
  const { places } = usePlaces()
  const nearest = useMemo(() => (pin ? nearestPlaces(places, pin, 3) : []), [pin, places])
  if (!pin) return null
  return (
    <section aria-label="Point from coordinates" className="mt-2 rounded-control bg-forest-tint text-sm text-ink">
      <div role="status" className="flex items-center justify-between gap-2 pl-3">
        <span>Showing a point at {formatPoint(pin)}</span>
        <button type="button" onClick={() => setDroppedPin(null)} className={linkButton}>
          Clear
        </button>
      </div>
      {isOutsideArea(pin) && <p className="px-3 pb-2">This point is outside the area this guide covers.</p>}
      {nearest.length > 0 && (
        <div className="px-1.5 pb-1.5">
          <h3 className="px-1.5 pt-1 text-[13px] font-semibold text-ink-muted">Nearest places (straight line)</h3>
          <ul>
            {nearest.map(({ place, meters }) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => onPick(place)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-1.5 text-left hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
                >
                  <span className="min-w-0 truncate font-medium">{place.name}</span>
                  <span className="shrink-0 text-[13px] text-ink-muted">{formatStraightLine(meters)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
