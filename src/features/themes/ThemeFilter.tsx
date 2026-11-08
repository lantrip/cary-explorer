// Row of toggle chips, one per theme, that show or hide that theme on the map and list.
// Desktop wraps the chips; below md they scroll horizontally (the mobile sheet).
import { useState } from 'react'
import { CHIP } from '../../lib/styles'
import { useAppStore } from '../../store/useAppStore'
import { AMENITY_PANEL_ID, AmenityFilters } from '../places/AmenityFilters'
import { LAYER_PANEL_ID, LayerSwitches } from './LayerSwitches'
import { THEMES } from './themes'

export function ThemeFilter() {
  const activeThemes = useAppStore((s) => s.activeThemes)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const customised = useAppStore((s) => Object.keys(s.layerOverrides).length > 0)
  const amenitiesActive = useAppStore((s) => s.amenityFilters.length > 0)
  const [layersOpen, setLayersOpen] = useState(false)
  const [amenitiesOpen, setAmenitiesOpen] = useState(false)

  return (
    <div>
      <div
        role="group"
        aria-label="Filter by theme"
        className="flex gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
      >
        {THEMES.map((theme) => {
          const pressed = activeThemes.includes(theme.id)
          return (
            <button
              key={theme.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggleTheme(theme.id)}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-1 ${
                pressed ? 'text-ink' : 'border-line bg-white text-ink-muted'
              }`}
              style={pressed ? { backgroundColor: theme.tint, borderColor: theme.color } : undefined}
            >
              {pressed ? (
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={theme.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : (
                <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.color }} />
                </span>
              )}
              {theme.label}
            </button>
          )
        })}
        <button
          type="button"
          aria-expanded={layersOpen}
          aria-controls={layersOpen ? LAYER_PANEL_ID : undefined}
          onClick={() => setLayersOpen((v) => !v)}
          className={CHIP}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M12 3l9 5-9 5-9-5 9-5z" />
            <path d="M3 13l9 5 9-5" />
          </svg>
          Layers
          {customised && <span className="size-2 rounded-full bg-forest" aria-hidden="true" />}
          {customised && <span className="sr-only">(changed)</span>}
        </button>
        <button
          type="button"
          aria-expanded={amenitiesOpen}
          aria-controls={amenitiesOpen ? AMENITY_PANEL_ID : undefined}
          onClick={() => setAmenitiesOpen((v) => !v)}
          className={CHIP}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Amenities
          {amenitiesActive && <span className="size-2 rounded-full bg-forest" aria-hidden="true" />}
          {amenitiesActive && <span className="sr-only">(filters on)</span>}
        </button>
      </div>
      {layersOpen && <LayerSwitches />}
      {amenitiesOpen && <AmenityFilters />}
    </div>
  )
}
