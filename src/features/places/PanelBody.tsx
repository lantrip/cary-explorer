// Panel content shared by desktop and mobile: the place card, the list view, or a hint.
import { EMPTY_CARD } from '../../lib/styles'
import { useAppStore } from '../../store/useAppStore'
import { CollectionsEntry, CollectionView } from '../collections/CollectionsPanel'
import { useOpenCollection } from '../collections/collections'
import { SavedPlaces } from '../favorites/SavedPlaces'
import { emptyThemeText, emptyThemes, townBySlug } from '../towns/coverage'
import { getTheme } from '../themes/themes'
import { usePlaces } from './usePlaces'
import { ListView } from './ListView'
import { PlaceCard } from './PlaceCard'
import { useSelectedPlace } from './useSelectedPlace'

function MissingPlaceNote() {
  const missing = useAppStore((s) => s.missingPlaceId)
  const dismiss = useAppStore((s) => s.dismissMissingPlace)
  if (!missing) return null
  return (
    <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-card border border-line bg-subtle p-3 text-sm text-ink">
      <p>That place isn&apos;t in the current data.</p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 font-medium text-link underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-link"
      >
        Dismiss
      </button>
    </div>
  )
}

// One line per active theme with no places in the chosen town. Hidden while searching.
function TownGapNotes() {
  const town = useAppStore((s) => s.town)
  const activeThemes = useAppStore((s) => s.activeThemes)
  const query = useAppStore((s) => s.searchQuery)
  const { places, status } = usePlaces()
  const label = townBySlug(town)?.label
  if (!label || status !== 'ready' || query.trim()) return null
  const gaps = emptyThemes(places, activeThemes, town)
  if (gaps.length === 0) return null
  return (
    <div className="mb-3 space-y-1 text-[13px] leading-snug text-ink-muted">
      {gaps.map((theme) => (
        <p key={theme}>{emptyThemeText(getTheme(theme).label, label)}</p>
      ))}
    </div>
  )
}

export function PanelBody() {
  const selected = useSelectedPlace()
  const view = useAppStore((s) => s.view)
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const collectionId = useAppStore((s) => s.collectionId)
  const openCollection = useOpenCollection(collectionId)

  // The list view shows the list even when a place is selected (its row is highlighted); the card shows in map view.
  if (view === 'list') {
    return (
      <>
        <MissingPlaceNote />
        {openCollection ? (
          <CollectionView />
        ) : (
          <>
            <CollectionsEntry compact />
            <SavedPlaces compact />
            <ListView />
          </>
        )}
        <div className="mt-3">
          <TownGapNotes />
        </div>
      </>
    )
  }
  if (selected) return <PlaceCard key={selected.id} place={selected} onClose={() => setSelectedPlaceId(null)} />
  if (openCollection) {
    return (
      <>
        <MissingPlaceNote />
        <CollectionView />
      </>
    )
  }
  return (
    <>
      <MissingPlaceNote />
      <TownGapNotes />
      <div className={`${EMPTY_CARD} bg-white`}>
      <p className="font-display text-xl font-semibold text-ink">Pick a place to start</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        Tap a pin on the map, search by name, or switch to the list. Long-press the map to see which watershed a spot is in, or search by coordinates.
      </p>
      </div>
      <CollectionsEntry />
      <SavedPlaces />
    </>
  )
}
