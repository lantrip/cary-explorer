// Status notes laid over the map: loading, catalog error, empty states and map-unavailable.
// The wrapper never captures pointer events, so only the notes themselves are clickable.
import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useIsDesktop } from '../../lib/useIsDesktop'
import { DESKTOP_PANEL_WIDTH } from '../../lib/layout'
import { useFilteredPlaces } from '../places/useFilteredPlaces'
import { usePlaces } from '../places/usePlaces'
import { THEMES } from '../themes/themes'
import { emptyLayersText } from '../themes/layerSelection'
import { emptyAmenitiesText } from '../places/amenities'
import { useLayerSearch } from '../search/useLayerSearch'
import { useMapStatus } from './mapStatus'
import { useGeometryLayers } from './layers'

const cardClass =
  'pointer-events-auto w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-ink shadow-md'
const titleClass = 'font-display text-[18px] font-semibold leading-snug'
const bodyClass = 'mt-1 text-sm leading-relaxed text-ink-muted'
const primaryButton =
  'inline-flex h-11 items-center justify-center rounded-xl bg-forest px-5 text-sm font-semibold text-white hover:bg-ink-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'
const linkButton = 'inline-flex h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-link hover:bg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'

function Card({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className={cardClass}>
      <p className={titleClass}>{title}</p>
      <p className={bodyClass}>{body}</p>
      {children}
    </div>
  )
}

export function MapNotes() {
  const isDesktop = useIsDesktop()
  const { status, error, retry } = usePlaces()
  const { places: visible, amenityEmpty } = useFilteredPlaces()
  const amenityFilters = useAppStore((s) => s.amenityFilters)
  const panelCollapsed = useAppStore((s) => s.panelCollapsed)
  const noThemes = useAppStore((s) => s.activeThemes.length === 0)
  const { hiddenLayers } = useLayerSearch('', Infinity)
  const mapStatus = useMapStatus()
  const layers = useGeometryLayers()
  const [showDetails, setShowDetails] = useState(false)

  let catalogNote: React.ReactNode = null
  if (status === 'error') {
    catalogNote = (
      <Card
        title="We couldn't load the places"
        body="Check your connection, then try again. Anything already loaded stays on the map."
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={retry} className={primaryButton}>
            Try again
          </button>
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
            className={linkButton}
          >
            Details
          </button>
        </div>
        {showDetails && (
          <p className="mt-3 break-words rounded-xl bg-subtle p-2 font-mono text-xs text-ink-soft">
            {error || 'No further details were reported.'}
          </p>
        )}
      </Card>
    )
  } else if (status === 'loading') {
    catalogNote = (
      <p className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink shadow-md">
        <span className="cary-spinner" aria-hidden="true" />
        Loading places…
      </p>
    )
  } else if (noThemes) {
    catalogNote = (
      <Card title="Nothing to show yet" body="Turn on a theme to see places on the map and in the list.">
        <button
          type="button"
          onClick={() => useAppStore.getState().setActiveThemes(THEMES.map((t) => t.id))}
          className={`${primaryButton} mt-3`}
        >
          Turn on all themes
        </button>
      </Card>
    )
  } else if (visible.length === 0 && hiddenLayers.length > 0) {
    catalogNote = (
      <Card title="Nothing to show with these layers" body={emptyLayersText(hiddenLayers) ?? ''}>
        <button type="button" onClick={() => useAppStore.getState().showAllLayers()} className={`${primaryButton} mt-3`}>
          Show all layers
        </button>
      </Card>
    )
  } else if (amenityEmpty) {
    catalogNote = (
      <Card title="Nothing to show with these filters" body={emptyAmenitiesText(amenityFilters) ?? ''}>
        <button type="button" onClick={() => useAppStore.getState().clearAmenities()} className={`${primaryButton} mt-3`}>
          Clear amenity filters
        </button>
      </Card>
    )
  } else if (visible.length === 0) {
    catalogNote = <p className="pointer-events-auto rounded-2xl border border-line bg-white px-5 py-3 text-sm text-ink shadow-md">No places to show</p>
  }

  // Small, non-blocking: points, filters and selection keep working. Skipped when the catalog note already says to retry.
  const layerNote =
    layers.status === 'error' && status !== 'error' ? (
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-line bg-white py-1 pr-1 pl-4 text-sm text-ink shadow-md">
        <p>Trail and park outlines didn&rsquo;t load.</p>
        <button type="button" onClick={layers.retry} className={linkButton}>
          Try again
        </button>
      </div>
    ) : null

  const mapNote =
    mapStatus.state === 'unavailable' ? (
      <Card
        title="The map isn't available right now"
        body="You can still search and browse every place in the list."
      >
        <button
          type="button"
          onClick={() => {
            const s = useAppStore.getState()
            s.setView('list')
            if (!isDesktop) s.setSheetState('full')
          }}
          className={`${primaryButton} mt-3`}
        >
          Open the list
        </button>
      </Card>
    ) : null

  // Desktop: the visible map starts 16px right of the side panel (or of the map edge when it is collapsed). Mobile: below the search bar and chips (~128px).
  const position = isDesktop ? 'right-4 top-4' : 'inset-x-4 top-[128px]'
  const desktopOffset = isDesktop ? { left: panelCollapsed ? 16 : DESKTOP_PANEL_WIDTH + 16 } : undefined

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none absolute z-10 flex flex-col items-center gap-2 ${position}`}
      style={desktopOffset}
    >
      {mapNote}
      {catalogNote}
      {layerNote}
    </div>
  )
}
