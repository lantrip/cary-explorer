// Star toggle on the place card. aria-pressed, 44 px target, label "Save place" / "Saved".
import { usePlaces } from '../places/usePlaces'
import { favoritesStore, useFavorites } from './favoritesStore'

export function FavoriteButton({ placeId }: { placeId: string }) {
  const { ids } = useFavorites()
  const { places } = usePlaces()
  const saved = ids.includes(placeId)
  return (
    <button
      type="button"
      aria-label="Save place"
      aria-pressed={saved}
      onClick={() => favoritesStore.toggle(placeId, new Set(places.map((p) => p.id)))}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-control border border-line bg-white px-4 font-semibold text-ink hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width={18}
        height={18}
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        className={`shrink-0 ${saved ? 'text-forest' : ''}`}
      >
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
      </svg>
      {saved ? 'Saved' : 'Save place'}
    </button>
  )
}
