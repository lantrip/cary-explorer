// Desktop (md+) left side panel: title, search, theme filters, view toggle and body. Collapsible to a floating "Places" button.
import { useEffect, useRef } from 'react'
import { CreditsButton } from '../about/CreditsButton'
import { CategoryIcon } from '../themes/CategoryIcon'
import { SearchBox } from '../search/SearchBox'
import { ThemeFilter } from '../themes/ThemeFilter'
import { TownFilter } from '../towns/TownFilter'
import { DESKTOP_PANEL_ID, DESKTOP_PANEL_WIDTH } from '../../lib/layout'
import { useAppStore } from '../../store/useAppStore'
import { PanelBody } from './PanelBody'
import { ViewToggle } from './ViewToggle'

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'

function PanelIcon({ collapse }: { collapse: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      {/* Arrow points out of the panel when collapsing, into it when showing. */}
      <path d={collapse ? 'm16 15-3-3 3-3' : 'm14 9 3 3-3 3'} />
    </svg>
  )
}

export function DesktopPanel() {
  const collapsed = useAppStore((s) => s.panelCollapsed)
  const setCollapsed = useAppStore((s) => s.setPanelCollapsed)
  const collapseRef = useRef<HTMLButtonElement>(null)
  const showRef = useRef<HTMLButtonElement>(null)
  const mounted = useRef(false)

  // Move focus to the control that replaces the one just used; skipped on first render.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    ;(collapsed ? showRef : collapseRef).current?.focus({ preventScroll: true })
  }, [collapsed])

  return (
    <>
      <aside
        id={DESKTOP_PANEL_ID}
        aria-label="Explore places"
        aria-hidden={collapsed || undefined}
        inert={collapsed}
        className="absolute inset-y-0 left-0 z-20 flex flex-col border-r border-line bg-panel shadow-lg transition-transform duration-[220ms] ease-in-out"
        style={{ width: DESKTOP_PANEL_WIDTH, transform: collapsed ? 'translateX(-100%)' : 'translateX(0)' }}
      >
        {/* Header and body share one scroll area: with Layers or Amenities open (or on a short window) the header
            alone can exceed the panel height, and a fixed header would clip it and squeeze the list to nothing.
            The search stays pinned at the top while the rest scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex items-center gap-3 px-6 pt-6 pb-2">
            <span
              aria-hidden="true"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-forest"
            >
              <CategoryIcon category="park" size={20} color="#FFFFFF" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[22px] leading-tight font-semibold text-ink">Cary Explorer</h1>
              <p className="text-[13px] leading-snug text-ink-muted">
                A field guide to parks, trails, birds, water and history
              </p>
            </div>
            <button
              ref={collapseRef}
              type="button"
              aria-label="Collapse panel"
              aria-expanded={!collapsed}
              aria-controls={DESKTOP_PANEL_ID}
              onClick={() => setCollapsed(true)}
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-forest hover:bg-subtle ${focusRing}`}
            >
              <PanelIcon collapse />
            </button>
          </div>
          <div data-pinned className="sticky top-0 z-20 bg-panel px-6 pt-3 pb-2.5">
            <SearchBox />
          </div>
          <div className="relative z-10 flex flex-col gap-5 border-b border-line px-6 pt-2.5 pb-5">
            <TownFilter />
            <ThemeFilter />
            <ViewToggle />
          </div>
          <div className="px-6 pt-5 pb-6">
            <PanelBody />
          </div>
        </div>
        {/* Footer entry point; while the panel is collapsed (inert) a floating button below takes over. */}
        {!collapsed && (
          <div className="shrink-0 border-t border-line px-3 py-1">
            <CreditsButton variant="text" />
          </div>
        )}
      </aside>
      {collapsed && (
        <button
          ref={showRef}
          type="button"
          aria-label="Show panel"
          aria-expanded={false}
          aria-controls={DESKTOP_PANEL_ID}
          onClick={() => setCollapsed(false)}
          className={`absolute top-4 left-4 z-20 inline-flex h-11 items-center gap-2 rounded-control border border-line bg-white px-3 text-sm font-semibold text-forest shadow-md hover:bg-subtle ${focusRing}`}
        >
          <PanelIcon collapse={false} />
          Places
        </button>
      )}
      {collapsed && (
        <div className="absolute bottom-12 left-4 z-20 rounded-control border border-line bg-white shadow-md">
          <CreditsButton variant="text" />
        </div>
      )}
    </>
  )
}
