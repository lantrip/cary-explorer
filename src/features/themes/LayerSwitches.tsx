// Advanced layer switches, grouped by active theme. Secondary: the app works without ever opening them.
import { useAppStore } from '../../store/useAppStore'
import { useLayerSelection } from '../places/useFilteredPlaces'
import { LAYER_LABEL, layersOfTheme } from './layerSelection'
import { THEMES } from './themes'

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link focus-visible:ring-offset-1'

export const LAYER_PANEL_ID = 'layer-switches'

export function LayerSwitches() {
  const activeThemes = useAppStore((s) => s.activeThemes)
  const overrides = useAppStore((s) => s.layerOverrides)
  const setLayer = useAppStore((s) => s.setLayer)
  const resetLayers = useAppStore((s) => s.resetLayers)
  const selection = useLayerSelection()
  const themes = THEMES.filter((t) => activeThemes.includes(t.id))
  const customised = Object.keys(overrides).length > 0

  return (
    <div id={LAYER_PANEL_ID} className="mt-2 max-h-[40vh] overflow-y-auto rounded-card border border-line bg-white p-3 text-ink md:max-h-none">
      {themes.length === 0 ? (
        <p className="text-sm text-ink-muted">Turn on a theme to choose its layers.</p>
      ) : (
        <div className="space-y-3">
          {themes.map((theme) => (
            <div key={theme.id} role="group" aria-label={`${theme.label} layers`}>
              <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.color }} />
                {theme.label}
              </p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {layersOfTheme(theme.id).map((id) => {
                  const on = selection.includes(id)
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setLayer(id, !on)}
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
                        {LAYER_LABEL[id]}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
      {customised && (
        <button
          type="button"
          onClick={resetLayers}
          className={`mt-2 inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-link hover:bg-subtle ${focusRing}`}
        >
          Reset layers
        </button>
      )}
    </div>
  )
}
