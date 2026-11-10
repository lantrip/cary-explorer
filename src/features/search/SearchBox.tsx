// Search combobox over the full catalog, limited to active themes, with full ARIA combobox keyboard support.
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { CategoryBadge } from '../themes/CategoryIcon'
import { categoryLabel, getTheme } from '../themes/themes'
import { usePlaces } from '../places/usePlaces'
import { LAYER_IDS, emptyLayersText, resolveLayers, type LayerId } from '../themes/layerSelection'
import { CATEGORY_THEME } from '../themes/themes'
import { TOWNS } from '../towns/coverage'
import type { CategoryId, Place, ThemeId } from '../../types/place'
import { CoordinatePanel } from './CoordinatePanel'
import { COORDINATE_ZOOM, formatPoint, parseCoordinates } from './coordinates'
import { IntentConfirmation, NearPanel, type NearIntent } from './IntentPanels'
import { intentLabel, parseIntent, planCategoryInTown, type Intent } from './intent'
import { useLayerSearch } from './useLayerSearch'
import { usePlaceSearch } from './usePlaceSearch'

const MAX_RESULTS = 8
const ALL_CATEGORIES = Object.keys(CATEGORY_THEME) as CategoryId[]

/** What "Undo" puts back after a "category in town" intent. */
interface AppliedTown {
  text: string
  town: string | null
  prevTown: string | null
  prevThemes: ThemeId[]
  prevLayers: LayerId[]
}

export function SearchBox() {
  const activeThemes = useAppStore((s) => s.activeThemes)
  const query = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId)
  const setView = useAppStore((s) => s.setView)

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const listId = `${baseId}-list`

  const { status, retry, places } = usePlaces()
  const search = usePlaceSearch()
  const town = useAppStore((s) => s.town)
  const placesById = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const intent = useMemo(
    () => (query.trim() ? parseIntent(query, { towns: TOWNS, categories: ALL_CATEGORIES, places, search }) : null),
    [query, places, search],
  )
  const point = useMemo(() => parseCoordinates(query), [query])
  const pointText = point ? `Go to ${formatPoint(point)}` : null
  const intentText = intent ? intentLabel(intent, TOWNS, placesById) : null
  const [applied, setApplied] = useState<AppliedTown | null>(null)
  const [near, setNear] = useState<NearIntent | null>(null)
  // Same selection as the map and list: hidden layers are not searched, but named when they hold the matches.
  const { results, hiddenLayers } = useLayerSearch(query, MAX_RESULTS, true)

  const hasQuery = query.trim() !== ''
  // The suggested intent row is option 0 when the text parses; place results follow it.
  // A parsed coordinate is always option 0 (a point text never parses as an intent, but stay safe).
  const offset = pointText || intentText ? 1 : 0
  const total = results.length + offset
  const expanded = open && total > 0
  const noThemes = activeThemes.length === 0
  // Why the results area is empty. Loading and failure take priority over "No places found".
  const emptyMessage =
    status === 'loading'
      ? 'Loading places…'
      : status === 'error'
        ? "Couldn't load places."
        : noThemes
          ? 'No themes selected'
          : `No places found.${hiddenLayers.length ? ` ${emptyLayersText(hiddenLayers)}` : ''}`
  const showEmpty = hasQuery && total === 0 && (status === 'error' || open)
  const active = Math.min(activeIndex, total - 1)
  const optionId = (i: number) => `${baseId}-opt-${i}`

  function applyIntent(it: Intent) {
    const label = intentText
    setSearchQuery('')
    setOpen(false)
    if (it.kind === 'category-near-place') {
      setApplied(null)
      setNear({ placeId: it.placeId, categoryIds: it.categoryIds })
      return
    }
    setNear(null)
    const state = useAppStore.getState()
    const plan = planCategoryInTown(it, state.activeThemes, state.layerOverrides)
    setApplied({
      text: `${label ?? 'Showing'}`.replace(/^Show /, 'Showing '),
      town: plan.town ?? state.town,
      prevTown: state.town,
      prevThemes: state.activeThemes,
      prevLayers: resolveLayers(state.activeThemes, state.layerOverrides),
    })
    if (plan.town !== null) state.setTown(plan.town)
    if (plan.themesChanged) state.setActiveThemes(plan.themes)
    for (const c of plan.layerChanges) state.setLayer(c.id, c.on)
  }

  function undoTown() {
    if (!applied) return
    const state = useAppStore.getState()
    state.setTown(applied.prevTown)
    state.setActiveThemes(applied.prevThemes)
    const now = resolveLayers(useAppStore.getState().activeThemes, useAppStore.getState().layerOverrides)
    for (const id of LAYER_IDS) {
      if (applied.prevLayers.includes(id) !== now.includes(id)) state.setLayer(id, applied.prevLayers.includes(id))
    }
    setApplied(null)
  }

  function pickPlace(place: Place) {
    setSelectedPlaceId(place.id)
    setSearchQuery('')
    setOpen(false)
    setNear(null)
    setView('map')
  }

  function goToPoint(p: { lat: number; lon: number }) {
    const state = useAppStore.getState()
    setSearchQuery('')
    setOpen(false)
    setNear(null)
    setApplied(null)
    state.setDroppedPin(p)
    state.requestCamera([p.lon, p.lat], COORDINATE_ZOOM)
    setView('map')
  }

  function select(i: number) {
    if (point && pointText && i === 0) return goToPoint(point)
    if (intent && intentText && i === 0) return applyIntent(intent)
    const place = results[i - offset]
    if (place) pickPlace(place)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (total === 0) return
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((Math.max(active, 0) + step + total) % total)
    } else if (e.key === 'Enter') {
      if (expanded) {
        e.preventDefault()
        select(active)
      }
    } else if (e.key === 'Escape') {
      if (expanded) setOpen(false)
      else {
        setSearchQuery('')
        setNear(null)
        useAppStore.getState().setDroppedPin(null)
      }
    }
  }

  return (
    <div>
      {/* Only the input row is the positioning context, so the icon and dropdowns stay with the input. */}
      <div className="relative">
      <label htmlFor={`${baseId}-input`} className="sr-only">
        Search places
      </label>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-ink-muted"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        id={`${baseId}-input`}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optionId(active) : undefined}
        autoComplete="off"
        placeholder="Search parks, trails, creeks…"
        value={query}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          setNear(null)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-control border border-edge bg-ground pr-4 pl-11 text-base text-ink placeholder:text-ink-muted focus:border-forest focus:bg-white focus:shadow-[0_0_0_4px_var(--color-pine-glow)] focus:outline-none"
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!expanded}
        className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-card border border-line bg-white p-1.5 shadow-[0_12px_32px_rgba(31,42,36,0.14)]"
      >
        {(point ? pointText : intentText) && (
          <li
            id={optionId(0)}
            role="option"
            aria-selected={active === 0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(0)}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-3 text-sm font-medium text-forest ${
              active === 0 ? 'bg-forest-tint' : ''
            }`}
          >
            {point ? pointText : intentText}
          </li>
        )}
        {results.map((place, k) => {
          const i = k + offset
          return (
          <li
            key={place.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // Keep focus in the input so the combobox stays active while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select(i)}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control px-3 text-sm ${
              i === active ? 'bg-forest-tint' : ''
            }`}
          >
            <CategoryBadge
              category={place.category}
              color={getTheme(place.theme).color}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{place.name}</span>
              <span className="block truncate text-[13px] text-ink-muted">
                {categoryLabel[place.category]} · {place.municipality}
              </span>
            </span>
          </li>
          )
        })}
      </ul>
      {near && <NearPanel near={near} placesById={placesById} onPick={pickPlace} onClose={() => setNear(null)} />}
      {showEmpty && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 space-y-2 rounded-card border border-line bg-white px-4 py-3 text-sm text-ink-muted shadow-[0_12px_32px_rgba(31,42,36,0.14)]">
          <p>{emptyMessage}</p>
          {status === 'error' && (
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-control border border-forest px-4 text-sm font-semibold text-forest hover:bg-forest-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link"
            >
              Try again
            </button>
          )}
        </div>
      )}
      <div role="status" className="sr-only">
        {!hasQuery
          ? ''
          : total === 0
            ? emptyMessage
            : total === 1
              ? '1 result'
              : `${total} results`}
      </div>
      </div>
      <CoordinatePanel onPick={pickPlace} />
      {applied && town === applied.town && <IntentConfirmation text={applied.text} onUndo={undoTown} />}
    </div>
  )
}
