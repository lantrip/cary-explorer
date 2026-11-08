// Result UI for search intents: the "Showing parks in Apex" line with Undo, and the "near place" results panel.
import { useMemo } from 'react'
import type { CategoryId, Place } from '../../types/place'
import { CategoryBadge } from '../themes/CategoryIcon'
import { categoryLabel, getTheme } from '../themes/themes'
import { useRelationships } from '../places/relationships'
import { NEAR_RULE_NOTE, categoriesText, nearbyOfCategory, noneLinkedText } from './intent'

const linkButton =
  'min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link'

export function IntentConfirmation({ text, onUndo }: { text: string; onUndo: () => void }) {
  return (
    <div role="status" className="mt-2 flex items-center justify-between gap-2 rounded-control bg-forest-tint pl-3 text-sm text-ink">
      <span>{text}</span>
      <button type="button" onClick={onUndo} className={linkButton}>
        Undo
      </button>
    </div>
  )
}

export interface NearIntent {
  placeId: string
  categoryIds: CategoryId[]
}

export function NearPanel({
  near,
  placesById,
  onPick,
  onClose,
}: {
  near: NearIntent
  placesById: ReadonlyMap<string, Place>
  onPick: (place: Place) => void
  onClose: () => void
}) {
  const index = useRelationships()
  const origin = placesById.get(near.placeId)
  const connections = useMemo(
    () => (index && origin ? nearbyOfCategory(near.placeId, near.categoryIds, index, placesById) : []),
    [index, origin, near, placesById],
  )
  if (!origin) return null
  const heading = `${categoriesText(near.categoryIds)} near ${origin.name}`
  return (
    <section
      aria-label={`Results: ${heading}`}
      className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-card border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(31,42,36,0.14)]"
    >
      <div className="flex items-center justify-between gap-2 pl-3">
        <h3 className="text-sm font-semibold text-ink first-letter:uppercase">{heading}</h3>
        <button type="button" onClick={onClose} className={linkButton}>
          Close
        </button>
      </div>
      {!index ? (
        <p className="px-3 py-2 text-sm text-ink-muted">Loading connections…</p>
      ) : connections.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-muted">{noneLinkedText(near.categoryIds, origin.name)}</p>
      ) : (
        <ul>
          {connections.map(({ place, label }) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => onPick(place)}
                className="flex min-h-14 w-full items-center gap-3 rounded-control px-3 text-left text-sm hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
              >
                <CategoryBadge category={place.category} color={getTheme(place.theme).color} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{place.name}</span>
                  <span className="block truncate text-[13px] text-ink-muted">
                    {categoryLabel[place.category]} · {label}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-3 py-2 text-[13px] text-ink-muted">{NEAR_RULE_NOTE}</p>
    </section>
  )
}
