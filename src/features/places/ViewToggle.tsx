// Segmented Map/List toggle that switches the app view mode.
import { useAppStore, type ViewMode } from '../../store/useAppStore'
import { useFilteredPlaces } from './useFilteredPlaces'

const OPTIONS: { id: ViewMode; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'list', label: 'List' },
]

export function ViewToggle() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const { places } = useFilteredPlaces()

  return (
    <div role="group" aria-label="View" className="grid grid-cols-2 gap-1 rounded-control bg-subtle p-1">
      {OPTIONS.map((o) => {
        const selected = view === o.id
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => setView(o.id)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-link ${
              selected
                ? 'bg-white text-ink shadow-sm'
                : 'bg-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
            {o.id === 'list' && (
              // Count is decorative for the accessible name, which stays "List".
              <span aria-hidden="true" className="text-[13px] font-medium tabular-nums text-ink-muted">
                {places.length}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
